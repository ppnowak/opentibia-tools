/**
 * Verifies the library against every client data pack published at
 * https://downloads.ots.me/data/tibia-clients/dat_and_spr/
 *
 * For each pack: detects the layout, checks that dat and spr re-serialize byte for byte,
 * converts the client to other protocol generations and parses the result back.
 *
 *   npm run verify-packs -- [--versions=710,860] [--cache=./packs] [--keep] [--write-signatures]
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readDat } from '../src/core/dat/dat.ts';
import { Project } from '../src/core/project.ts';
import { renderThing } from '../src/core/render.ts';
import { SpriteArchive } from '../src/core/spr/spr.ts';
import { featuresFor, versionLabel } from '../src/core/versions.ts';

const BASE = 'https://downloads.ots.me/data/tibia-clients/dat_and_spr/';

const argv = yargs(hideBin(process.argv))
  .option('versions', { type: 'string', describe: 'Comma separated pack names (default: all listed on the server)' })
  .option('cache', { type: 'string', default: './packs', describe: 'Where zips are downloaded' })
  .option('keep', { type: 'boolean', default: false, describe: 'Keep downloaded zips' })
  .option('write-signatures', { type: 'boolean', default: false, describe: 'Regenerate src/core/signatures.ts' })
  .option('convert', { type: 'boolean', default: true, describe: 'Also test conversion to other versions' })
  .parseSync();

async function listPacks(): Promise<string[]> {
  const html = await (await fetch(BASE)).text();
  return [...html.matchAll(/href="([^"?/]+)\.zip"/g)].map((m) => m[1]);
}

async function download(name: string): Promise<Uint8Array> {
  mkdirSync(argv.cache, { recursive: true });
  const file = join(argv.cache, `${name}.zip`);
  if (!existsSync(file)) {
    const res = await fetch(`${BASE}${name}.zip`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${name}.zip`);
    writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
  }
  const bytes = new Uint8Array(readFileSync(file));
  if (!argv.keep) rmSync(file);
  return bytes;
}

function packVersion(name: string): number {
  const m = /^(\d+)\.(\d+)/.exec(name);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  return Number.parseInt(name, 10);
}

function equalParts(parts: Uint8Array[], original: Uint8Array): boolean {
  let o = 0;
  for (const p of parts) {
    if (o + p.length > original.length) return false;
    for (let i = 0; i < p.length; i++) if (p[i] !== original[o + i]) return false;
    o += p.length;
  }
  return o === original.length;
}

interface Result {
  pack: string;
  version: number;
  datSignature: number;
  sprSignature: number;
  features: string;
  matchesLabel: boolean;
  things: string;
  sprites: number;
  datRoundTrip: boolean;
  sprRoundTrip: boolean;
  conversions: string;
  error?: string;
}

const CONVERSION_TARGETS = [740, 772, 854, 860, 1098];

async function verify(pack: string): Promise<Result> {
  const version = packVersion(pack);
  const zip = unzipSync(await download(pack), { filter: (f) => /tibia\.(dat|spr)$/i.test(f.name) });
  const find = (ext: string) => Object.entries(zip).find(([n]) => n.toLowerCase().endsWith(ext))?.[1];
  const datBytes = find('.dat');
  const sprBytes = find('.spr');
  if (!datBytes || !sprBytes) throw new Error('pack has no Tibia.dat/Tibia.spr');
  const project = Project.open(datBytes, sprBytes, { version });
  const f = project.features;
  const expected = featuresFor(version);
  const matchesLabel =
    f.datFormat === expected.datFormat &&
    f.extended === expected.extended &&
    f.enhancedAnimations === expected.enhancedAnimations &&
    f.frameGroups === expected.frameGroups;
  const out = project.compile();
  const datRoundTrip = out.dat.length === datBytes.length && out.dat.every((b, i) => b === datBytes[i]);
  const sprRoundTrip = equalParts(out.spr, sprBytes);
  // render a few things to make sure sprite references resolve
  for (const t of [project.dat.items[0], project.dat.outfits[0], project.dat.effects[0]]) if (t) renderThing(t, project.spr);

  const conversions: string[] = [];
  if (argv.convert) {
    for (const target of CONVERSION_TARGETS) {
      if (target === version) continue;
      try {
        const c = project.compile({ version: target, features: { extended: project.spr.count > 0xffff || featuresFor(target).extended } });
        const back = readDat(c.dat, c.features);
        const sprBack = SpriteArchive.load(new Uint8Array(Buffer.concat(c.spr)), c.features);
        if (back.items.length !== project.dat.items.length || sprBack.count !== project.spr.count) throw new Error('count mismatch');
        conversions.push(`${versionLabel(target)}:ok`);
      } catch (e) {
        conversions.push(`${versionLabel(target)}:FAIL(${(e as Error).message})`);
      }
    }
  }
  return {
    pack,
    version,
    datSignature: project.dat.signature,
    sprSignature: project.spr.signature,
    features: `${f.datFormat}${f.extended ? '+ext' : ''}${f.enhancedAnimations ? '+anim' : ''}${f.frameGroups ? '+groups' : ''}${f.transparency ? '+alpha' : ''}`,
    matchesLabel,
    things: `${project.dat.items.length}/${project.dat.outfits.length}/${project.dat.effects.length}/${project.dat.missiles.length}`,
    sprites: project.spr.count,
    datRoundTrip,
    sprRoundTrip,
    conversions: conversions.join(' '),
  };
}

const packs = argv.versions ? argv.versions.split(',') : await listPacks();
const results: Result[] = [];
for (const pack of packs) {
  const started = Date.now();
  try {
    const r = await verify(pack);
    results.push(r);
    console.log(
      `${pack.padEnd(14)} ${r.features.padEnd(22)} label:${r.matchesLabel ? 'yes' : 'NO '} dat:${r.datRoundTrip ? 'ok' : 'DIFF'} spr:${r.sprRoundTrip ? 'ok' : 'DIFF'} things:${r.things} sprites:${r.sprites} sig:${r.datSignature.toString(16)}/${r.sprSignature.toString(16)} ${r.conversions} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
    );
  } catch (e) {
    const r = { pack, version: packVersion(pack), error: (e as Error).message } as Result;
    results.push(r);
    console.log(`${pack.padEnd(14)} ERROR ${r.error}`);
  }
}

writeFileSync(join(argv.cache, 'verify-results.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.error || !r.datRoundTrip || !r.sprRoundTrip || r.conversions.includes('FAIL'));
console.log(`\n${results.length - failed.length}/${results.length} packs verified`);

if (argv['write-signatures']) {
  const lines = results
    .filter((r) => !r.error)
    .sort((a, b) => a.version - b.version || a.pack.localeCompare(b.pack))
    .map((r) => `  { version: ${r.version}, dat: 0x${r.datSignature.toString(16)}, spr: 0x${r.sprSignature.toString(16)}, pack: '${r.pack}' }, // ${r.features}`);
  const template = readFileSync('src/core/signatures.ts', 'utf8');
  const start = template.indexOf('export const KNOWN_SIGNATURES');
  const end = template.indexOf('];', start) + 2;
  writeFileSync(
    'src/core/signatures.ts',
    `${template.slice(0, start)}export const KNOWN_SIGNATURES: readonly KnownSignature[] = [\n${lines.join('\n')}\n];${template.slice(end)}`,
  );
  console.log('signatures written to src/core/signatures.ts');
}
process.exitCode = failed.length ? 1 : 0;
