import { mkdirSync, readdirSync, readFileSync, writeFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { dirname, extname } from 'node:path';
import { decodeBmp, encodeBmp, flattenAlpha, type RgbaImage } from '../core/image/image.ts';
import { decodePng, encodePng } from '../core/image/png.ts';

let jsonMode = false;

/** In JSON mode stdout is reserved for machine readable output, so logs go to stderr. */
export function setJsonMode(on: boolean): void {
  jsonMode = on;
}

export const log = (msg: string): void => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  if (jsonMode) console.error(line);
  else console.log(line);
};

export function readBytes(path: string): Uint8Array {
  const b = readFileSync(path);
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function writeBytes(path: string, data: Uint8Array | Uint8Array[]): void {
  ensureDir(dirname(path));
  if (Array.isArray(data)) {
    const fd = openSync(path, 'w');
    try {
      for (const part of data) writeSync(fd, part);
    } finally {
      closeSync(fd);
    }
  } else writeFileSync(path, data);
}

export function listFiles(dir: string, extensions?: string[]): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && (!extensions || extensions.includes(extname(e.name).toLowerCase())))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function readImage(path: string): RgbaImage {
  const bytes = readBytes(path);
  const ext = extname(path).toLowerCase();
  if (ext === '.bmp') return decodeBmp(bytes);
  if (ext === '.png') return decodePng(bytes);
  throw new Error(`Unsupported image format: ${path} (png and bmp are supported)`);
}

export type ImageFormat = 'png' | 'bmp';

export function writeImage(path: string, img: RgbaImage, format: ImageFormat = extname(path).slice(1) as ImageFormat): void {
  // BMP output keeps the classic Tibia magenta background for transparent pixels.
  writeBytes(path, format === 'bmp' ? encodeBmp(flattenAlpha(img)) : encodePng(img));
}
