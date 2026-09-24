/** Plain RGBA bitmap, row-major, 4 bytes per pixel. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export function createImage(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

export type ResizeMode = 'nearest' | 'bilinear';

export function resizeImage(src: RgbaImage, width: number, height: number, mode: ResizeMode = 'nearest'): RgbaImage {
  if (src.width === width && src.height === height) return { width, height, data: src.data.slice() };
  const out = createImage(width, height);
  const sx = src.width / width;
  const sy = src.height / height;
  const d = out.data;
  const s = src.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (mode === 'nearest') {
        const i = (Math.min(src.height - 1, Math.floor((y + 0.5) * sy)) * src.width + Math.min(src.width - 1, Math.floor((x + 0.5) * sx))) * 4;
        d[o] = s[i];
        d[o + 1] = s[i + 1];
        d[o + 2] = s[i + 2];
        d[o + 3] = s[i + 3];
      } else {
        const fx = Math.max(0, (x + 0.5) * sx - 0.5);
        const fy = Math.max(0, (y + 0.5) * sy - 0.5);
        const x0 = Math.min(src.width - 1, Math.floor(fx));
        const y0 = Math.min(src.height - 1, Math.floor(fy));
        const x1 = Math.min(src.width - 1, x0 + 1);
        const y1 = Math.min(src.height - 1, y0 + 1);
        const ax = fx - x0;
        const ay = fy - y0;
        const idx = (xx: number, yy: number) => (yy * src.width + xx) * 4;
        const w00 = (1 - ax) * (1 - ay);
        const w10 = ax * (1 - ay);
        const w01 = (1 - ax) * ay;
        const w11 = ax * ay;
        const i00 = idx(x0, y0);
        const i10 = idx(x1, y0);
        const i01 = idx(x0, y1);
        const i11 = idx(x1, y1);
        // premultiplied alpha interpolation avoids dark fringes around transparent pixels
        const a = s[i00 + 3] * w00 + s[i10 + 3] * w10 + s[i01 + 3] * w01 + s[i11 + 3] * w11;
        for (let c = 0; c < 3; c++) {
          const v =
            s[i00 + c] * s[i00 + 3] * w00 +
            s[i10 + c] * s[i10 + 3] * w10 +
            s[i01 + c] * s[i01 + 3] * w01 +
            s[i11 + c] * s[i11 + 3] * w11;
          d[o + c] = a > 0 ? Math.round(v / a) : 0;
        }
        d[o + 3] = Math.round(a);
      }
    }
  }
  return out;
}

/** Replace an exact RGB color (e.g. Tibia magenta 255,0,255) with full transparency. */
export function colorToAlpha(img: RgbaImage, rgb: readonly [number, number, number] = [255, 0, 255]): RgbaImage {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] === rgb[0] && d[i + 1] === rgb[1] && d[i + 2] === rgb[2]) {
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
    }
  }
  return img;
}

/** Fill transparent pixels with a solid color (for formats without alpha, e.g. BMP). */
export function flattenAlpha(img: RgbaImage, rgb: readonly [number, number, number] = [255, 0, 255]): RgbaImage {
  const out = { width: img.width, height: img.height, data: img.data.slice() };
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) {
      d[i] = rgb[0];
      d[i + 1] = rgb[1];
      d[i + 2] = rgb[2];
    }
    d[i + 3] = 255;
  }
  return out;
}

/** Copy a rectangle out of an image (areas outside the source become transparent). */
export function cropImage(src: RgbaImage, x: number, y: number, width: number, height: number): RgbaImage {
  const out = createImage(width, height);
  for (let yy = 0; yy < height; yy++) {
    const sy = y + yy;
    if (sy < 0 || sy >= src.height) continue;
    for (let xx = 0; xx < width; xx++) {
      const sx = x + xx;
      if (sx < 0 || sx >= src.width) continue;
      const si = (sy * src.width + sx) * 4;
      const di = (yy * width + xx) * 4;
      out.data.set(src.data.subarray(si, si + 4), di);
    }
  }
  return out;
}

/** Alpha-blend src over dst at (x, y). */
export function drawImage(dst: RgbaImage, src: RgbaImage, x: number, y: number): void {
  for (let sy = 0; sy < src.height; sy++) {
    const dy = y + sy;
    if (dy < 0 || dy >= dst.height) continue;
    for (let sx = 0; sx < src.width; sx++) {
      const dx = x + sx;
      if (dx < 0 || dx >= dst.width) continue;
      const si = (sy * src.width + sx) * 4;
      const a = src.data[si + 3];
      if (a === 0) continue;
      const di = (dy * dst.width + dx) * 4;
      if (a === 255) {
        dst.data[di] = src.data[si];
        dst.data[di + 1] = src.data[si + 1];
        dst.data[di + 2] = src.data[si + 2];
        dst.data[di + 3] = 255;
        continue;
      }
      const da = dst.data[di + 3] / 255;
      const sa = a / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        dst.data[di + c] = Math.round((src.data[si + c] * sa + dst.data[di + c] * da * (1 - sa)) / oa);
      }
      dst.data[di + 3] = Math.round(oa * 255);
    }
  }
}

/** Encode a 32-bit BMP (BGRA, bottom-up, alpha preserved via BITFIELDS). */
export function encodeBmp(img: RgbaImage): Uint8Array {
  const { width, height, data } = img;
  const headerSize = 14 + 108;
  const size = headerSize + width * height * 4;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  dv.setUint32(2, size, true);
  dv.setUint32(10, headerSize, true);
  dv.setUint32(14, 108, true); // BITMAPV4HEADER
  dv.setInt32(18, width, true);
  dv.setInt32(22, height, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 32, true);
  dv.setUint32(30, 3, true); // BI_BITFIELDS
  dv.setUint32(34, width * height * 4, true);
  dv.setUint32(38, 2835, true);
  dv.setUint32(42, 2835, true);
  dv.setUint32(54, 0x00ff0000, true);
  dv.setUint32(58, 0x0000ff00, true);
  dv.setUint32(62, 0x000000ff, true);
  dv.setUint32(66, 0xff000000, true);
  dv.setUint32(70, 0x73524742, true); // 'sRGB'
  let o = headerSize;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      out[o++] = data[i + 2];
      out[o++] = data[i + 1];
      out[o++] = data[i];
      out[o++] = data[i + 3];
    }
  }
  return out;
}

/** Decode uncompressed 24/32-bit BMP files (the formats produced by sprite tools). */
export function decodeBmp(bytes: Uint8Array): RgbaImage {
  if (bytes[0] !== 0x42 || bytes[1] !== 0x4d) throw new Error('Not a BMP file');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataOffset = dv.getUint32(10, true);
  const headerSize = dv.getUint32(14, true);
  const width = dv.getInt32(18, true);
  const rawHeight = dv.getInt32(22, true);
  const bpp = dv.getUint16(28, true);
  const compression = dv.getUint32(30, true);
  if (bpp !== 24 && bpp !== 32) throw new Error(`Unsupported BMP bit depth ${bpp}`);
  if (compression !== 0 && compression !== 3) throw new Error('Compressed BMP files are not supported');
  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  const hasAlpha = bpp === 32 && (compression === 3 ? headerSize >= 56 && dv.getUint32(66, true) !== 0 : false);
  const stride = Math.ceil((width * bpp) / 32) * 4;
  const out = createImage(width, height);
  for (let y = 0; y < height; y++) {
    const row = dataOffset + (topDown ? y : height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const i = row + x * (bpp / 8);
      const o = (y * width + x) * 4;
      out.data[o] = bytes[i + 2];
      out.data[o + 1] = bytes[i + 1];
      out.data[o + 2] = bytes[i];
      out.data[o + 3] = hasAlpha ? bytes[i + 3] : 255;
    }
  }
  return out;
}
