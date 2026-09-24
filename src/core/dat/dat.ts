import { BinaryReader } from '../binary/reader.ts';
import { BinaryWriter } from '../binary/writer.ts';
import type { ClientFeatures } from '../versions.ts';
import { DAT_FORMATS, FLAG_INFO, flagCodec, type FlagName, type ThingFlags } from './flags.ts';
import {
  CATEGORY_KEY,
  FIRST_ID,
  FrameGroupType,
  spriteCount,
  type DatFile,
  type FrameGroup,
  type ThingCategory,
  type ThingType,
} from './types.ts';

const LAST_FLAG = 0xff;

export class DatParseError extends Error {
  constructor(
    message: string,
    readonly offset: number,
    readonly thingId?: number,
    readonly category?: ThingCategory,
  ) {
    super(message);
    this.name = 'DatParseError';
  }
}

export interface DatHeader {
  signature: number;
  itemCount: number;
  outfitCount: number;
  effectCount: number;
  missileCount: number;
}

export function readDatHeader(bytes: Uint8Array): DatHeader {
  const r = new BinaryReader(bytes);
  return {
    signature: r.u32(),
    itemCount: r.u16(),
    outfitCount: r.u16(),
    effectCount: r.u16(),
    missileCount: r.u16(),
  };
}

function readFlags(r: BinaryReader, features: ClientFeatures, id: number, category: ThingCategory): ThingFlags {
  const fmt = DAT_FORMATS[features.datFormat];
  const { byCode } = flagCodec(features.datFormat);
  const flags: Record<string, unknown> = {};
  for (;;) {
    const at = r.pos;
    const code = r.u8();
    if (code === LAST_FLAG) break;
    const name = byCode.get(code);
    if (!name) {
      throw new DatParseError(
        `Unknown flag 0x${code.toString(16).padStart(2, '0')} for ${category} ${id} at offset ${at} (format ${fmt.label}). ` +
          'The file probably belongs to a different client version.',
        at,
        id,
        category,
      );
    }
    switch (FLAG_INFO[name].kind) {
      case 'bool':
        flags[name] = true;
        break;
      case 'u16':
        flags[name] = r.u16();
        break;
      case 'light':
        flags[name] = { level: r.u16(), color: r.u16() };
        break;
      case 'offset':
        flags[name] = fmt.offsetHasData ? { x: r.u16(), y: r.u16() } : { x: 8, y: 8 };
        break;
      case 'market':
        flags[name] = {
          category: r.u16(),
          tradeAs: r.u16(),
          showAs: r.u16(),
          name: r.string(),
          restrictVocation: r.u16(),
          requiredLevel: r.u16(),
        };
        break;
    }
  }
  return flags as ThingFlags;
}

function readFrameGroup(r: BinaryReader, features: ClientFeatures, type: FrameGroupType): FrameGroup {
  const fmt = DAT_FORMATS[features.datFormat];
  const width = r.u8();
  const height = r.u8();
  const exactSize = width > 1 || height > 1 ? r.u8() : 32;
  const layers = r.u8();
  const patternX = r.u8();
  const patternY = r.u8();
  const patternZ = fmt.patternZ ? r.u8() : 1;
  const frames = r.u8();
  const group: FrameGroup = { type, width, height, exactSize, layers, patternX, patternY, patternZ, frames, sprites: [] };
  if (frames > 1 && features.enhancedAnimations) {
    const mode = r.u8();
    const loopCount = r.i32();
    const startFrame = r.i8();
    const durations = [];
    for (let i = 0; i < frames; i++) durations.push({ min: r.u32(), max: r.u32() });
    group.animation = { mode, loopCount, startFrame, durations };
  }
  const n = spriteCount(group);
  const sprites = new Array<number>(n);
  if (features.extended) for (let i = 0; i < n; i++) sprites[i] = r.u32();
  else for (let i = 0; i < n; i++) sprites[i] = r.u16();
  group.sprites = sprites;
  return group;
}

function readThing(r: BinaryReader, features: ClientFeatures, id: number, category: ThingCategory): ThingType {
  const flags = readFlags(r, features, id, category);
  const hasGroups = features.frameGroups && category === 'outfit';
  const groupCount = hasGroups ? r.u8() : 1;
  const groups: FrameGroup[] = [];
  for (let i = 0; i < groupCount; i++) {
    const type = hasGroups ? (r.u8() as FrameGroupType) : FrameGroupType.Idle;
    groups.push(readFrameGroup(r, features, type));
  }
  return { id, category, flags, groups };
}

export interface ReadDatOptions {
  /** Called periodically with (done, total) things. */
  onProgress?: (done: number, total: number) => void;
}

export function readDat(bytes: Uint8Array, features: ClientFeatures, options: ReadDatOptions = {}): DatFile {
  const header = readDatHeader(bytes);
  const r = new BinaryReader(bytes, 12);
  const counts: Record<ThingCategory, number> = {
    item: Math.max(0, header.itemCount - FIRST_ID.item + 1),
    outfit: header.outfitCount,
    effect: header.effectCount,
    missile: header.missileCount,
  };
  const total = counts.item + counts.outfit + counts.effect + counts.missile;
  const dat: DatFile = { signature: header.signature, items: [], outfits: [], effects: [], missiles: [] };
  let done = 0;
  for (const category of ['item', 'outfit', 'effect', 'missile'] as const) {
    const list = dat[CATEGORY_KEY[category]];
    for (let i = 0; i < counts[category]; i++) {
      const id = FIRST_ID[category] + i;
      try {
        list.push(readThing(r, features, id, category));
      } catch (e) {
        if (e instanceof DatParseError) throw e;
        throw new DatParseError(`${(e as Error).message} while reading ${category} ${id}`, r.pos, id, category);
      }
      if (options.onProgress && ++done % 2000 === 0) options.onProgress(done, total);
    }
  }
  if (r.hasMore()) {
    throw new DatParseError(
      `${r.remaining} unexpected trailing bytes after the last object; the client version/features probably do not match this file`,
      r.pos,
    );
  }
  options.onProgress?.(total, total);
  return dat;
}

export interface WriteDatReport {
  /** Flags dropped because the target format cannot represent them. */
  droppedFlags: Map<FlagName, number>;
  /** Things whose sprite ids do not fit u16 (non extended format). */
  spriteOverflow: number;
}

function writeFlags(w: BinaryWriter, flags: ThingFlags, features: ClientFeatures, report: WriteDatReport): void {
  const fmt = DAT_FORMATS[features.datFormat];
  const { byName } = flagCodec(features.datFormat);
  const present: Array<[number, FlagName]> = [];
  for (const key of Object.keys(flags) as FlagName[]) {
    const value = flags[key];
    if (value === undefined || (value as unknown) === false) continue;
    const code = byName.get(key);
    if (code === undefined) {
      report.droppedFlags.set(key, (report.droppedFlags.get(key) ?? 0) + 1);
      continue;
    }
    present.push([code, key]);
  }
  // Flags are written in object key order, which is the order they were read in, so
  // unmodified files round-trip byte for byte (official files are not always sorted).
  for (const [code, name] of present) {
    w.u8(code);
    const v = flags[name] as unknown;
    switch (FLAG_INFO[name].kind) {
      case 'bool':
        break;
      case 'u16':
        w.u16(Number(v) || 0);
        break;
      case 'light': {
        const l = v as { level: number; color: number };
        w.u16(l.level).u16(l.color);
        break;
      }
      case 'offset': {
        const o = v as { x: number; y: number };
        if (fmt.offsetHasData) w.u16(o.x).u16(o.y);
        break;
      }
      case 'market': {
        const m = v as { category: number; tradeAs: number; showAs: number; name: string; restrictVocation: number; requiredLevel: number };
        w.u16(m.category).u16(m.tradeAs).u16(m.showAs).string(m.name).u16(m.restrictVocation).u16(m.requiredLevel);
        break;
      }
    }
  }
  w.u8(LAST_FLAG);
}

function writeFrameGroup(w: BinaryWriter, g: FrameGroup, features: ClientFeatures, report: WriteDatReport): void {
  const fmt = DAT_FORMATS[features.datFormat];
  w.u8(g.width).u8(g.height);
  if (g.width > 1 || g.height > 1) w.u8(g.exactSize);
  w.u8(g.layers).u8(g.patternX).u8(g.patternY);
  if (fmt.patternZ) w.u8(g.patternZ);
  w.u8(g.frames);
  if (g.frames > 1 && features.enhancedAnimations) {
    const a = g.animation ?? { mode: 0, loopCount: 0, startFrame: 0, durations: [] };
    w.u8(a.mode).i32(a.loopCount).i8(a.startFrame);
    for (let i = 0; i < g.frames; i++) {
      const d = a.durations[i] ?? { min: 100, max: 100 };
      w.u32(d.min).u32(d.max);
    }
  }
  const n = spriteCount({ ...g, patternZ: fmt.patternZ ? g.patternZ : 1 });
  for (let i = 0; i < n; i++) {
    const s = g.sprites[i] ?? 0;
    if (features.extended) w.u32(s);
    else {
      if (s > 0xffff) report.spriteOverflow++;
      w.u16(s > 0xffff ? 0 : s);
    }
  }
}

function writeThing(w: BinaryWriter, t: ThingType, features: ClientFeatures, report: WriteDatReport): void {
  writeFlags(w, t.flags, features, report);
  const hasGroups = features.frameGroups && t.category === 'outfit';
  if (hasGroups) {
    w.u8(t.groups.length);
    for (const g of t.groups) {
      w.u8(g.type);
      writeFrameGroup(w, g, features, report);
    }
  } else {
    // Formats without frame groups only store the first (idle) group.
    writeFrameGroup(w, t.groups[0], features, report);
  }
}

export function writeDat(dat: DatFile, features: ClientFeatures, report?: WriteDatReport): Uint8Array {
  const rep = report ?? { droppedFlags: new Map(), spriteOverflow: 0 };
  const w = new BinaryWriter(1 << 20);
  w.u32(dat.signature);
  w.u16(dat.items.length + FIRST_ID.item - 1);
  w.u16(dat.outfits.length);
  w.u16(dat.effects.length);
  w.u16(dat.missiles.length);
  for (const list of [dat.items, dat.outfits, dat.effects, dat.missiles]) {
    for (const t of list) writeThing(w, t, features, rep);
  }
  return w.toBytes();
}

/** Re-number ids so they are contiguous (items from 100, others from 1). */
export function renumber(dat: DatFile): DatFile {
  for (const category of ['item', 'outfit', 'effect', 'missile'] as const) {
    dat[CATEGORY_KEY[category]].forEach((t, i) => {
      t.id = FIRST_ID[category] + i;
      t.category = category;
    });
  }
  return dat;
}
