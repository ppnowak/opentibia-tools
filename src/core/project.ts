import { addTile, buildFrameGroup, type FrameImage, type SpriteSink } from './builder.ts';
import { convertDat, convertThing, emptyReport, type ConversionReport } from './convert.ts';
import { cwmSpriteId, readCwm, writeCwm, type CwmEntry } from './cwm/cwm.ts';
import { readDat, writeDat, type WriteDatReport } from './dat/dat.ts';
import {
  CATEGORY_KEY,
  createFrameGroup,
  FIRST_ID,
  type DatFile,
  type FrameGroup,
  type ThingCategory,
  type ThingType,
} from './dat/types.ts';
import { detectClient } from './detect.ts';
import { decodePng, encodePng } from './image/png.ts';
import { resizeImage, type RgbaImage, type ResizeMode } from './image/image.ts';
import { signatureFor } from './signatures.ts';
import { SPRITE_SIZE, SpriteArchive } from './spr/spr.ts';
import { featuresFor, getVersion, versionLabel, versionsBySignature, type ClientFeatures } from './versions.ts';

export interface OpenOptions {
  /** Client version (e.g. 860). Omit to auto-detect. */
  version?: number;
  /** Override individual layout features. */
  features?: Partial<ClientFeatures>;
}

export interface CompileOptions {
  /** Target client version; defaults to the project's version. */
  version?: number;
  features?: Partial<ClientFeatures>;
  /** Override output signatures (defaults: known signatures of the target version, else current ones). */
  datSignature?: number;
  sprSignature?: number;
}

export interface CwmBuildOptions {
  /** Output sprite size in pixels (default: size of the loaded cwm, 64). */
  size?: number;
  resize?: ResizeMode;
  /** Only include sprites that have a high-res version. */
  onlyHiRes?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export interface CompileResult {
  dat: Uint8Array;
  /** spr file in chunks (concatenate or wrap in a Blob). */
  spr: Uint8Array[];
  report: ConversionReport;
  features: ClientFeatures;
  version: number;
}

/** A loaded client (dat + spr) with editing helpers, shared by the CLI and the web app. */
export class Project {
  version: number;
  features: ClientFeatures;
  dat: DatFile;
  spr: SpriteArchive;
  /** High resolution sprites (OTCv8 .cwm) by sprite id. PNG bytes are decoded lazily. */
  hiRes = new Map<number, RgbaImage | Uint8Array>();
  hiResSize = 64;
  /** Set when auto-detection found several layouts that parse the dat file. */
  ambiguous = false;

  constructor(version: number, features: ClientFeatures, dat: DatFile, spr: SpriteArchive) {
    this.version = version;
    this.features = features;
    this.dat = dat;
    this.spr = spr;
  }

  get label(): string {
    return versionLabel(this.version);
  }

  /** Other versions whose files carry the same dat signature (same layout). */
  get sameSignatureVersions(): number[] {
    return versionsBySignature(this.dat.signature, 'dat').filter((v) => v !== this.version);
  }

  static open(datBytes: Uint8Array, sprBytes: Uint8Array, opts: OpenOptions = {}): Project {
    let version: number;
    let features: ClientFeatures;
    let dat: DatFile;
    let ambiguous = false;
    if (opts.version) {
      version = opts.version;
      features = getVersion(version, opts.features).features;
      try {
        dat = readDat(datBytes, features);
      } catch (e) {
        // Explicit feature overrides are respected as-is; otherwise probe other layouts,
        // since many published packs do not match their label (e.g. converted clients).
        if (opts.features && Object.keys(opts.features).length) throw e;
        const d = detectClient(datBytes, sprBytes, version);
        features = d.features;
        dat = d.dat ?? readDat(datBytes, features);
        ambiguous = d.alternatives.length > 0;
      }
    } else {
      const d = detectClient(datBytes, sprBytes);
      version = d.version;
      features = { ...d.features, ...opts.features };
      dat = d.dat && !opts.features ? d.dat : readDat(datBytes, features);
      ambiguous = d.alternatives.length > 0;
    }
    const spr = SpriteArchive.load(sprBytes, { extended: features.extended, transparency: features.transparency });
    const project = new Project(version, features, dat, spr);
    project.ambiguous = ambiguous;
    return project;
  }

  /** New empty client for a version. */
  static create(version: number, features?: Partial<ClientFeatures>): Project {
    const v = getVersion(version, features);
    const sig = signatureFor(version) ?? { dat: 0, spr: 0 };
    const dat: DatFile = { signature: sig.dat, items: [], outfits: [], effects: [], missiles: [] };
    const spr = SpriteArchive.create(sig.spr, { extended: v.features.extended, transparency: v.features.transparency });
    return new Project(version, v.features, dat, spr);
  }

  list(category: ThingCategory): ThingType[] {
    return this.dat[CATEGORY_KEY[category]];
  }

  get(category: ThingCategory, id: number): ThingType | undefined {
    return this.list(category)[id - FIRST_ID[category]];
  }

  counts(): Record<ThingCategory, number> {
    return {
      item: this.dat.items.length,
      outfit: this.dat.outfits.length,
      effect: this.dat.effects.length,
      missile: this.dat.missiles.length,
    };
  }

  /** Append a thing and return it (its id is the next free one). */
  add(category: ThingCategory, init: Partial<Pick<ThingType, 'flags' | 'groups'>> = {}): ThingType {
    const list = this.list(category);
    const thing: ThingType = {
      id: FIRST_ID[category] + list.length,
      category,
      flags: init.flags ?? {},
      groups: init.groups ?? [createFrameGroup()],
    };
    list.push(thing);
    return thing;
  }

  replace(thing: ThingType): void {
    const list = this.list(thing.category);
    const idx = thing.id - FIRST_ID[thing.category];
    if (idx < 0 || idx >= list.length) throw new Error(`${thing.category} ${thing.id} does not exist`);
    list[idx] = thing;
  }

  /**
   * Remove a thing. Removing the last one shrinks the list; removing any other one
   * replaces it with an empty thing so the ids of following things stay stable.
   */
  remove(category: ThingCategory, id: number): void {
    const list = this.list(category);
    const idx = id - FIRST_ID[category];
    if (idx === list.length - 1) list.pop();
    else if (idx >= 0 && idx < list.length) list[idx] = { id, category, flags: {}, groups: [createFrameGroup()] };
  }

  duplicate(category: ThingCategory, id: number): ThingType {
    const src = this.get(category, id);
    if (!src) throw new Error(`${category} ${id} does not exist`);
    return this.add(category, structuredClone({ flags: src.flags, groups: src.groups }));
  }

  private sinkState?: SpriteSink;

  private sink(): SpriteSink {
    if (!this.sinkState || this.sinkState.spr !== this.spr) {
      this.sinkState = { spr: this.spr, hiRes: this.hiRes as Map<number, RgbaImage>, dedupe: true };
    }
    return this.sinkState;
  }

  /** Create a frame group from images, adding their sprites to the archive. */
  buildGroup(images: FrameImage[], opts: Parameters<typeof buildFrameGroup>[2] = {}): FrameGroup {
    return buildFrameGroup(this.sink(), images, opts);
  }

  /** Replace a sprite with an image (any size; larger images are kept as high-res versions). */
  setSpriteImage(id: number, img: RgbaImage, resize: ResizeMode = 'bilinear'): void {
    const small = img.width === SPRITE_SIZE && img.height === SPRITE_SIZE ? img : resizeImage(img, SPRITE_SIZE, SPRITE_SIZE, resize);
    this.spr.setPixels(id, small.data);
    if (img !== small) this.hiRes.set(id, img);
    else this.hiRes.delete(id);
  }

  /** Add an image as a new sprite (larger images keep a high-res copy); returns the sprite id or 0 when fully transparent. */
  addSpriteImage(img: RgbaImage, resize: ResizeMode = 'bilinear'): number {
    return addTile(this.sink(), img, resize);
  }

  /** High-res version of a sprite (if any), decoding stored PNG data on demand. */
  getHiRes(id: number): RgbaImage | undefined {
    const v = this.hiRes.get(id);
    if (!v) return undefined;
    if (v instanceof Uint8Array) {
      const img = decodePng(v);
      this.hiRes.set(id, img);
      return img;
    }
    return v;
  }

  /** Load an OTCv8 .cwm file as high-res sprites. */
  loadCwm(bytes: Uint8Array): number {
    const cwm = readCwm(bytes);
    this.hiResSize = cwm.size;
    let n = 0;
    for (const e of cwm.entries) {
      const id = cwmSpriteId(e.name);
      if (Number.isNaN(id)) continue;
      this.hiRes.set(id, e.data);
      n++;
    }
    return n;
  }

  private *cwmEntries(opts: CwmBuildOptions, out: CwmEntry[]): Generator<number> {
    const size = opts.size ?? this.hiResSize;
    const total = this.spr.count;
    for (let id = 1; id <= total; id++) {
      const hi = this.hiRes.get(id);
      if (hi instanceof Uint8Array && this.hiResSize === size) {
        out.push({ name: `${id}.png`, data: hi });
      } else if (hi) {
        const img = this.getHiRes(id)!;
        const scaled = img.width === size && img.height === size ? img : resizeImage(img, size, size, opts.resize ?? 'bilinear');
        out.push({ name: `${id}.png`, data: encodePng(scaled) });
      } else if (!opts.onlyHiRes && !this.spr.isEmpty(id)) {
        const img = resizeImage({ width: SPRITE_SIZE, height: SPRITE_SIZE, data: this.spr.getPixels(id) }, size, size, opts.resize ?? 'nearest');
        out.push({ name: `${id}.png`, data: encodePng(img) });
      }
      if (id % 500 === 0) yield id;
    }
  }

  /**
   * Build an OTCv8 .cwm. Sprites with a high-res version use it; the rest are upscaled
   * from the spr (unless onlyHiRes is set).
   */
  buildCwm(opts: CwmBuildOptions = {}): Uint8Array {
    const entries: CwmEntry[] = [];
    for (const done of this.cwmEntries(opts, entries)) opts.onProgress?.(done, this.spr.count);
    return writeCwm({ size: opts.size ?? this.hiResSize, entries });
  }

  /** Same as {@link buildCwm} but awaits the progress callback, letting a UI stay responsive. */
  async buildCwmAsync(opts: Omit<CwmBuildOptions, 'onProgress'> & { onProgress?: (done: number, total: number) => Promise<void> | void } = {}): Promise<Uint8Array> {
    const entries: CwmEntry[] = [];
    for (const done of this.cwmEntries(opts, entries)) await opts.onProgress?.(done, this.spr.count);
    return writeCwm({ size: opts.size ?? this.hiResSize, entries });
  }

  /** Copy a thing (and its sprites) from another project, converting it to this project's layout. */
  importThing(source: Project, thing: ThingType, category: ThingCategory = thing.category): { thing: ThingType; report: ConversionReport } {
    const report = emptyReport();
    const converted = convertThing(structuredClone(thing), source.features, this.features, report);
    const map = new Map<number, number>();
    const sink = this.sink();
    for (const g of converted.groups) {
      g.sprites = g.sprites.map((sid) => {
        if (!sid) return 0;
        let nid = map.get(sid);
        if (nid === undefined) {
          const hi = source.getHiRes(sid);
          const px = source.spr.getPixels(sid);
          if (hi) {
            nid = this.spr.add(px);
            this.hiRes.set(nid, hi);
          } else {
            nid = addTile(sink, { width: SPRITE_SIZE, height: SPRITE_SIZE, data: px });
          }
          map.set(sid, nid);
        }
        return nid;
      });
    }
    const added = this.add(category, { flags: converted.flags, groups: converted.groups });
    return { thing: added, report };
  }

  /** Serialize to dat + spr, optionally converting to another client version/layout. */
  compile(opts: CompileOptions = {}): CompileResult {
    const version = opts.version ?? this.version;
    const target: ClientFeatures =
      opts.version && opts.version !== this.version
        ? { ...featuresFor(version), transparency: this.features.transparency, ...opts.features }
        : { ...this.features, ...opts.features };
    const known = signatureFor(version);
    const sameVersion = version === this.version;
    const datSignature = opts.datSignature ?? (sameVersion ? this.dat.signature : (known?.dat ?? this.dat.signature));
    const sprSignature = opts.sprSignature ?? (sameVersion ? this.spr.signature : (known?.spr ?? this.spr.signature));
    const { dat, report } = convertDat(this.dat, this.features, target, datSignature);
    const writeReport: WriteDatReport = { droppedFlags: report.droppedFlags, spriteOverflow: 0 };
    const datBytes = writeDat(dat, target, writeReport);
    if (!target.extended && this.spr.count > 0xffff) {
      throw new Error(`The project has ${this.spr.count} sprites; version ${versionLabel(version)} without "extended" supports at most 65535.`);
    }
    const prevSig = this.spr.signature;
    this.spr.signature = sprSignature;
    try {
      const spr = this.spr.writeParts({ extended: target.extended, transparency: target.transparency });
      return { dat: datBytes, spr, report, features: target, version };
    } finally {
      this.spr.signature = prevSig;
    }
  }
}
