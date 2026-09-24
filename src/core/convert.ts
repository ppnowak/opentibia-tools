import { DAT_FORMATS, supportedFlags, type FlagName } from './dat/flags.ts';
import {
  FrameGroupType,
  spriteCount,
  spriteIndex,
  type DatFile,
  type FrameGroup,
  type ThingCategory,
  type ThingType,
} from './dat/types.ts';
import type { ClientFeatures } from './versions.ts';

/** Default frame durations (ms) used when adding enhanced animation data. */
export const DEFAULT_FRAME_DURATION: Record<ThingCategory, number> = {
  item: 500,
  outfit: 300,
  effect: 100,
  missile: 100,
};

export interface ConversionReport {
  droppedFlags: Map<FlagName, number>;
  /** Things whose patternZ had to be reduced to 1. */
  truncatedPatternZ: number;
  /** Outfits whose idle/moving frame groups were merged or split. */
  regroupedOutfits: number;
  /** Sprite ids above 65535 in a non-extended target. */
  spriteOverflow: number;
  warnings: string[];
}

export function emptyReport(): ConversionReport {
  return { droppedFlags: new Map(), truncatedPatternZ: 0, regroupedOutfits: 0, spriteOverflow: 0, warnings: [] };
}

function sameLayout(a: FrameGroup, b: FrameGroup): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.layers === b.layers &&
    a.patternX === b.patternX &&
    a.patternY === b.patternY &&
    a.patternZ === b.patternZ
  );
}

function framesPerSprite(g: FrameGroup): number {
  return g.width * g.height * g.layers * g.patternX * g.patternY * g.patternZ;
}

/** Take a range of frames out of a frame group. */
export function sliceFrames(g: FrameGroup, from: number, count: number, type: FrameGroupType = g.type): FrameGroup {
  const per = framesPerSprite(g);
  const out: FrameGroup = {
    ...g,
    type,
    frames: count,
    sprites: g.sprites.slice(from * per, (from + count) * per),
  };
  if (g.animation) {
    out.animation = { ...g.animation, startFrame: 0, durations: g.animation.durations.slice(from, from + count) };
  }
  if (count <= 1) delete out.animation;
  return out;
}

/** Concatenate frames of two groups with identical layout. */
export function concatFrames(a: FrameGroup, b: FrameGroup, category: ThingCategory): FrameGroup {
  const frames = a.frames + b.frames;
  const out: FrameGroup = { ...a, type: FrameGroupType.Idle, frames, sprites: [...a.sprites, ...b.sprites] };
  const d = DEFAULT_FRAME_DURATION[category];
  const durations = [
    ...(a.animation?.durations ?? Array.from({ length: a.frames }, () => ({ min: d, max: d }))),
    ...(b.animation?.durations ?? Array.from({ length: b.frames }, () => ({ min: d, max: d }))),
  ];
  out.animation = { mode: b.animation?.mode ?? a.animation?.mode ?? 0, loopCount: 0, startFrame: 0, durations };
  return out;
}

function reducePatternZ(g: FrameGroup): FrameGroup {
  const out: FrameGroup = { ...g, patternZ: 1, sprites: [] };
  const n = spriteCount(out);
  out.sprites = new Array(n);
  for (let f = 0; f < g.frames; f++)
    for (let y = 0; y < g.patternY; y++)
      for (let x = 0; x < g.patternX; x++)
        for (let l = 0; l < g.layers; l++)
          for (let h = 0; h < g.height; h++)
            for (let w = 0; w < g.width; w++)
              out.sprites[spriteIndex(out, w, h, l, x, y, 0, f)] = g.sprites[spriteIndex(g, w, h, l, x, y, 0, f)];
  return out;
}

/**
 * Convert one thing between client layouts. The returned thing only uses flags and
 * structures the target can store.
 */
export function convertThing(thing: ThingType, from: ClientFeatures, to: ClientFeatures, report: ConversionReport): ThingType {
  const allowed = new Set(supportedFlags(to.datFormat));
  const flags: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(thing.flags)) {
    if (v === undefined) continue;
    if (allowed.has(k as FlagName)) flags[k] = v;
    else report.droppedFlags.set(k as FlagName, (report.droppedFlags.get(k as FlagName) ?? 0) + 1);
  }
  if (!DAT_FORMATS[to.datFormat].offsetHasData && flags.offset) flags.offset = { x: 8, y: 8 };

  let groups = thing.groups.map((g) => ({ ...g, sprites: g.sprites.slice() }));

  if (thing.category === 'outfit') {
    if (!to.frameGroups && groups.length > 1) {
      // Old clients: frame 0 is the standing pose, following frames are the walk cycle.
      const idle = groups.find((g) => g.type === FrameGroupType.Idle) ?? groups[0];
      const moving = groups.find((g) => g.type === FrameGroupType.Moving);
      if (moving && sameLayout(idle, moving)) groups = [concatFrames(sliceFrames(idle, 0, 1), moving, 'outfit')];
      else groups = [{ ...(moving ?? idle), type: FrameGroupType.Idle }];
      report.regroupedOutfits++;
    } else if (to.frameGroups && !from.frameGroups && groups.length === 1 && groups[0].frames > 1) {
      const g = groups[0];
      groups = [sliceFrames(g, 0, 1, FrameGroupType.Idle), sliceFrames(g, 1, g.frames - 1, FrameGroupType.Moving)];
      report.regroupedOutfits++;
    }
  } else if (groups.length > 1) {
    groups = [groups[0]];
  }

  groups = groups.map((g) => {
    let out = g;
    if (!DAT_FORMATS[to.datFormat].patternZ && out.patternZ > 1) {
      out = reducePatternZ(out);
      report.truncatedPatternZ++;
    }
    if (to.enhancedAnimations && out.frames > 1 && !out.animation) {
      const d = DEFAULT_FRAME_DURATION[thing.category];
      out = { ...out, animation: { mode: 0, loopCount: 0, startFrame: 0, durations: Array.from({ length: out.frames }, () => ({ min: d, max: d })) } };
    }
    if (!to.enhancedAnimations && out.animation) {
      out = { ...out };
      delete out.animation;
    }
    if (!to.extended && out.sprites.some((s) => s > 0xffff)) report.spriteOverflow++;
    return out;
  });

  return { id: thing.id, category: thing.category, flags: flags as ThingType['flags'], groups };
}

/** Convert a whole dat file to another client layout. */
export function convertDat(
  dat: DatFile,
  from: ClientFeatures,
  to: ClientFeatures,
  signature?: number,
): { dat: DatFile; report: ConversionReport } {
  const report = emptyReport();
  const conv = (list: ThingType[]) => list.map((t) => convertThing(t, from, to, report));
  const out: DatFile = {
    signature: signature ?? dat.signature,
    items: conv(dat.items),
    outfits: conv(dat.outfits),
    effects: conv(dat.effects),
    missiles: conv(dat.missiles),
  };
  if (report.spriteOverflow) {
    report.warnings.push(
      `${report.spriteOverflow} frame groups reference sprite ids above 65535, which the target cannot store (enable "extended").`,
    );
  }
  return { dat: out, report };
}
