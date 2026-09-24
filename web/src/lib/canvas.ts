import type { ThingType } from '../../../src/core/dat/types.ts';
import type { RgbaImage } from '../../../src/core/image/image.ts';
import type { Project } from '../../../src/core/project.ts';
import { renderThing, type RenderOptions } from '../../../src/core/render.ts';
import { SPRITE_RGBA_BYTES, SPRITE_SIZE } from '../../../src/core/spr/spr.ts';

export function toImageData(img: RgbaImage): ImageData {
  return new ImageData(new Uint8ClampedArray(img.data.buffer as ArrayBuffer, img.data.byteOffset, img.data.byteLength), img.width, img.height);
}

/** Draw an RGBA image onto a canvas, resizing the canvas to fit it scaled by `zoom`. */
export function paint(canvas: HTMLCanvasElement, img: RgbaImage, zoom = 1): void {
  const src = document.createElement('canvas');
  src.width = img.width;
  src.height = img.height;
  src.getContext('2d')!.putImageData(toImageData(img), 0, 0);
  canvas.width = img.width * zoom;
  canvas.height = img.height * zoom;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
}

/** Draw an image into a fixed size box (downscaling large things, keeping pixels crisp). */
export function paintFit(canvas: HTMLCanvasElement, img: RgbaImage, box: number): void {
  const scale = Math.min(1, box / Math.max(img.width, img.height)) * (img.width <= box / 2 && img.height <= box / 2 ? 2 : 1);
  const src = document.createElement('canvas');
  src.width = img.width;
  src.height = img.height;
  src.getContext('2d')!.putImageData(toImageData(img), 0, 0);
  canvas.width = box;
  canvas.height = box;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.clearRect(0, 0, box, box);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(src, Math.round((box - w) / 2), Math.round((box - h) / 2), w, h);
}

// Thumbnails are cached per thing object: edits replace the object, so stale entries are
// dropped automatically. Sprite pixel edits bump `spriteRev`, which invalidates the cache.
const thumbCache = new WeakMap<ThingType, { rev: number; img: RgbaImage }>();

export function thingThumbnail(project: Project, thing: ThingType, spriteRev: number): RgbaImage {
  const hit = thumbCache.get(thing);
  if (hit && hit.rev === spriteRev) return hit.img;
  const opts: RenderOptions = {};
  if (thing.category === 'outfit') {
    opts.patternX = 2; // facing south
    opts.outfitColors = { head: 78, body: 69, legs: 58, feet: 76 };
  }
  const img = renderThing(thing, project.spr, opts);
  thumbCache.set(thing, { rev: spriteRev, img });
  return img;
}

export function spriteImage(project: Project, id: number): RgbaImage {
  return { width: SPRITE_SIZE, height: SPRITE_SIZE, data: project.spr.getPixels(id, new Uint8Array(SPRITE_RGBA_BYTES)) };
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/png'));
}
