/** Little-endian sequential reader over a Uint8Array (works in Node and browsers). */
export class BinaryReader {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  pos: number;

  constructor(bytes: Uint8Array, pos = 0) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = pos;
  }

  get length(): number {
    return this.bytes.length;
  }

  get remaining(): number {
    return this.bytes.length - this.pos;
  }

  hasMore(): boolean {
    return this.pos < this.bytes.length;
  }

  private ensure(n: number): void {
    if (this.pos + n > this.bytes.length) {
      throw new RangeError(`Unexpected end of data at offset ${this.pos} (need ${n} bytes, ${this.remaining} left)`);
    }
  }

  u8(): number {
    this.ensure(1);
    return this.bytes[this.pos++];
  }

  i8(): number {
    this.ensure(1);
    return this.view.getInt8(this.pos++);
  }

  u16(): number {
    this.ensure(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  u32(): number {
    this.ensure(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  i32(): number {
    this.ensure(4);
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  bytesView(n: number): Uint8Array {
    this.ensure(n);
    const v = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return v;
  }

  /** Latin-1 string of a given byte length. */
  latin1(n: number): string {
    const b = this.bytesView(n);
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  }

  /** String prefixed with u16 length (Tibia's standard string encoding). */
  string(): string {
    return this.latin1(this.u16());
  }
}
