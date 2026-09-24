import type { ThingFlags } from './flags.ts';

export type ThingCategory = 'item' | 'outfit' | 'effect' | 'missile';

export const CATEGORIES: readonly ThingCategory[] = ['item', 'outfit', 'effect', 'missile'];

/** First id of each category (items start at 100, the rest at 1). */
export const FIRST_ID: Record<ThingCategory, number> = { item: 100, outfit: 1, effect: 1, missile: 1 };

export enum FrameGroupType {
  Idle = 0,
  Moving = 1,
}

export interface FrameDuration {
  min: number;
  max: number;
}

/** Enhanced animation data (10.50+). */
export interface AnimationInfo {
  /** Raw mode byte: 0 = asynchronous, 1 = synchronous. */
  mode: number;
  /** -1 = ping-pong, 0 = infinite, n = loop n times. */
  loopCount: number;
  /** -1 = random start frame. */
  startFrame: number;
  durations: FrameDuration[];
}

export interface FrameGroup {
  type: FrameGroupType;
  width: number;
  height: number;
  /** "Exact size" byte, only stored in files when width or height > 1. */
  exactSize: number;
  layers: number;
  patternX: number;
  patternY: number;
  patternZ: number;
  frames: number;
  animation?: AnimationInfo;
  /** Sprite ids in file order: frame > patternZ > patternY > patternX > layer > height > width. */
  sprites: number[];
}

export interface ThingType {
  id: number;
  category: ThingCategory;
  flags: ThingFlags;
  groups: FrameGroup[];
}

export interface DatFile {
  signature: number;
  items: ThingType[];
  outfits: ThingType[];
  effects: ThingType[];
  missiles: ThingType[];
}

export const CATEGORY_KEY: Record<ThingCategory, 'items' | 'outfits' | 'effects' | 'missiles'> = {
  item: 'items',
  outfit: 'outfits',
  effect: 'effects',
  missile: 'missiles',
};

export function spriteCount(g: Pick<FrameGroup, 'width' | 'height' | 'layers' | 'patternX' | 'patternY' | 'patternZ' | 'frames'>): number {
  return g.width * g.height * g.layers * g.patternX * g.patternY * g.patternZ * g.frames;
}

/** Index of a sprite inside FrameGroup.sprites (mirrors OTClient's getSpriteIndex). */
export function spriteIndex(
  g: FrameGroup,
  w: number,
  h: number,
  layer: number,
  px: number,
  py: number,
  pz: number,
  frame: number,
): number {
  return (
    ((((((frame % g.frames) * g.patternZ + pz) * g.patternY + py) * g.patternX + px) * g.layers + layer) * g.height + h) *
      g.width +
    w
  );
}

export function createFrameGroup(partial: Partial<FrameGroup> = {}): FrameGroup {
  const g: FrameGroup = {
    type: FrameGroupType.Idle,
    width: 1,
    height: 1,
    exactSize: 32,
    layers: 1,
    patternX: 1,
    patternY: 1,
    patternZ: 1,
    frames: 1,
    sprites: [],
    ...partial,
  };
  const n = spriteCount(g);
  if (g.sprites.length !== n) g.sprites = Array.from({ length: n }, (_, i) => g.sprites[i] ?? 0);
  return g;
}

export function createThing(category: ThingCategory, id: number, partial: Partial<ThingType> = {}): ThingType {
  return { id, category, flags: {}, groups: [createFrameGroup()], ...partial };
}

export function cloneThing(t: ThingType): ThingType {
  return structuredClone(t);
}

export type GroupDimensions = Pick<FrameGroup, 'width' | 'height' | 'layers' | 'patternX' | 'patternY' | 'patternZ' | 'frames'>;

/** Change the dimensions of a frame group, keeping sprites at the same coordinates. */
export function resizeFrameGroup(g: FrameGroup, dims: Partial<GroupDimensions>): FrameGroup {
  const next: FrameGroup = { ...g, ...dims, sprites: [] };
  next.sprites = new Array(spriteCount(next)).fill(0);
  for (let f = 0; f < Math.min(g.frames, next.frames); f++)
    for (let z = 0; z < Math.min(g.patternZ, next.patternZ); z++)
      for (let y = 0; y < Math.min(g.patternY, next.patternY); y++)
        for (let x = 0; x < Math.min(g.patternX, next.patternX); x++)
          for (let l = 0; l < Math.min(g.layers, next.layers); l++)
            for (let h = 0; h < Math.min(g.height, next.height); h++)
              for (let w = 0; w < Math.min(g.width, next.width); w++)
                next.sprites[spriteIndex(next, w, h, l, x, y, z, f)] = g.sprites[spriteIndex(g, w, h, l, x, y, z, f)] ?? 0;
  if (next.width > 1 || next.height > 1) {
    if (dims.width !== undefined || dims.height !== undefined) next.exactSize = Math.min(255, Math.max(next.width, next.height) * 32);
  } else next.exactSize = 32;
  if (next.frames > 1) {
    const prev = g.animation?.durations ?? [];
    const last = prev[prev.length - 1] ?? { min: 100, max: 100 };
    next.animation = {
      mode: g.animation?.mode ?? 0,
      loopCount: g.animation?.loopCount ?? 0,
      startFrame: Math.min(g.animation?.startFrame ?? 0, next.frames - 1),
      durations: Array.from({ length: next.frames }, (_, i) => prev[i] ?? { ...last }),
    };
  } else delete next.animation;
  return next;
}
