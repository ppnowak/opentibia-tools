/** Generates the PWA icons (PNG) with the core PNG encoder: `npx tsx scripts/make-icons.ts`. */
import { writeFileSync } from 'node:fs';
import { encodePng } from '../src/core/image/png.ts';

type RGBA = [number, number, number, number];

function shade(u: number, v: number): RGBA {
  // rounded square background
  const r = 0.2;
  const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
  if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
  let c: RGBA = [27, 31, 39, 255];
  // 4x4 tile grid (sprite sheet motif)
  const gx = (u - 0.18) / 0.64;
  const gy = (v - 0.18) / 0.64;
  if (gx >= 0 && gx < 1 && gy >= 0 && gy < 1) {
    const tx = Math.floor(gx * 4);
    const ty = Math.floor(gy * 4);
    const fx = gx * 4 - tx;
    const fy = gy * 4 - ty;
    const gap = fx < 0.06 || fy < 0.06 || fx > 0.94 || fy > 0.94;
    if (!gap) c = (tx + ty) % 2 ? [58, 107, 64, 255] : [74, 132, 78, 255];
  }
  // golden diamond in the middle
  const d = Math.abs(u - 0.5) + Math.abs(v - 0.5);
  if (d < 0.2) c = d < 0.13 ? [247, 205, 90, 255] : [196, 146, 42, 255];
  return c;
}

function icon(size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const ss = 4;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          for (let i = 0; i < 3; i++) acc[i] += c[i] * c[3];
          acc[3] += c[3];
        }
      const o = (y * size + x) * 4;
      const a = acc[3] / (ss * ss);
      for (let i = 0; i < 3; i++) data[o + i] = acc[3] ? Math.round(acc[i] / acc[3]) : 0;
      data[o + 3] = Math.round(a);
    }
  return encodePng({ width: size, height: size, data }, 9);
}

for (const size of [192, 512]) writeFileSync(`web/public/icons/icon-${size}.png`, icon(size));
writeFileSync('web/public/favicon.png', icon(64));
console.log('icons written');
