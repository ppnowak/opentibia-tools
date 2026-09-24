import { BinaryReader } from '../binary/reader.ts';
import { BinaryWriter, concatBytes } from '../binary/writer.ts';

export const SPRITE_SIZE = 32;
export const SPRITE_PIXELS = SPRITE_SIZE * SPRITE_SIZE;
export const SPRITE_RGBA_BYTES = SPRITE_PIXELS * 4;

export interface SprOptions {
  /** u32 sprite count (9.60+) instead of u16. */
  extended: boolean;
  /** Pixels carry an alpha byte (OTClient custom feature). */
  transparency: boolean;
}

export interface SprHeader {
  signature: number;
  count: number;
  /** Byte offset of the offsets table. */
  tableOffset: number;
}

export function readSprHeader(bytes: Uint8Array, extended: boolean): SprHeader {
  const r = new BinaryReader(bytes);
  const signature = r.u32();
  const count = extended ? r.u32() : r.u16();
  return { signature, count, tableOffset: r.pos };
}

/**
 * Decode a sprite record (as stored at the sprite's offset: 3 byte color key, u16 size,
 * RLE data) into 32x32 RGBA pixels.
 */
export function decodeSprite(record: Uint8Array, transparency: boolean, out?: Uint8Array): Uint8Array {
  const rgba = out ?? new Uint8Array(SPRITE_RGBA_BYTES);
  if (out) rgba.fill(0);
  if (record.length < 5) return rgba;
  const size = record[3] | (record[4] << 8);
  const end = Math.min(record.length, 5 + size);
  const channels = transparency ? 4 : 3;
  let p = 5;
  let write = 0;
  while (p + 4 <= end && write < SPRITE_RGBA_BYTES) {
    const transparent = record[p] | (record[p + 1] << 8);
    const colored = record[p + 2] | (record[p + 3] << 8);
    p += 4;
    write += transparent * 4;
    for (let i = 0; i < colored && write < SPRITE_RGBA_BYTES && p + channels <= end; i++) {
      rgba[write] = record[p];
      rgba[write + 1] = record[p + 1];
      rgba[write + 2] = record[p + 2];
      rgba[write + 3] = transparency ? record[p + 3] : 0xff;
      p += channels;
      write += 4;
    }
  }
  return rgba;
}

/** Magenta, the color key used by the official client. */
export const DEFAULT_COLOR_KEY: readonly [number, number, number] = [0xff, 0x00, 0xff];

/**
 * Encode 32x32 RGBA pixels into a sprite record. Pixels with alpha 0 are transparent; when
 * the target has no alpha channel every other pixel is written as opaque.
 * Returns null for a fully transparent sprite (stored as offset 0).
 */
export function encodeSprite(
  rgba: Uint8Array,
  transparency: boolean,
  colorKey: readonly [number, number, number] = DEFAULT_COLOR_KEY,
): Uint8Array | null {
  if (rgba.length !== SPRITE_RGBA_BYTES) throw new Error(`Sprite must be ${SPRITE_SIZE}x${SPRITE_SIZE} RGBA`);
  const w = new BinaryWriter(5 + SPRITE_PIXELS * 5);
  w.u8(colorKey[0]).u8(colorKey[1]).u8(colorKey[2]).u16(0);
  let i = 0;
  let any = false;
  while (i < SPRITE_PIXELS) {
    let transparent = 0;
    while (i < SPRITE_PIXELS && rgba[i * 4 + 3] === 0) {
      transparent++;
      i++;
    }
    if (i >= SPRITE_PIXELS) break; // trailing transparent pixels are implicit
    any = true;
    let colored = 0;
    while (i + colored < SPRITE_PIXELS && rgba[(i + colored) * 4 + 3] !== 0) colored++;
    w.u16(transparent).u16(colored);
    for (let k = 0; k < colored; k++, i++) {
      const o = i * 4;
      w.u8(rgba[o]).u8(rgba[o + 1]).u8(rgba[o + 2]);
      if (transparency) w.u8(rgba[o + 3]);
    }
  }
  if (!any) return null;
  const bytes = w.toBytes();
  const size = bytes.length - 5;
  bytes[3] = size & 0xff;
  bytes[4] = (size >> 8) & 0xff;
  return bytes;
}

export function isEmptySprite(rgba: Uint8Array): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 0) return false;
  return true;
}

/**
 * In-memory Tibia.spr archive. Unchanged sprites keep their original encoded bytes, so
 * saving is fast and lossless; edited/added sprites are stored as new records.
 */
export class SpriteArchive {
  signature: number;
  options: SprOptions;
  private base: Uint8Array;
  private baseOffsets: Uint32Array;
  private baseCount: number;
  private overrides = new Map<number, Uint8Array | null>();
  private _count: number;

  private constructor(base: Uint8Array, header: SprHeader, options: SprOptions) {
    this.base = base;
    this.signature = header.signature;
    this.options = { ...options };
    this.baseCount = header.count;
    this._count = header.count;
    const table = header.tableOffset;
    if (table + header.count * 4 > base.length) {
      throw new Error(
        `Sprite table (${header.count} entries) exceeds file size; check the "extended" option for this client version`,
      );
    }
    const dv = new DataView(base.buffer, base.byteOffset, base.byteLength);
    this.baseOffsets = new Uint32Array(header.count);
    for (let i = 0; i < header.count; i++) this.baseOffsets[i] = dv.getUint32(table + i * 4, true);
  }

  static load(bytes: Uint8Array, options: SprOptions): SpriteArchive {
    return new SpriteArchive(bytes, readSprHeader(bytes, options.extended), options);
  }

  static create(signature: number, options: SprOptions): SpriteArchive {
    const w = new BinaryWriter(8).u32(signature);
    if (options.extended) w.u32(0);
    else w.u16(0);
    return SpriteArchive.load(w.toBytes(), options);
  }

  /** Highest sprite id. */
  get count(): number {
    return this._count;
  }

  has(id: number): boolean {
    return id >= 1 && id <= this._count;
  }

  /** Raw encoded record of a sprite (null = empty). */
  getRecord(id: number): Uint8Array | null {
    if (!this.has(id)) return null;
    if (this.overrides.has(id)) return this.overrides.get(id) ?? null;
    if (id > this.baseCount) return null;
    const offset = this.baseOffsets[id - 1];
    if (offset === 0 || offset + 5 > this.base.length) return null;
    const size = this.base[offset + 3] | (this.base[offset + 4] << 8);
    return this.base.subarray(offset, Math.min(this.base.length, offset + 5 + size));
  }

  isEmpty(id: number): boolean {
    return this.getRecord(id) === null;
  }

  getPixels(id: number, out?: Uint8Array): Uint8Array {
    const rec = this.getRecord(id);
    if (!rec) {
      if (out) {
        out.fill(0);
        return out;
      }
      return new Uint8Array(SPRITE_RGBA_BYTES);
    }
    return decodeSprite(rec, this.options.transparency, out);
  }

  setPixels(id: number, rgba: Uint8Array): void {
    if (id < 1) throw new Error('Sprite ids start at 1');
    if (id > this._count) this._count = id;
    this.overrides.set(id, encodeSprite(rgba, this.options.transparency));
  }

  /** Append a sprite and return its id. */
  add(rgba: Uint8Array): number {
    const id = this._count + 1;
    this.setPixels(id, rgba);
    return id;
  }

  /** Append an already encoded record (must match this archive's transparency option). */
  addRecord(record: Uint8Array | null): number {
    const id = ++this._count;
    this.overrides.set(id, record);
    return id;
  }

  clear(id: number): void {
    if (this.has(id)) this.overrides.set(id, null);
  }

  /** Change the number of sprite slots (shrinking drops sprites above the new count). */
  resize(count: number): void {
    for (const id of [...this.overrides.keys()]) if (id > count) this.overrides.delete(id);
    this._count = count;
  }

  get modified(): boolean {
    return this.overrides.size > 0 || this._count !== this.baseCount;
  }

  /**
   * Serialize to file chunks. Unchanged records are views into the original buffer, so
   * the result can be written/streamed or wrapped in a Blob without copying.
   */
  writeParts(options: Partial<SprOptions> = {}): Uint8Array[] {
    const opts = { ...this.options, ...options };
    const reencode = opts.transparency !== this.options.transparency;
    if (!opts.extended && this._count > 0xffff) {
      throw new Error(`${this._count} sprites do not fit a non-extended spr file (max 65535)`);
    }
    const headerSize = 4 + (opts.extended ? 4 : 2);
    const head = new BinaryWriter(headerSize + this._count * 4);
    head.u32(this.signature);
    if (opts.extended) head.u32(this._count);
    else head.u16(this._count);
    const tableStart = head.pos;
    for (let i = 0; i < this._count; i++) head.u32(0);
    const parts: Uint8Array[] = [];
    let offset = headerSize + this._count * 4;
    const table: number[] = new Array(this._count).fill(0);
    for (let id = 1; id <= this._count; id++) {
      let rec = this.getRecord(id);
      if (rec && reencode) rec = encodeSprite(decodeSprite(rec, this.options.transparency), opts.transparency);
      if (!rec) continue;
      table[id - 1] = offset;
      parts.push(rec);
      offset += rec.length;
    }
    const headBytes = head.toBytes();
    const dv = new DataView(headBytes.buffer);
    for (let i = 0; i < this._count; i++) dv.setUint32(tableStart + i * 4, table[i], true);
    return [headBytes, ...parts];
  }

  write(options: Partial<SprOptions> = {}): Uint8Array {
    return concatBytes(this.writeParts(options));
  }
}
