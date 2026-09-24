import { readDat, readDatHeader } from './dat/dat.ts';
import type { DatFormat } from './dat/flags.ts';
import type { DatFile } from './dat/types.ts';
import { readSprHeader } from './spr/spr.ts';
import { datFormatFor, featuresFor, versionsBySignature, type ClientFeatures } from './versions.ts';

export interface DetectionResult {
  features: ClientFeatures;
  /** Versions matching the dat/spr signatures (may be empty for custom clients). */
  versions: number[];
  /** Best version guess (signature match, or the version whose defaults match the detected layout). */
  version: number;
  dat?: DatFile;
  /** How the result was obtained. */
  method: 'signature' | 'probe';
  /** Other layouts that also parse the file (detection is ambiguous; ask for the version). */
  alternatives: ClientFeatures[];
}

const FORMATS: DatFormat[] = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'];

function sameFeatures(a: ClientFeatures, b: ClientFeatures): boolean {
  return (
    a.datFormat === b.datFormat &&
    a.extended === b.extended &&
    a.enhancedAnimations === b.enhancedAnimations &&
    a.frameGroups === b.frameGroups
  );
}

/** All plausible dat layouts, most likely first relative to an optional version hint. */
export function candidateFeatures(hint?: number): ClientFeatures[] {
  const out: ClientFeatures[] = [];
  const push = (f: ClientFeatures) => {
    if (!out.some((o) => sameFeatures(o, f))) out.push(f);
  };
  if (hint) push(featuresFor(hint));
  const hintIdx = hint ? FORMATS.indexOf(datFormatFor(hint)) : FORMATS.length - 1;
  const formats = [...FORMATS].sort((a, b) => Math.abs(FORMATS.indexOf(a) - hintIdx) - Math.abs(FORMATS.indexOf(b) - hintIdx));
  for (const datFormat of formats) {
    for (const extended of [false, true]) {
      for (const enhancedAnimations of [false, true]) {
        for (const frameGroups of [false, true]) {
          push({ datFormat, extended, enhancedAnimations, frameGroups, transparency: false });
        }
      }
    }
  }
  return out;
}

/** Check that a sample of sprite records decode cleanly with/without an alpha channel. */
export function detectTransparency(spr: Uint8Array, extended: boolean): boolean | undefined {
  const header = readSprHeader(spr, extended);
  const dv = new DataView(spr.buffer, spr.byteOffset, spr.byteLength);
  const fits = (channels: number): number => {
    let ok = 0;
    let bad = 0;
    const step = Math.max(1, Math.floor(header.count / 400));
    for (let id = 1; id <= header.count && ok + bad < 400; id += step) {
      const tableEntry = header.tableOffset + (id - 1) * 4;
      if (tableEntry + 4 > spr.length) break;
      const off = dv.getUint32(tableEntry, true);
      if (!off || off + 5 > spr.length) continue;
      const size = spr[off + 3] | (spr[off + 4] << 8);
      let p = off + 5;
      const end = off + 5 + size;
      let pixels = 0;
      while (p + 4 <= end) {
        const t = spr[p] | (spr[p + 1] << 8);
        const c = spr[p + 2] | (spr[p + 3] << 8);
        p += 4 + c * channels;
        pixels += t + c;
      }
      if (p === end && pixels <= 1024) ok++;
      else bad++;
    }
    return bad === 0 ? ok : -1;
  };
  const rgb = fits(3);
  const rgba = fits(4);
  if (rgb >= 0 && rgba < 0) return false;
  if (rgba >= 0 && rgb < 0) return true;
  return undefined;
}

export function detectSprExtended(spr: Uint8Array): boolean | undefined {
  if (spr.length < 8) return undefined;
  const small = readSprHeader(spr, false);
  const big = readSprHeader(spr, true);
  const smallFits = small.tableOffset + small.count * 4 <= spr.length;
  const bigFits = big.tableOffset + big.count * 4 <= spr.length;
  if (smallFits && !bigFits) return false;
  if (bigFits && !smallFits) return true;
  // Both tables fit: check whether the first non-zero offset lands right after the table.
  const firstOffset = (h: typeof small) => {
    const dv = new DataView(spr.buffer, spr.byteOffset, spr.byteLength);
    for (let i = 0; i < Math.min(h.count, 64); i++) {
      const o = dv.getUint32(h.tableOffset + i * 4, true);
      if (o) return o;
    }
    return 0;
  };
  if (firstOffset(big) === big.tableOffset + big.count * 4) return true;
  if (firstOffset(small) === small.tableOffset + small.count * 4) return false;
  return undefined;
}

/**
 * Detect the client version/features of a dat (and optionally spr) file. Known signatures
 * are tried first; otherwise every plausible layout is probed until one parses the whole file.
 */
export function detectClient(dat: Uint8Array, spr?: Uint8Array, hint?: number): DetectionResult {
  const header = readDatHeader(dat);
  const bySig = versionsBySignature(header.signature, 'dat');
  // Several versions can share a signature (identical layouts); report the oldest one.
  const guess = hint ?? bySig[0];
  const sprExtended = spr ? detectSprExtended(spr) : undefined;
  const sprCount = spr && sprExtended !== undefined ? readSprHeader(spr, sprExtended).count : undefined;
  let firstError: unknown;
  const found: Array<{ features: ClientFeatures; dat: DatFile }> = [];
  for (const features of candidateFeatures(guess)) {
    if (sprExtended !== undefined && sprExtended !== features.extended) continue;
    try {
      const parsed = readDat(dat, features);
      if (sprCount !== undefined && maxSpriteId(parsed) > sprCount) continue;
      found.push({ features, dat: parsed });
      // A signature/hint match is authoritative; otherwise look for competing layouts
      // (tiny custom files may parse under several of them).
      if (guess && found.length === 1 && sameFeatures(featuresFor(guess), features)) break;
      if (found.length >= 3) break;
    } catch (e) {
      // the first candidate is the most likely layout, so its error is the most useful one
      firstError ??= e;
    }
  }
  if (!found.length) {
    throw new Error(`Could not detect the client version of this dat file: ${(firstError as Error)?.message ?? 'unknown format'}`);
  }
  const { features, dat: parsed } = found[0];
  if (spr) {
    const t = detectTransparency(spr, features.extended);
    if (t) features.transparency = true;
  }
  const version = guess && sameFeatures(featuresFor(guess), features) ? guess : versionForFeatures(features);
  return {
    features,
    versions: bySig,
    version,
    dat: parsed,
    method: bySig.length && sameFeatures(featuresFor(bySig[0]), features) ? 'signature' : 'probe',
    alternatives: found.slice(1).map((f) => f.features),
  };
}

function maxSpriteId(dat: DatFile): number {
  let max = 0;
  for (const list of [dat.items, dat.outfits, dat.effects, dat.missiles])
    for (const t of list) for (const g of t.groups) for (const s of g.sprites) if (s > max) max = s;
  return max;
}

/** Lowest known version whose default layout matches the given features. */
export function versionForFeatures(f: ClientFeatures): number {
  const table: Array<[number, (x: ClientFeatures) => boolean]> = [
    [710, (x) => x.datFormat === 'v1'],
    [740, (x) => x.datFormat === 'v2'],
    [760, (x) => x.datFormat === 'v3'],
    [800, (x) => x.datFormat === 'v4'],
    [860, (x) => x.datFormat === 'v5' && !x.extended],
    [960, (x) => x.datFormat === 'v5' && x.extended],
    [1010, (x) => x.datFormat === 'v6' && !x.enhancedAnimations],
    [1050, (x) => x.datFormat === 'v6' && x.enhancedAnimations && !x.frameGroups],
    [1098, (x) => x.datFormat === 'v6' && x.enhancedAnimations && x.frameGroups],
  ];
  for (const [v, test] of table) if (test(f)) return v;
  return 1098;
}
