import { createFrameGroup, FrameGroupType, spriteIndex, type FrameGroup, type ThingCategory, type ThingType } from './dat/types.ts';
import { cropImage, resizeImage, type RgbaImage, type ResizeMode } from './image/image.ts';
import { isEmptySprite, SPRITE_SIZE, type SpriteArchive } from './spr/spr.ts';

/** Stores sprites, optionally keeping high resolution originals (for OTCv8 CWM output). */
export interface SpriteSink {
  spr: SpriteArchive;
  /** High resolution tiles by sprite id. */
  hiRes?: Map<number, RgbaImage>;
  /** Reuse ids of identical sprites (default true). */
  dedupe?: boolean;
  /** Internal hash index for dedupe. */
  index?: Map<string, number>;
}

function hashTile(data: Uint8Array): string {
  // FNV-1a over pixel data; collisions are verified by full compare.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < data.length; i++) {
    h1 = Math.imul(h1 ^ data[i], 0x01000193);
    h2 = Math.imul(h2 ^ data[i], 0x5bd1e995);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

/**
 * Add a 32x32 tile to the sprite archive and return its id (0 for fully transparent tiles).
 * A larger tile (e.g. 64x64) is treated as a high resolution version of one sprite.
 */
export function addTile(sink: SpriteSink, tile: RgbaImage, resize: ResizeMode = 'bilinear'): number {
  const small = tile.width === SPRITE_SIZE && tile.height === SPRITE_SIZE ? tile : resizeImage(tile, SPRITE_SIZE, SPRITE_SIZE, resize);
  if (isEmptySprite(small.data) && isEmptySprite(tile.data)) return 0;
  const hiRes = tile !== small;
  if (sink.dedupe !== false && !hiRes) {
    sink.index ??= new Map();
    const key = hashTile(small.data);
    const existing = sink.index.get(key);
    if (existing !== undefined) {
      const px = sink.spr.getPixels(existing);
      if (px.every((v, i) => v === small.data[i])) return existing;
    }
    const id = sink.spr.add(small.data);
    sink.index.set(key, id);
    return id;
  }
  const id = sink.spr.add(small.data);
  if (hiRes) {
    sink.hiRes ??= new Map();
    sink.hiRes.set(id, tile);
  }
  return id;
}

/**
 * Cut an image into sprite tiles for a thing of `width` x `height` tiles.
 * `tileSize` is the source pixels per tile (32 normally, 64 for 2x high-res art).
 * Returns tiles in dat order (index = h * width + w, (0,0) being bottom-right).
 */
export function sliceTiles(img: RgbaImage, width: number, height: number, tileSize = SPRITE_SIZE): RgbaImage[] {
  const tiles: RgbaImage[] = [];
  // anchor the image at the bottom-right corner, like the client does
  const ox = width * tileSize - img.width;
  const oy = height * tileSize - img.height;
  for (let h = 0; h < height; h++) {
    for (let w = 0; w < width; w++) {
      const x = (width - 1 - w) * tileSize - ox;
      const y = (height - 1 - h) * tileSize - oy;
      tiles.push(cropImage(img, x, y, tileSize, tileSize));
    }
  }
  return tiles;
}

export interface FrameImage {
  image: RgbaImage;
  frame?: number;
  patternX?: number;
  patternY?: number;
  patternZ?: number;
  layer?: number;
}

export interface BuildGroupOptions {
  /** Source pixels per tile (32 or 64 for high-res). */
  tileSize?: number;
  layers?: number;
  patternX?: number;
  patternY?: number;
  patternZ?: number;
  frames?: number;
  type?: FrameGroupType;
  resize?: ResizeMode;
}

/** Build a frame group from images (each positioned by frame/pattern/layer). */
export function buildFrameGroup(sink: SpriteSink, images: FrameImage[], opts: BuildGroupOptions = {}): FrameGroup {
  const tileSize = opts.tileSize ?? SPRITE_SIZE;
  const maxW = Math.max(1, ...images.map((i) => i.image.width));
  const maxH = Math.max(1, ...images.map((i) => i.image.height));
  const width = Math.ceil(maxW / tileSize);
  const height = Math.ceil(maxH / tileSize);
  const g = createFrameGroup({
    type: opts.type ?? FrameGroupType.Idle,
    width,
    height,
    exactSize: Math.min(255, Math.max(width, height) * SPRITE_SIZE),
    layers: opts.layers ?? Math.max(1, ...images.map((i) => (i.layer ?? 0) + 1)),
    patternX: opts.patternX ?? Math.max(1, ...images.map((i) => (i.patternX ?? 0) + 1)),
    patternY: opts.patternY ?? Math.max(1, ...images.map((i) => (i.patternY ?? 0) + 1)),
    patternZ: opts.patternZ ?? Math.max(1, ...images.map((i) => (i.patternZ ?? 0) + 1)),
    frames: opts.frames ?? Math.max(1, ...images.map((i) => (i.frame ?? 0) + 1)),
  });
  for (const fi of images) {
    const tiles = sliceTiles(fi.image, width, height, tileSize);
    for (let h = 0; h < height; h++)
      for (let w = 0; w < width; w++) {
        const id = addTile(sink, tiles[h * width + w], opts.resize);
        g.sprites[spriteIndex(g, w, h, fi.layer ?? 0, fi.patternX ?? 0, fi.patternY ?? 0, fi.patternZ ?? 0, fi.frame ?? 0)] = id;
      }
  }
  if (g.frames > 1) {
    g.animation = { mode: 0, loopCount: 0, startFrame: 0, durations: Array.from({ length: g.frames }, () => ({ min: 300, max: 300 })) };
  }
  return g;
}

/** Import a sprite sheet laid out like {@link renderSheet}: columns = frames x patternX, rows = layers x patternZ x patternY. */
export function importSheet(
  sink: SpriteSink,
  sheet: RgbaImage,
  layout: Pick<FrameGroup, 'width' | 'height' | 'layers' | 'patternX' | 'patternY' | 'patternZ' | 'frames'> & { tileSize?: number },
): FrameGroup {
  const tile = layout.tileSize ?? SPRITE_SIZE;
  const cw = layout.width * tile;
  const ch = layout.height * tile;
  const images: FrameImage[] = [];
  for (let f = 0; f < layout.frames; f++)
    for (let l = 0; l < layout.layers; l++)
      for (let z = 0; z < layout.patternZ; z++)
        for (let y = 0; y < layout.patternY; y++)
          for (let x = 0; x < layout.patternX; x++) {
            const col = f * layout.patternX + x;
            const row = (l * layout.patternZ + z) * layout.patternY + y;
            images.push({ image: cropImage(sheet, col * cw, row * ch, cw, ch), frame: f, layer: l, patternX: x, patternY: y, patternZ: z });
          }
  return buildFrameGroup(sink, images, { ...layout, tileSize: tile });
}

/** Directions in Tibia pattern X order. */
export const DIRECTIONS = ['north', 'east', 'south', 'west'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export interface OutfitFrames {
  /** Images per direction, one per animation frame. */
  frames: Partial<Record<Direction, RgbaImage[]>>;
  /** Optional color template (yellow head / red body / green legs / blue feet) per direction & frame. */
  templates?: Partial<Record<Direction, RgbaImage[]>>;
}

/**
 * Build an outfit from per-direction animation frames.
 * With frameGroups, frame 0 becomes the idle group and the rest the moving group.
 */
export function buildOutfit(
  sink: SpriteSink,
  input: OutfitFrames,
  opts: { tileSize?: number; frameGroups?: boolean; resize?: ResizeMode } = {},
): FrameGroup[] {
  const images: FrameImage[] = [];
  const frameCount = Math.max(1, ...DIRECTIONS.map((d) => input.frames[d]?.length ?? 0));
  DIRECTIONS.forEach((dir, x) => {
    input.frames[dir]?.forEach((image, frame) => images.push({ image, frame, patternX: x, layer: 0 }));
    input.templates?.[dir]?.forEach((image, frame) => images.push({ image, frame, patternX: x, layer: 1 }));
  });
  const layers = input.templates ? 2 : 1;
  const g = buildFrameGroup(sink, images, { tileSize: opts.tileSize, layers, patternX: 4, frames: frameCount, resize: opts.resize });
  if (opts.frameGroups && frameCount > 1) {
    const per = g.width * g.height * g.layers * g.patternX * g.patternY * g.patternZ;
    const idle: FrameGroup = { ...g, type: FrameGroupType.Idle, frames: 1, sprites: g.sprites.slice(0, per) };
    delete idle.animation;
    const moving: FrameGroup = {
      ...g,
      type: FrameGroupType.Moving,
      frames: frameCount - 1,
      sprites: g.sprites.slice(per),
      animation: { mode: 0, loopCount: 0, startFrame: 0, durations: Array.from({ length: frameCount - 1 }, () => ({ min: 100, max: 100 })) },
    };
    if (moving.frames <= 1) delete moving.animation;
    return [idle, moving];
  }
  return [g];
}

/** Legacy outfit naming used by the original e2e script: "<direction><frame>.png". */
export const LEGACY_DIRECTION_DIGITS: Record<string, Direction> = { '1': 'south', '2': 'east', '3': 'west', '4': 'north' };

/** Parse "<direction digit><frame digit>" file names (e.g. 11.png = south, frame 1). */
export function parseLegacyOutfitName(name: string): { direction: Direction; frame: number } | undefined {
  const m = /^(\d)(\d+)\.\w+$/.exec(name.split(/[\\/]/).pop() ?? '');
  if (!m) return undefined;
  const direction = LEGACY_DIRECTION_DIGITS[m[1]];
  if (!direction) return undefined;
  return { direction, frame: Number(m[2]) - 1 };
}

export function newThing(category: ThingCategory, id: number, groups: FrameGroup[]): ThingType {
  return { id, category, flags: {}, groups };
}
