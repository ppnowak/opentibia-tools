/** Growable little-endian binary writer. */
export class BinaryWriter {
  private buf: Uint8Array;
  private view: DataView;
  pos = 0;

  constructor(initialCapacity = 1 << 16) {
    this.buf = new Uint8Array(initialCapacity);
    this.view = new DataView(this.buf.buffer);
  }

  private grow(n: number): void {
    if (this.pos + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.pos + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): this {
    this.grow(1);
    this.buf[this.pos++] = v & 0xff;
    return this;
  }

  i8(v: number): this {
    this.grow(1);
    this.view.setInt8(this.pos++, v);
    return this;
  }

  u16(v: number): this {
    this.grow(2);
    this.view.setUint16(this.pos, v, true);
    this.pos += 2;
    return this;
  }

  u32(v: number): this {
    this.grow(4);
    this.view.setUint32(this.pos, v >>> 0, true);
    this.pos += 4;
    return this;
  }

  i32(v: number): this {
    this.grow(4);
    this.view.setInt32(this.pos, v, true);
    this.pos += 4;
    return this;
  }

  bytes(b: Uint8Array): this {
    this.grow(b.length);
    this.buf.set(b, this.pos);
    this.pos += b.length;
    return this;
  }

  latin1(s: string): this {
    this.grow(s.length);
    for (let i = 0; i < s.length; i++) this.buf[this.pos++] = s.charCodeAt(i) & 0xff;
    return this;
  }

  string(s: string): this {
    this.u16(s.length);
    return this.latin1(s);
  }

  /** Overwrite a u32 at an absolute offset (does not move the cursor). */
  patchU32(offset: number, v: number): this {
    this.view.setUint32(offset, v >>> 0, true);
    return this;
  }

  toBytes(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

/** Concatenate byte chunks into a single Uint8Array. */
export function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
