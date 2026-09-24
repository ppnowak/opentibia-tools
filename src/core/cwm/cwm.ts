import { BinaryReader } from '../binary/reader.ts';
import { BinaryWriter } from '../binary/writer.ts';
import type { SpriteArchive } from '../spr/spr.ts';
import { SPRITE_SIZE } from '../spr/spr.ts';
import { encodePng } from '../image/png.ts';
import { resizeImage, type ResizeMode } from '../image/image.ts';

/**
 * Tibia.cwm - OTClientV8 container for high resolution sprites.
 *
 * Layout (little endian):
 *   u8  version (1)
 *   u16 sprite size in pixels (e.g. 64)
 *   u32 file count
 *   file count x { u32 data start (relative to data section), u32 data length, u16 name length, name }
 *   file data, concatenated
 *
 * Files are PNG images named "<sprite id>.png".
 */
export interface CwmEntry {
  name: string;
  data: Uint8Array;
}

export interface CwmFile {
  version: number;
  size: number;
  entries: CwmEntry[];
}

export const CWM_VERSION = 1;

export function readCwm(bytes: Uint8Array): CwmFile {
  const r = new BinaryReader(bytes);
  const version = r.u8();
  if (version !== CWM_VERSION) throw new Error(`Unsupported CWM version ${version}`);
  const size = r.u16();
  const count = r.u32();
  const headers: Array<{ start: number; length: number; name: string }> = [];
  for (let i = 0; i < count; i++) {
    const start = r.u32();
    const length = r.u32();
    const name = r.latin1(r.u16());
    headers.push({ start, length, name });
  }
  const dataStart = r.pos;
  const entries = headers.map((h) => {
    const from = dataStart + h.start;
    if (from + h.length > bytes.length) throw new Error(`CWM entry ${h.name} exceeds file size`);
    return { name: h.name, data: bytes.subarray(from, from + h.length) };
  });
  return { version, size, entries };
}

export function writeCwm(file: Pick<CwmFile, 'size' | 'entries'> & { version?: number }): Uint8Array {
  let dataLength = 0;
  let headerLength = 7;
  for (const e of file.entries) {
    dataLength += e.data.length;
    headerLength += 10 + e.name.length;
  }
  const w = new BinaryWriter(headerLength + dataLength);
  w.u8(file.version ?? CWM_VERSION).u16(file.size).u32(file.entries.length);
  let start = 0;
  for (const e of file.entries) {
    w.u32(start).u32(e.data.length).u16(e.name.length).latin1(e.name);
    start += e.data.length;
  }
  for (const e of file.entries) w.bytes(e.data);
  return w.toBytes();
}

/** Sprite id of a CWM entry name ("123.png" -> 123), or NaN. */
export function cwmSpriteId(name: string): number {
  const m = /^(\d+)\./.exec(name);
  return m ? Number(m[1]) : Number.NaN;
}

export interface SprToCwmOptions {
  /** Output sprite size (64 for 2x). */
  size: number;
  resize?: ResizeMode;
  /** Restrict to these sprite ids (default: all non-empty sprites). */
  ids?: Iterable<number>;
  onProgress?: (done: number, total: number) => void;
}

/** Build an OTCv8 CWM from a sprite archive, upscaling every sprite to options.size. */
export function sprToCwm(spr: SpriteArchive, options: SprToCwmOptions): Uint8Array {
  const ids = options.ids ? [...options.ids] : Array.from({ length: spr.count }, (_, i) => i + 1);
  const entries: CwmEntry[] = [];
  const buf = new Uint8Array(SPRITE_SIZE * SPRITE_SIZE * 4);
  let done = 0;
  for (const id of ids) {
    if (!spr.isEmpty(id)) {
      const px = spr.getPixels(id, buf);
      const img = resizeImage({ width: SPRITE_SIZE, height: SPRITE_SIZE, data: px }, options.size, options.size, options.resize ?? 'nearest');
      entries.push({ name: `${id}.png`, data: encodePng(img) });
    }
    if (options.onProgress && ++done % 1000 === 0) options.onProgress(done, ids.length);
  }
  options.onProgress?.(ids.length, ids.length);
  return writeCwm({ size: options.size, entries });
}
