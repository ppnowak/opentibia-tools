import { unzlibSync, zlibSync } from 'fflate';
import { BinaryWriter } from '../binary/writer.ts';
import type { RgbaImage } from './image.ts';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(parts: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC_TABLE[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function be32(v: number): Uint8Array {
  return new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]);
}

function chunk(w: BinaryWriter, type: string, data: Uint8Array): void {
  const t = new Uint8Array([...type].map((c) => c.charCodeAt(0)));
  w.bytes(be32(data.length)).bytes(t).bytes(data).bytes(be32(crc32([t, data])));
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Encode an RGBA image as PNG (8-bit RGBA, adaptive filtering). */
export function encodePng(img: RgbaImage, level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 6): Uint8Array {
  const { width, height, data } = img;
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  const line = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const cur = data[row + x];
        const a = x >= 4 ? data[row + x - 4] : 0;
        const b = y > 0 ? data[row - stride + x] : 0;
        const c = x >= 4 && y > 0 ? data[row - stride + x - 4] : 0;
        const v = (f === 0 ? cur : f === 1 ? cur - a : f === 2 ? cur - b : f === 3 ? cur - ((a + b) >> 1) : cur - paeth(a, b, c)) & 0xff;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    for (let x = 0; x < stride; x++) {
      const cur = data[row + x];
      const a = x >= 4 ? data[row + x - 4] : 0;
      const b = y > 0 ? data[row - stride + x] : 0;
      const c = x >= 4 && y > 0 ? data[row - stride + x - 4] : 0;
      line[x] = (best === 0 ? cur : best === 1 ? cur - a : best === 2 ? cur - b : best === 3 ? cur - ((a + b) >> 1) : cur - paeth(a, b, c)) & 0xff;
    }
    raw[y * (stride + 1)] = best;
    raw.set(line, y * (stride + 1) + 1);
  }
  const w = new BinaryWriter(raw.length / 2 + 64);
  w.bytes(new Uint8Array(SIGNATURE));
  const ihdr = new Uint8Array(13);
  ihdr.set(be32(width), 0);
  ihdr.set(be32(height), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  chunk(w, 'IHDR', ihdr);
  chunk(w, 'IDAT', zlibSync(raw, { level }));
  chunk(w, 'IEND', new Uint8Array(0));
  return w.toBytes();
}

export function isPng(bytes: Uint8Array): boolean {
  return SIGNATURE.every((b, i) => bytes[i] === b);
}

const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

/** Decode a PNG (all standard color types / bit depths, interlaced or not) to RGBA. */
export function decodePng(bytes: Uint8Array): RgbaImage {
  if (!isPng(bytes)) throw new Error('Not a PNG file');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8;
  let width = 0;
  let height = 0;
  let depth = 8;
  let colorType = 6;
  let interlace = 0;
  let palette: Uint8Array | undefined;
  let trns: Uint8Array | undefined;
  const idat: Uint8Array[] = [];
  while (p + 8 <= bytes.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    const data = bytes.subarray(p + 8, p + 8 + len);
    p += 12 + len;
    if (type === 'IHDR') {
      width = dv.getUint32(data.byteOffset - bytes.byteOffset);
      height = dv.getUint32(data.byteOffset - bytes.byteOffset + 4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  let total = 0;
  for (const d of idat) total += d.length;
  const compressed = new Uint8Array(total);
  let o = 0;
  for (const d of idat) {
    compressed.set(d, o);
    o += d.length;
  }
  const raw = unzlibSync(compressed);
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  const bpp = Math.max(1, (channels * depth) >> 3);
  const out = new Uint8Array(width * height * 4);
  const max = (1 << depth) - 1;

  const readSample = (line: Uint8Array, index: number): number => {
    if (depth === 8) return line[index];
    if (depth === 16) return line[index * 2]; // high byte
    const bitPos = index * depth;
    const byte = line[bitPos >> 3];
    const shift = 8 - depth - (bitPos & 7);
    return (byte >> shift) & max;
  };
  const scale = (v: number) => (depth === 8 || depth === 16 ? v : Math.round((v * 255) / max));
  const trnsGray = trns && colorType === 0 ? ((trns[0] << 8) | trns[1]) : -1;
  const trnsRgb = trns && colorType === 2 ? [(trns[0] << 8) | trns[1], (trns[2] << 8) | trns[3], (trns[4] << 8) | trns[5]] : undefined;
  const rawSample = (line: Uint8Array, index: number): number =>
    depth === 16 ? (line[index * 2] << 8) | line[index * 2 + 1] : readSample(line, index);

  const pass = (x0: number, y0: number, dx: number, dy: number, offset: number): number => {
    const pw = Math.ceil((width - x0) / dx);
    const ph = Math.ceil((height - y0) / dy);
    if (pw <= 0 || ph <= 0) return offset;
    const lineBytes = Math.ceil((pw * channels * depth) / 8);
    let prev = new Uint8Array(lineBytes);
    let cur = new Uint8Array(lineBytes);
    for (let y = 0; y < ph; y++) {
      const filter = raw[offset++];
      for (let x = 0; x < lineBytes; x++) {
        const v = raw[offset++];
        const a = x >= bpp ? cur[x - bpp] : 0;
        const b = prev[x];
        const c = x >= bpp ? prev[x - bpp] : 0;
        cur[x] = (filter === 0 ? v : filter === 1 ? v + a : filter === 2 ? v + b : filter === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 0xff;
      }
      for (let x = 0; x < pw; x++) {
        const oi = ((y0 + y * dy) * width + (x0 + x * dx)) * 4;
        let r: number, g: number, bl: number, al: number;
        if (colorType === 3) {
          const idx = readSample(cur, x);
          r = palette?.[idx * 3] ?? 0;
          g = palette?.[idx * 3 + 1] ?? 0;
          bl = palette?.[idx * 3 + 2] ?? 0;
          al = trns && idx < trns.length ? trns[idx] : 255;
        } else if (colorType === 0 || colorType === 4) {
          const v = readSample(cur, x * channels);
          r = g = bl = scale(v);
          al = colorType === 4 ? scale(readSample(cur, x * channels + 1)) : rawSample(cur, x) === trnsGray ? 0 : 255;
        } else {
          r = scale(readSample(cur, x * channels));
          g = scale(readSample(cur, x * channels + 1));
          bl = scale(readSample(cur, x * channels + 2));
          if (colorType === 6) al = scale(readSample(cur, x * channels + 3));
          else
            al =
              trnsRgb &&
              rawSample(cur, x * 3) === trnsRgb[0] &&
              rawSample(cur, x * 3 + 1) === trnsRgb[1] &&
              rawSample(cur, x * 3 + 2) === trnsRgb[2]
                ? 0
                : 255;
        }
        out[oi] = r;
        out[oi + 1] = g;
        out[oi + 2] = bl;
        out[oi + 3] = al;
      }
      [prev, cur] = [cur, prev];
    }
    return offset;
  };

  if (interlace) {
    let off = 0;
    for (const [x0, y0, dx, dy] of ADAM7) off = pass(x0, y0, dx, dy, off);
  } else pass(0, 0, 1, 1, 0);
  return { width, height, data: out };
}
