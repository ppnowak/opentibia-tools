import { existsSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { buildOutfit, DIRECTIONS, parseLegacyOutfitName, type Direction } from '../core/builder.ts';
import type { ConversionReport } from '../core/convert.ts';
import { readDat } from '../core/dat/dat.ts';
import { FLAG_NAMES, type FlagName, type ThingFlags } from '../core/dat/flags.ts';
import { CATEGORIES, createFrameGroup, FIRST_ID, type FrameGroup, type ThingCategory, type ThingType } from '../core/dat/types.ts';
import type { RgbaImage } from '../core/image/image.ts';
import { datToJson, importThings, type ThingBundle } from '../core/json.ts';
import { Project } from '../core/project.ts';
import { validateClient, type ValidationReport } from '../core/validate.ts';
import { parseVersion, versionLabel, type ClientFeatures } from '../core/versions.ts';
import { openClientInput } from './inputs.ts';
import { listFiles, log, readBytes, readImage, writeBytes } from './io.ts';

/**
 * Declarative build manifest (e.g. client.build.json). Paths are relative to the manifest.
 * See schemas/build.schema.json.
 */
export interface BuildManifest {
  /** Client version of the base files (auto-detected when omitted). */
  client?: string | number;
  features?: Partial<ClientFeatures>;
  /** Starting point. Omit to start from an empty client of `client`. */
  base?: { dat?: string; spr?: string; cwm?: string; json?: string; source?: string };
  /** Things bundles (*.otthings.json files or directories containing them) to append. */
  things?: string[];
  /** Outfits from image folders (<direction><frame>.png, e.g. 11.png). */
  outfits?: Array<{ images: string; looktype?: number; flags?: ThingFlags }>;
  /** Items/effects/missiles from images: one image per animation frame (sorted by name). */
  objects?: Array<{ category?: Exclude<ThingCategory, 'outfit'>; images: string; id?: number; flags?: ThingFlags; hires?: boolean }>;
  /** Directory of <sprite id>.png replacing sprites (64px images also become high-res sprites). */
  sprites?: string;
  /** Flag edits. `id` may be a number or a range "100-200". */
  patches?: Array<{ category?: ThingCategory; id: number | string; set?: ThingFlags; unset?: FlagName[] }>;
  output: {
    dir: string;
    /** Target version (default: the base version). */
    client?: string | number;
    features?: Partial<ClientFeatures>;
    dat?: string;
    spr?: string;
    /** OTClientV8 Tibia.cwm: false to skip, or { size, mode: "all" | "hires" }. Default: built when high-res sprites exist. */
    cwm?: false | { file?: string; size?: number; mode?: 'all' | 'hires' };
    /** Also write the dat as JSON (true = Tibia.json or a file name). */
    json?: boolean | string;
    signatures?: { dat?: number | string; spr?: number | string };
  };
  /** Validate the result: true fails on errors, "strict" also on warnings. Default true. */
  validate?: boolean | 'strict';
}

export interface BuildResult {
  version: number;
  outputs: string[];
  added: Array<{ category: ThingCategory; id: number }>;
  report: ConversionReport;
  validation?: ValidationReport;
}

function parseNumber(v: number | string | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  return v.toLowerCase().startsWith('0x') ? Number.parseInt(v, 16) : Number.parseInt(v, 10);
}

function idRange(id: number | string): number[] {
  if (typeof id === 'number') return [id];
  const [a, b] = id.split('-').map((x) => Number.parseInt(x.trim(), 10));
  if (Number.isNaN(a)) throw new Error(`Invalid id "${id}"`);
  return b === undefined || Number.isNaN(b) ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/** Load <direction><frame>.png images of an outfit folder. */
export function loadOutfitImages(dir: string): { frames: Partial<Record<Direction, RgbaImage[]>>; tileSize: number } {
  const frames: Partial<Record<Direction, RgbaImage[]>> = {};
  let tileSize = 32;
  for (const name of listFiles(dir, ['.png', '.bmp'])) {
    const parsed = parseLegacyOutfitName(name);
    if (!parsed) {
      log(`  skipping ${name} (expected <direction><frame>.png, e.g. 11.png)`);
      continue;
    }
    const img = readImage(join(dir, name));
    if (img.width >= 64 && img.height >= 64) tileSize = 64;
    (frames[parsed.direction] ??= [])[parsed.frame] = img;
  }
  const count = Math.max(0, ...DIRECTIONS.map((d) => frames[d]?.length ?? 0));
  if (!count) throw new Error(`No outfit images found in ${dir}`);
  for (const d of DIRECTIONS) {
    const list = (frames[d] ??= []);
    for (let i = 0; i < count; i++) list[i] ??= { width: 1, height: 1, data: new Uint8Array(4) };
  }
  return { frames, tileSize };
}

/** Put a thing at a given id (replacing it, or padding with empty things up to it) or append it. */
export function placeThing(project: Project, category: ThingCategory, groups: FrameGroup[], flags: ThingFlags = {}, id?: number): ThingType {
  const list = project.list(category);
  const first = FIRST_ID[category];
  if (id === undefined || id - first >= list.length) {
    if (id !== undefined) while (list.length < id - first) project.add(category, { groups: [createFrameGroup({ patternX: category === 'outfit' ? 4 : 1 })] });
    return project.add(category, { groups, flags });
  }
  if (id < first) throw new Error(`${category} ids start at ${first}`);
  const thing: ThingType = { id, category, flags, groups };
  project.replace(thing);
  return thing;
}

export function runBuild(manifestPath: string, overrides: { outDir?: string } = {}): BuildResult {
  const manifest = JSON.parse(new TextDecoder().decode(readBytes(manifestPath))) as BuildManifest;
  const root = dirname(resolve(manifestPath));
  const p = (x: string) => (isAbsolute(x) ? x : join(root, x));
  if (!manifest.output?.dir && !overrides.outDir) throw new Error('Manifest needs output.dir');
  const version = manifest.client !== undefined ? parseVersion(manifest.client) : undefined;

  // 1. base client
  let project: Project;
  const base = manifest.base;
  if (base?.source || base?.json || base?.dat) {
    const args = base.source ? [p(base.source)] : base.json ? [p(base.json), ...(base.spr ? [p(base.spr)] : [])] : [p(base.dat!), p(base.spr ?? 'Tibia.spr')];
    project = openClientInput(args, { version, features: manifest.features, cwm: base.cwm ? p(base.cwm) : undefined }).project;
  } else {
    if (!version) throw new Error('Manifest needs "client" (version) when no base files are given');
    project = Project.create(version, manifest.features);
  }
  log(`Base client ${project.label}: ${project.dat.items.length} items, ${project.dat.outfits.length} outfits, ${project.spr.count} sprites`);
  const sink = { spr: project.spr, hiRes: project.hiRes as Map<number, RgbaImage>, dedupe: true };
  const added: BuildResult['added'] = [];
  const report: ConversionReport = { droppedFlags: new Map(), truncatedPatternZ: 0, regroupedOutfits: 0, spriteOverflow: 0, warnings: [] };

  // 2. sprite overrides
  if (manifest.sprites) {
    const dir = p(manifest.sprites);
    let n = 0;
    for (const name of listFiles(dir, ['.png', '.bmp'])) {
      const id = Number.parseInt(basename(name, extname(name)), 10);
      if (!id) continue;
      project.setSpriteImage(id, readImage(join(dir, name)));
      n++;
    }
    log(`Replaced ${n} sprites from ${manifest.sprites}`);
  }

  // 3. bundles
  for (const entry of manifest.things ?? []) {
    const path = p(entry);
    const files = statSync(path).isDirectory()
      ? listFiles(path, ['.json']).filter((f) => f.endsWith('.otthings.json')).map((f) => join(path, f))
      : [path];
    for (const file of files) {
      const bundle = JSON.parse(new TextDecoder().decode(readBytes(file))) as ThingBundle;
      const r = importThings(project, bundle);
      for (const [k, n] of r.report.droppedFlags) report.droppedFlags.set(k, (report.droppedFlags.get(k) ?? 0) + n);
      added.push(...r.things.map((t) => ({ category: t.category, id: t.id })));
      log(`Imported ${r.things.length} things from ${entry === file ? entry : basename(file)}`);
    }
  }

  // 4. outfits
  for (const o of manifest.outfits ?? []) {
    const { frames, tileSize } = loadOutfitImages(p(o.images));
    const groups = buildOutfit(sink, { frames }, { tileSize, frameGroups: project.features.frameGroups });
    const t = placeThing(project, 'outfit', groups, o.flags, o.looktype);
    added.push({ category: 'outfit', id: t.id });
    log(`Outfit ${t.id} from ${o.images} (${groups[groups.length - 1].frames} frames, ${tileSize}px)`);
  }

  // 5. objects
  for (const o of manifest.objects ?? []) {
    const category = o.category ?? 'item';
    const dir = p(o.images);
    const files = existsSync(dir) && statSync(dir).isDirectory() ? listFiles(dir, ['.png', '.bmp']).map((f) => join(dir, f)) : [dir];
    const images = files.map((f, frame) => ({ image: readImage(f), frame }));
    const tileSize = o.hires ?? images.every((i) => i.image.width >= 64 && i.image.width % 64 === 0) ? 64 : 32;
    const group = project.buildGroup(images, { tileSize });
    const t = placeThing(project, category, [group], o.flags, o.id);
    added.push({ category, id: t.id });
    log(`${category} ${t.id} from ${o.images} (${images.length} frame(s))`);
  }

  // 6. flag patches
  for (const patch of manifest.patches ?? []) {
    const category = patch.category ?? 'item';
    if (!CATEGORIES.includes(category)) throw new Error(`Invalid category "${category}" in patch`);
    for (const key of [...Object.keys(patch.set ?? {}), ...(patch.unset ?? [])]) {
      if (!FLAG_NAMES.includes(key as FlagName)) throw new Error(`Unknown flag "${key}" in patch (valid: ${FLAG_NAMES.join(', ')})`);
    }
    let n = 0;
    for (const id of idRange(patch.id)) {
      const t = project.get(category, id);
      if (!t) throw new Error(`Patch targets missing ${category} ${id}`);
      const flags: Record<string, unknown> = { ...t.flags, ...patch.set };
      for (const k of patch.unset ?? []) delete flags[k];
      project.replace({ ...t, flags: flags as ThingFlags });
      n++;
    }
    log(`Patched ${n} ${category}(s) ${patch.id}`);
  }

  // 7. output
  const out = manifest.output;
  const outDir = overrides.outDir ?? p(out.dir);
  const target = out.client !== undefined ? parseVersion(out.client) : undefined;
  const compiled = project.compile({
    version: target,
    features: out.features,
    datSignature: parseNumber(out.signatures?.dat),
    sprSignature: parseNumber(out.signatures?.spr),
  });
  for (const [k, n] of compiled.report.droppedFlags) report.droppedFlags.set(k, (report.droppedFlags.get(k) ?? 0) + n);
  report.regroupedOutfits += compiled.report.regroupedOutfits;
  report.truncatedPatternZ += compiled.report.truncatedPatternZ;
  report.warnings.push(...compiled.report.warnings);

  const outputs: string[] = [];
  const datFile = join(outDir, out.dat ?? 'Tibia.dat');
  const sprFile = join(outDir, out.spr ?? 'Tibia.spr');
  writeBytes(datFile, compiled.dat);
  writeBytes(sprFile, compiled.spr);
  outputs.push(datFile, sprFile);
  if (out.json) {
    const jsonFile = join(outDir, typeof out.json === 'string' ? out.json : 'Tibia.json');
    writeBytes(jsonFile, new TextEncoder().encode(JSON.stringify(datToJson(project.dat, compiled.version, compiled.features), null, 1)));
    outputs.push(jsonFile);
  }
  const cwmOpt = out.cwm === undefined ? (project.hiRes.size ? {} : false) : out.cwm;
  let cwm: Uint8Array | undefined;
  if (cwmOpt) {
    cwm = project.buildCwm({ size: cwmOpt.size ?? project.hiResSize ?? 64, onlyHiRes: cwmOpt.mode === 'hires' });
    const cwmFile = join(outDir, cwmOpt.file ?? 'Tibia.cwm');
    writeBytes(cwmFile, cwm);
    outputs.push(cwmFile);
  }
  log(`Wrote client ${versionLabel(compiled.version)} to ${outDir}`);

  let validation: ValidationReport | undefined;
  if (manifest.validate !== false) {
    // validate what was written (after conversion to the target layout)
    validation = validateClient({ dat: readDat(compiled.dat, compiled.features), features: compiled.features, spr: project.spr, cwm });
  }
  return { version: compiled.version, outputs, added, report, validation };
}
