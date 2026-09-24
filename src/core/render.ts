import type { FrameGroup, ThingType } from './dat/types.ts';
import { spriteIndex } from './dat/types.ts';
import { createImage, type RgbaImage } from './image/image.ts';
import { SPRITE_RGBA_BYTES, SPRITE_SIZE, type SpriteArchive } from './spr/spr.ts';

export interface OutfitColors {
  head: number;
  body: number;
  legs: number;
  feet: number;
}

export interface RenderOptions {
  group?: number;
  frame?: number;
  patternX?: number;
  patternY?: number;
  patternZ?: number;
  /** Layer to draw; 'all' blends every layer (default: layer 0, or colorized outfit when colors are given). */
  layer?: number | 'all';
  /** Colorize outfits using their template layer (layer 1). */
  outfitColors?: OutfitColors;
}

const HSI_SI_VALUES = 7;
const HSI_H_STEPS = 19;
export const OUTFIT_COLOR_COUNT = HSI_SI_VALUES * HSI_H_STEPS;

/** Tibia outfit palette color (0..132) as [r, g, b]. */
export function outfitColor(color: number): [number, number, number] {
  if (color >= HSI_H_STEPS * HSI_SI_VALUES || color < 0) color = 0;
  let loc1 = 0;
  let loc2 = 0;
  let loc3 = 0;
  if (color % HSI_H_STEPS !== 0) {
    loc1 = ((color % HSI_H_STEPS) * 1.0) / 18.0;
    loc2 = 1;
    loc3 = 1;
    switch (Math.floor(color / HSI_H_STEPS)) {
      case 0: loc2 = 0.25; loc3 = 1.0; break;
      case 1: loc2 = 0.25; loc3 = 0.75; break;
      case 2: loc2 = 0.5; loc3 = 0.75; break;
      case 3: loc2 = 0.667; loc3 = 0.75; break;
      case 4: loc2 = 1.0; loc3 = 1.0; break;
      case 5: loc2 = 1.0; loc3 = 0.75; break;
      case 6: loc2 = 1.0; loc3 = 0.5; break;
    }
  } else {
    loc1 = 0;
    loc2 = 0;
    loc3 = 1 - color / HSI_H_STEPS / HSI_SI_VALUES;
  }
  if (loc3 === 0) return [0, 0, 0];
  if (loc2 === 0) {
    const v = Math.floor(loc3 * 255);
    return [v, v, v];
  }
  let r = 0;
  let g = 0;
  let b = 0;
  if (loc1 < 1.0 / 6.0) {
    r = loc3;
    b = loc3 * (1 - loc2);
    g = b + (loc3 - b) * 6 * loc1;
  } else if (loc1 < 2.0 / 6.0) {
    g = loc3;
    b = loc3 * (1 - loc2);
    r = g - (loc3 - b) * (6 * loc1 - 1);
  } else if (loc1 < 3.0 / 6.0) {
    g = loc3;
    r = loc3 * (1 - loc2);
    b = r + (loc3 - r) * (6 * loc1 - 2);
  } else if (loc1 < 4.0 / 6.0) {
    b = loc3;
    r = loc3 * (1 - loc2);
    g = b - (loc3 - r) * (6 * loc1 - 3);
  } else if (loc1 < 5.0 / 6.0) {
    b = loc3;
    g = loc3 * (1 - loc2);
    r = g + (loc3 - g) * (6 * loc1 - 4);
  } else {
    r = loc3;
    g = loc3 * (1 - loc2);
    b = r - (loc3 - g) * (6 * loc1 - 5);
  }
  return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}

function blendPixel(dst: Uint8Array, di: number, r: number, g: number, b: number, a: number): void {
  if (a === 0) return;
  if (a === 255 || dst[di + 3] === 0) {
    dst[di] = r;
    dst[di + 1] = g;
    dst[di + 2] = b;
    dst[di + 3] = a;
    return;
  }
  const sa = a / 255;
  const da = dst[di + 3] / 255;
  const oa = sa + da * (1 - sa);
  dst[di] = Math.round((r * sa + dst[di] * da * (1 - sa)) / oa);
  dst[di + 1] = Math.round((g * sa + dst[di + 1] * da * (1 - sa)) / oa);
  dst[di + 2] = Math.round((b * sa + dst[di + 2] * da * (1 - sa)) / oa);
  dst[di + 3] = Math.round(oa * 255);
}

/** Pixel size of a rendered frame group. */
export function groupPixelSize(g: FrameGroup): { width: number; height: number } {
  return { width: g.width * SPRITE_SIZE, height: g.height * SPRITE_SIZE };
}

/**
 * Render one frame of a thing to RGBA. Sprite (0,0) is the bottom-right tile, as in the
 * client; larger things extend up and to the left.
 */
export function renderThing(thing: ThingType, spr: SpriteArchive, opts: RenderOptions = {}): RgbaImage {
  const g = thing.groups[Math.min(opts.group ?? 0, thing.groups.length - 1)];
  const img = createImage(g.width * SPRITE_SIZE, g.height * SPRITE_SIZE);
  const frame = (opts.frame ?? 0) % Math.max(1, g.frames);
  const px = Math.min(opts.patternX ?? 0, g.patternX - 1);
  const py = Math.min(opts.patternY ?? 0, g.patternY - 1);
  const pz = Math.min(opts.patternZ ?? 0, g.patternZ - 1);
  const colors = opts.outfitColors && g.layers > 1 ? opts.outfitColors : undefined;
  const layers = colors ? [0] : opts.layer === 'all' ? Array.from({ length: g.layers }, (_, i) => i) : [Math.min(opts.layer ?? 0, g.layers - 1)];
  const base = new Uint8Array(SPRITE_RGBA_BYTES);
  const tpl = new Uint8Array(SPRITE_RGBA_BYTES);
  const palette = colors
    ? { head: outfitColor(colors.head), body: outfitColor(colors.body), legs: outfitColor(colors.legs), feet: outfitColor(colors.feet) }
    : undefined;
  for (const layer of layers) {
    for (let h = 0; h < g.height; h++) {
      for (let w = 0; w < g.width; w++) {
        const id = g.sprites[spriteIndex(g, w, h, layer, px, py, pz, frame)] ?? 0;
        if (!id) continue;
        spr.getPixels(id, base);
        let tplLoaded = false;
        if (palette) {
          const tid = g.sprites[spriteIndex(g, w, h, 1, px, py, pz, frame)] ?? 0;
          if (tid) {
            spr.getPixels(tid, tpl);
            tplLoaded = true;
          }
        }
        const ox = (g.width - 1 - w) * SPRITE_SIZE;
        const oy = (g.height - 1 - h) * SPRITE_SIZE;
        for (let y = 0; y < SPRITE_SIZE; y++) {
          for (let x = 0; x < SPRITE_SIZE; x++) {
            const si = (y * SPRITE_SIZE + x) * 4;
            let r = base[si];
            let gg = base[si + 1];
            let b = base[si + 2];
            const a = base[si + 3];
            if (palette && tplLoaded && tpl[si + 3]) {
              const tr = tpl[si];
              const tg = tpl[si + 1];
              const tb = tpl[si + 2];
              let c: [number, number, number] | undefined;
              if (tr && tg && !tb) c = palette.head;
              else if (tr && !tg && !tb) c = palette.body;
              else if (!tr && tg && !tb) c = palette.legs;
              else if (!tr && !tg && tb) c = palette.feet;
              if (c) {
                r = (r * c[0]) / 255;
                gg = (gg * c[1]) / 255;
                b = (b * c[2]) / 255;
              }
            }
            blendPixel(img.data, ((oy + y) * img.width + ox + x) * 4, r, gg, b, a);
          }
        }
      }
    }
  }
  return img;
}

/**
 * Render a sprite sheet of a whole frame group: columns = frames x patternX, rows = patternY x patternZ x layers.
 * Handy for exporting / editing a thing in an external image editor.
 */
export function renderSheet(thing: ThingType, spr: SpriteArchive, group = 0): RgbaImage {
  const g = thing.groups[group];
  const cw = g.width * SPRITE_SIZE;
  const ch = g.height * SPRITE_SIZE;
  const cols = g.patternX * g.frames;
  const rows = g.patternY * g.patternZ * g.layers;
  const sheet = createImage(cols * cw, rows * ch);
  for (let f = 0; f < g.frames; f++)
    for (let l = 0; l < g.layers; l++)
      for (let z = 0; z < g.patternZ; z++)
        for (let y = 0; y < g.patternY; y++)
          for (let x = 0; x < g.patternX; x++) {
            const cell = renderThing(thing, spr, { group, frame: f, patternX: x, patternY: y, patternZ: z, layer: l });
            const col = f * g.patternX + x;
            const row = (l * g.patternZ + z) * g.patternY + y;
            for (let yy = 0; yy < ch; yy++) {
              const src = cell.data.subarray(yy * cw * 4, (yy + 1) * cw * 4);
              sheet.data.set(src, ((row * ch + yy) * sheet.width + col * cw) * 4);
            }
          }
  return sheet;
}
