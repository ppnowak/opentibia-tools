import { appendFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { ConversionReport } from '../core/convert.ts';
import { cwmSpriteId, readCwm, writeCwm } from '../core/cwm/cwm.ts';
import { readDat } from '../core/dat/dat.ts';
import { CATEGORIES, type ThingCategory } from '../core/dat/types.ts';
import { detectClient, detectSprExtended, detectTransparency } from '../core/detect.ts';
import { diffDat, diffSprites, formatDiffMarkdown, formatDiffText, isEmptyDiff } from '../core/diff.ts';
import { colorToAlpha, resizeImage, type ResizeMode } from '../core/image/image.ts';
import { decodePng, encodePng } from '../core/image/png.ts';
import { datFromJson, datToJson, exportThings, importThings, type ThingBundle } from '../core/json.ts';
import { Project } from '../core/project.ts';
import { renderThing } from '../core/render.ts';
import { SPRITE_SIZE, SpriteArchive } from '../core/spr/spr.ts';
import { formatProblemsMarkdown, validateClient } from '../core/validate.ts';
import { ALL_VERSIONS, getVersion, parseVersion, versionLabel, type ClientFeatures } from '../core/versions.ts';
import { runBuild } from './build.ts';
import { writeClientDir } from './client-dir.ts';
import { runE2e } from './e2e.ts';
import { openClientInput } from './inputs.ts';
import { ensureDir, listFiles, log, readBytes, readImage, setJsonMode, writeBytes, writeImage, type ImageFormat } from './io.ts';

class UsageError extends Error {}

const argv = yargs(hideBin(process.argv))
  .scriptName('opentibia-tools')
  .usage('Usage: opentibia-tools <command> <args> [options]   (legacy: --mode=<command>)\nRun "opentibia-tools help" for the list of commands.')
  .option('mode', { type: 'string', describe: 'Command to run (legacy form of the first argument)' })
  .option('client', { type: 'string', describe: 'Client/protocol version, e.g. 7.72, 860, 10.98 (auto-detected when omitted)' })
  .option('target', { type: 'string', describe: 'Target client version for pack/convert commands' })
  .option('extended', { type: 'boolean', describe: 'Force u32 sprite ids/count' })
  .option('transparency', { type: 'boolean', describe: 'Force sprites with alpha channel' })
  .option('improved-animations', { type: 'boolean', describe: 'Force enhanced animation data' })
  .option('frame-groups', { type: 'boolean', describe: 'Force outfit frame groups' })
  .option('cwm', { type: 'string', describe: 'Tibia.cwm to load with the client' })
  .option('format', { type: 'string', choices: ['png', 'bmp'], describe: 'Image format for exported sprites' })
  .option('size', { type: 'number', describe: 'Sprite size in pixels for exported images / CWM' })
  .option('resize', { type: 'string', choices: ['nearest', 'bilinear'], default: 'nearest' })
  .option('category', { type: 'string', choices: CATEGORIES as unknown as string[], describe: 'Thing category' })
  .option('ids', { type: 'string', describe: 'Comma separated ids / ranges, e.g. 1,5,10-20' })
  .option('out', { type: 'string', describe: 'Output directory override (build)' })
  .option('json', { type: 'boolean', default: false, describe: 'Machine readable JSON on stdout (logs go to stderr)' })
  .option('strict', { type: 'boolean', default: false, describe: 'validate/build: fail on warnings too' })
  .option('empty-things', { type: 'boolean', default: false, describe: 'validate: report things without sprites' })
  .option('fail-on-change', { type: 'boolean', default: false, describe: 'diff: exit with code 1 when the clients differ' })
  .option('summary', { type: 'boolean', default: true, describe: 'Append a Markdown report to $GITHUB_STEP_SUMMARY when set' })
  .version(false)
  .help(false)
  .parseSync();

const positional = argv._.map(String);
const command = argv.mode ?? positional.shift() ?? 'help';
setJsonMode(argv.json);

function featureOverrides(): Partial<ClientFeatures> | undefined {
  const o: Partial<ClientFeatures> = {};
  if (argv.extended !== undefined) o.extended = argv.extended;
  if (argv.transparency !== undefined) o.transparency = argv.transparency;
  if (argv['improved-animations'] !== undefined) o.enhancedAnimations = argv['improved-animations'];
  if (argv['frame-groups'] !== undefined) o.frameGroups = argv['frame-groups'];
  return Object.keys(o).length ? o : undefined;
}

function requireArgs(n: number, usage: string): string[] {
  if (positional.length < n) throw new UsageError(`Usage: opentibia-tools ${usage}`);
  return positional;
}

function parseIds(spec: string | undefined, max: number, min = 1): number[] {
  if (!spec) return Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-').map((x) => Number(x.trim()));
    if (b !== undefined && !Number.isNaN(b)) for (let i = a; i <= b; i++) out.push(i);
    else out.push(a);
  }
  return out;
}

function inputOptions() {
  return { version: argv.client ? parseVersion(argv.client) : undefined, features: featureOverrides(), cwm: argv.cwm };
}

/** Open a client from the positional arguments starting at `from`; returns the project and the next index. */
function openInput(from = 0): { project: Project; cwm?: Uint8Array; next: number; source: string } {
  const opened = openClientInput(positional.slice(from), inputOptions());
  const p = opened.project;
  const f = p.features;
  log(
    `Loaded client ${p.label} from ${opened.source} (dat ${f.datFormat}${f.extended ? ', extended' : ''}${f.enhancedAnimations ? ', improved animations' : ''}${f.frameGroups ? ', frame groups' : ''}${f.transparency ? ', transparency' : ''}): ` +
      `${p.dat.items.length} items, ${p.dat.outfits.length} outfits, ${p.dat.effects.length} effects, ${p.dat.missiles.length} missiles, ${p.spr.count} sprites`,
  );
  return { project: p, cwm: opened.cwm, next: from + opened.consumed, source: opened.source };
}

function sprOnly(sprFile: string): SpriteArchive {
  const bytes = readBytes(sprFile);
  const overrides = featureOverrides();
  if (argv.client) return SpriteArchive.load(bytes, getVersion(argv.client, overrides).features);
  const extended = overrides?.extended ?? detectSprExtended(bytes);
  if (extended === undefined) throw new UsageError('Could not detect the spr layout, pass --client=<version>');
  const transparency = overrides?.transparency ?? detectTransparency(bytes, extended) ?? false;
  return SpriteArchive.load(bytes, { extended, transparency });
}

function output(data: unknown, text?: string): void {
  if (argv.json) process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  else if (text !== undefined) console.log(text);
}

function summary(markdown: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file && argv.summary) appendFileSync(file, `${markdown}\n`);
}

function reportConversion(report: ConversionReport): void {
  if (report.droppedFlags.size) log(`Dropped flags not supported by the target: ${[...report.droppedFlags].map(([k, n]) => `${k} (${n})`).join(', ')}`);
  if (report.regroupedOutfits) log(`Converted frame groups of ${report.regroupedOutfits} outfits`);
  if (report.truncatedPatternZ) log(`Reduced pattern Z of ${report.truncatedPatternZ} things`);
  for (const w of report.warnings) log(`Warning: ${w}`);
}

function writeCompiled(outDir: string, out: { dat: Uint8Array; spr: Uint8Array[] }, project: Project, withCwm = project.hiRes.size > 0): string[] {
  const files = [join(outDir, 'Tibia.dat'), join(outDir, 'Tibia.spr')];
  writeBytes(files[0], out.dat);
  writeBytes(files[1], out.spr);
  if (withCwm) {
    files.push(join(outDir, 'Tibia.cwm'));
    writeBytes(files[2], project.buildCwm({ size: argv.size ?? project.hiResSize }));
  }
  return files;
}

const HELP: Array<[string, string]> = [
  ['info <client>', 'Version, layout, signatures and counts'],
  ['validate <client> [--cwm=f] [--strict]', 'Check a client for problems (exit 1 on errors)'],
  ['diff <client A> <client B> [--fail-on-change]', 'List added/removed/changed things and sprites'],
  ['convert <client> <out dir> --target=v', 'Convert a client to another protocol version'],
  ['build <manifest.json> [--out=dir]', 'Build a client from a declarative manifest'],
  ['unpack-client <client> <dir>', 'Write a git friendly source tree (Tibia.json + PNG sprites)'],
  ['pack-client <dir> <out dir> [--target=v]', 'Compile a source tree back to Tibia.dat/.spr(/.cwm)'],
  ['unpack-dat <Tibia.dat> <Tibia.json>', 'dat -> JSON'],
  ['pack-dat <Tibia.json> <Tibia.dat> [--target=v]', 'JSON -> dat'],
  ['unpack-spr <Tibia.spr> <dir> [--format=png]', 'Export sprites as images'],
  ['pack-spr <dir> <Tibia.spr> [base.spr]', 'Build a spr from <id>.png images'],
  ['convert-to-png <from> <to> [size]', 'Convert/resize bmp/png images to png'],
  ['unpack-cwm <Tibia.cwm> <dir>', 'Extract OTClientV8 high-res sprites'],
  ['pack-cwm <dir> <Tibia.cwm>', 'Pack PNG images into a CWM'],
  ['spr-to-cwm <Tibia.spr> <Tibia.cwm> [--size=64]', 'Upscale a spr into a CWM'],
  ['export-images <client> <dir> --category=c', 'Render things to PNG'],
  ['export-things <client> <bundle.json> --category=c --ids=..', 'Export things with sprites as a portable bundle'],
  ['import-things <client> <bundle.json> <out dir>', 'Add bundle things to a client'],
  ['e2e', 'Outfit pipeline configured by .env'],
  ['versions', 'List supported protocol versions'],
];

async function main(): Promise<number> {
  switch (command) {
    case 'help':
    case '--help': {
      console.log('opentibia-tools — Tibia client files (dat/spr/cwm/json) for protocols 7.10 - 15.x\n');
      console.log('<client> is "Tibia.dat Tibia.spr", "Tibia.json [Tibia.spr]", a directory with Tibia.dat/.spr or an unpack-client directory.\n');
      for (const [c, d] of HELP) console.log(`  ${c.padEnd(58)} ${d}`);
      console.log('\nCommon options: --client=<version> --extended --transparency --improved-animations --frame-groups --json');
      return 0;
    }

    case 'unpack-dat': {
      const [datFile, jsonFile] = requireArgs(2, 'unpack-dat <Tibia.dat> <Tibia.json> [--client=8.60]');
      const bytes = readBytes(datFile);
      let version: number;
      let features: ClientFeatures;
      let dat;
      if (argv.client) {
        version = parseVersion(argv.client);
        features = getVersion(version, featureOverrides()).features;
        dat = readDat(bytes, features);
      } else {
        const d = detectClient(bytes);
        version = d.version;
        features = d.features;
        dat = d.dat!;
        log(`Detected layout of client ${versionLabel(version)} (use --client to set it explicitly)`);
      }
      writeBytes(jsonFile, new TextEncoder().encode(JSON.stringify(datToJson(dat, version, features), null, 2)));
      log(`File ${datFile} was unpacked into ${jsonFile}`);
      return 0;
    }

    case 'pack-dat': {
      const [jsonFile, datFile] = requireArgs(2, 'pack-dat <Tibia.json> <Tibia.dat> [--target=version]');
      const { dat, clientVersion, features } = datFromJson(JSON.parse(new TextDecoder().decode(readBytes(jsonFile))));
      const project = new Project(clientVersion, features, dat, SpriteArchive.create(0, features));
      const out = project.compile({ version: argv.target ? parseVersion(argv.target) : undefined, features: featureOverrides() });
      writeBytes(datFile, out.dat);
      reportConversion(out.report);
      log(`File ${jsonFile} was packed into ${datFile} (client ${versionLabel(out.version)})`);
      return 0;
    }

    case 'unpack-spr': {
      const [sprFile, dir] = requireArgs(2, 'unpack-spr <Tibia.spr> <directory> [--format=bmp|png] [--size=32]');
      const spr = sprOnly(sprFile);
      const format = (argv.format ?? 'bmp') as ImageFormat;
      const size = argv.size ?? SPRITE_SIZE;
      ensureDir(dir);
      let n = 0;
      for (let id = 1; id <= spr.count; id++) {
        if (spr.isEmpty(id)) continue;
        let img = { width: SPRITE_SIZE, height: SPRITE_SIZE, data: spr.getPixels(id) };
        if (size !== SPRITE_SIZE) img = resizeImage(img, size, size, argv.resize as ResizeMode);
        writeImage(join(dir, `${id}.${format}`), img, format);
        if (++n % 5000 === 0) log(`Exported ${n} sprites (id ${id}/${spr.count})`);
      }
      log(`File ${sprFile} was extracted to ${dir} (${n} sprites)`);
      return 0;
    }

    case 'pack-spr': {
      const [dir, sprFile, base] = requireArgs(2, 'pack-spr <directory> <Tibia.spr> [base Tibia.spr] --client=version');
      const features = getVersion(argv.client ?? '860', featureOverrides()).features;
      const spr = base ? SpriteArchive.load(readBytes(base), features) : SpriteArchive.create(0, features);
      let n = 0;
      for (const name of listFiles(dir, ['.png', '.bmp'])) {
        const id = Number.parseInt(basename(name, extname(name)), 10);
        if (!id) continue;
        let img = readImage(join(dir, name));
        if (extname(name).toLowerCase() === '.bmp') img = colorToAlpha(img);
        if (img.width !== SPRITE_SIZE || img.height !== SPRITE_SIZE) img = resizeImage(img, SPRITE_SIZE, SPRITE_SIZE, 'bilinear');
        spr.setPixels(id, img.data);
        n++;
      }
      writeBytes(sprFile, spr.writeParts());
      log(`Packed ${n} images from ${dir} into ${sprFile} (${spr.count} sprites)`);
      return 0;
    }

    case 'convert-to-png': {
      const [from, to, sizeArg] = requireArgs(2, 'convert-to-png <from dir> <to dir> [size]');
      const size = Number(sizeArg ?? argv.size ?? SPRITE_SIZE);
      ensureDir(to);
      const files = listFiles(from, ['.png', '.bmp']);
      log(`Found ${files.length} files`);
      for (const name of files) {
        let img = colorToAlpha(readImage(join(from, name)));
        if (img.width !== size || img.height !== size) img = resizeImage(img, size, size, argv.resize as ResizeMode);
        writeImage(join(to, `${basename(name, extname(name))}.png`), img, 'png');
      }
      log(`Directory ${from} files were converted and saved to ${to}`);
      return 0;
    }

    case 'unpack-cwm': {
      const [cwmFile, dir] = requireArgs(2, 'unpack-cwm <Tibia.cwm> <directory>');
      const cwm = readCwm(readBytes(cwmFile));
      log(`Found ${cwm.entries.length} sprites (${cwm.size}px), extracting...`);
      ensureDir(dir);
      for (const e of cwm.entries) writeBytes(join(dir, e.name), e.data);
      log(`File ${cwmFile} was extracted to ${dir}`);
      return 0;
    }

    case 'pack-cwm': {
      const [dir, cwmFile] = requireArgs(2, 'pack-cwm <directory> <Tibia.cwm> [--size=64]');
      const names = listFiles(dir, ['.png']).filter((n) => !Number.isNaN(cwmSpriteId(n)));
      const entries = names.map((name) => ({ name, data: readBytes(join(dir, name)) }));
      const size = argv.size ?? (entries.length ? decodePng(entries[0].data).width : 64);
      writeBytes(cwmFile, writeCwm({ size, entries }));
      log(`Directory ${dir} was packed to ${cwmFile} (${entries.length} sprites, ${size}px)`);
      return 0;
    }

    case 'spr-to-cwm': {
      const [sprFile, cwmFile] = requireArgs(2, 'spr-to-cwm <Tibia.spr> <Tibia.cwm> [--size=64] [--resize=nearest|bilinear]');
      const spr = sprOnly(sprFile);
      const size = argv.size ?? 64;
      const entries = [];
      for (let id = 1; id <= spr.count; id++) {
        if (spr.isEmpty(id)) continue;
        const img = resizeImage({ width: SPRITE_SIZE, height: SPRITE_SIZE, data: spr.getPixels(id) }, size, size, argv.resize as ResizeMode);
        entries.push({ name: `${id}.png`, data: encodePng(img) });
        if (id % 10000 === 0) log(`Encoded ${id}/${spr.count}`);
      }
      writeBytes(cwmFile, writeCwm({ size, entries }));
      log(`Created ${cwmFile} with ${entries.length} sprites (${size}px)`);
      return 0;
    }

    case 'info': {
      requireArgs(1, 'info <client>');
      const { project: p } = openInput();
      const info = {
        version: p.label,
        sameLayoutVersions: p.sameSignatureVersions.map(versionLabel),
        features: p.features,
        datSignature: `0x${p.dat.signature.toString(16)}`,
        sprSignature: `0x${p.spr.signature.toString(16)}`,
        counts: p.counts(),
        sprites: p.spr.count,
        hiResSprites: p.hiRes.size,
      };
      output(info, JSON.stringify(info, null, 2));
      summary(
        `### Client ${info.version}\n\n| | |\n| --- | --- |\n| items | ${info.counts.item} |\n| outfits | ${info.counts.outfit} |\n| effects | ${info.counts.effect} |\n| missiles | ${info.counts.missile} |\n| sprites | ${info.sprites} |\n`,
      );
      return 0;
    }

    case 'validate': {
      requireArgs(1, 'validate <client> [--cwm=Tibia.cwm] [--strict] [--empty-things]');
      const { project: p, cwm } = openInput();
      const report = validateClient({ dat: p.dat, features: p.features, spr: p.spr, cwm }, { emptyThings: argv['empty-things'] });
      if (!argv.json) {
        for (const pr of report.problems) {
          const where = pr.category ? `${pr.category} ${pr.id}: ` : pr.spriteId ? `sprite ${pr.spriteId}: ` : '';
          console.log(`${pr.severity.padEnd(7)} [${pr.code}] ${where}${pr.message}`);
        }
        if (report.truncated) console.log(`... ${report.truncated} more problems`);
      }
      output(report);
      log(`${report.errors} errors, ${report.warnings} warnings, ${report.infos} notes`);
      summary(formatProblemsMarkdown(report, `Validation of client ${p.label}`));
      return report.errors || (argv.strict && report.warnings) ? 1 : 0;
    }

    case 'diff': {
      requireArgs(2, 'diff <client A> <client B> [--fail-on-change]');
      const a = openInput(0);
      const b = openInput(a.next);
      const d = diffDat(a.project.dat, b.project.dat);
      const s = a.project.spr.count || b.project.spr.count ? diffSprites(a.project.spr, b.project.spr) : undefined;
      output({ dat: d, sprites: s }, formatDiffText(d, s));
      summary(formatDiffMarkdown(d, s, `Client changes: ${a.source} → ${b.source}`));
      return argv['fail-on-change'] && !isEmptyDiff(d, s) ? 1 : 0;
    }

    case 'convert': {
      requireArgs(2, 'convert <client> <output dir> --target=version');
      if (!argv.target) throw new UsageError('--target=<version> is required');
      const { project: p, next } = openInput();
      const outDir = positional[next];
      if (!outDir) throw new UsageError('Usage: opentibia-tools convert <client> <output dir> --target=version');
      const out = p.compile({ version: parseVersion(argv.target), features: featureOverrides() });
      const files = writeCompiled(outDir, out, p);
      reportConversion(out.report);
      log(`Converted client ${p.label} to ${versionLabel(out.version)} in ${outDir}`);
      output({ version: versionLabel(out.version), files });
      return 0;
    }

    case 'unpack-client': {
      requireArgs(2, 'unpack-client <client> <directory>');
      const { project: p, next } = openInput();
      const dir = positional[next];
      if (!dir) throw new UsageError('Usage: opentibia-tools unpack-client <client> <directory>');
      const n = writeClientDir(p, dir, (d, t) => log(`  sprites ${d}/${t}`));
      log(`Wrote ${dir}: client.json, Tibia.json and ${n} sprites${p.hiRes.size ? ` (+${p.hiRes.size} high-res)` : ''}`);
      return 0;
    }

    case 'pack-client': {
      requireArgs(2, 'pack-client <client dir> <output dir> [--target=version]');
      const { project: p, next } = openInput();
      const outDir = positional[next];
      if (!outDir) throw new UsageError('Usage: opentibia-tools pack-client <client dir> <output dir>');
      const out = p.compile({ version: argv.target ? parseVersion(argv.target) : undefined, features: featureOverrides() });
      const files = writeCompiled(outDir, out, p);
      reportConversion(out.report);
      log(`Packed client ${versionLabel(out.version)} into ${outDir}`);
      output({ version: versionLabel(out.version), files });
      return 0;
    }

    case 'build': {
      const [manifest] = requireArgs(1, 'build <manifest.json> [--out=dir]');
      const result = runBuild(manifest, { outDir: argv.out });
      reportConversion(result.report);
      const v = result.validation;
      if (v) {
        for (const pr of v.problems.filter((x) => x.severity !== 'info')) {
          log(`${pr.severity} [${pr.code}] ${pr.category ? `${pr.category} ${pr.id}: ` : ''}${pr.message}`);
        }
        log(`Validation: ${v.errors} errors, ${v.warnings} warnings`);
        summary(formatProblemsMarkdown(v, `Build of client ${versionLabel(result.version)}`));
      }
      output({ version: versionLabel(result.version), outputs: result.outputs, added: result.added, validation: v && { errors: v.errors, warnings: v.warnings } });
      return v && (v.errors || (argv.strict && v.warnings)) ? 1 : 0;
    }

    case 'export-images': {
      requireArgs(2, 'export-images <client> <dir> --category=item --ids=100-200');
      const { project: p, next } = openInput();
      const outDir = positional[next];
      if (!outDir) throw new UsageError('Usage: opentibia-tools export-images <client> <dir>');
      const category = (argv.category ?? 'item') as ThingCategory;
      const list = p.list(category);
      const ids = parseIds(argv.ids, list.length ? list[list.length - 1].id : 0, list[0]?.id ?? 1);
      ensureDir(outDir);
      let n = 0;
      for (const id of ids) {
        const t = p.get(category, id);
        if (!t) continue;
        writeImage(join(outDir, `${category}-${id}.png`), renderThing(t, p.spr, { patternX: category === 'outfit' ? 2 : 0 }), 'png');
        n++;
      }
      log(`Exported ${n} ${category} images to ${outDir}`);
      return 0;
    }

    case 'export-things': {
      requireArgs(2, 'export-things <client> <bundle.json> --category=outfit --ids=1-5');
      const { project: p, next } = openInput();
      const outFile = positional[next];
      if (!outFile) throw new UsageError('Usage: opentibia-tools export-things <client> <bundle.json> --category=c --ids=..');
      const category = (argv.category ?? 'item') as ThingCategory;
      if (!argv.ids) throw new UsageError('--ids is required, e.g. --ids=128-140');
      const things = parseIds(argv.ids, 0, 0)
        .map((id) => p.get(category, id))
        .filter((t) => t !== undefined);
      writeBytes(outFile, new TextEncoder().encode(JSON.stringify(exportThings(p, things))));
      log(`Exported ${things.length} ${category}s to ${outFile}`);
      return 0;
    }

    case 'import-things': {
      requireArgs(3, 'import-things <client> <bundle.json> <output dir>');
      const { project: p, next } = openInput();
      const [bundleFile, outDir] = positional.slice(next);
      if (!bundleFile || !outDir) throw new UsageError('Usage: opentibia-tools import-things <client> <bundle.json> <output dir>');
      const bundle = JSON.parse(new TextDecoder().decode(readBytes(bundleFile))) as ThingBundle;
      const { things, report } = importThings(p, bundle);
      writeCompiled(outDir, p.compile(), p);
      reportConversion(report);
      log(`Imported ${things.length} things (${things.map((t) => `${t.category} ${t.id}`).join(', ')}) into ${outDir}`);
      output({ added: things.map((t) => ({ category: t.category, id: t.id })) });
      return 0;
    }

    case 'e2e':
      await runE2e();
      return 0;

    case 'versions': {
      output(ALL_VERSIONS.map((v) => ({ version: v.label, ...v.features })));
      if (!argv.json) {
        for (const v of ALL_VERSIONS) {
          const f = v.features;
          console.log(`${v.label.padEnd(6)} dat ${f.datFormat} ${f.extended ? 'extended ' : ''}${f.enhancedAnimations ? 'improved-animations ' : ''}${f.frameGroups ? 'frame-groups' : ''}`);
        }
      }
      return 0;
    }

    default:
      throw new UsageError(`Unknown command "${command}". Run "opentibia-tools help".`);
  }
}

if (command !== 'help' && !argv.json) log(`Starting program ${command}`);
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e: Error) => {
    console.error(`Error: ${e.message}`);
    process.exitCode = e instanceof UsageError ? 2 : 1;
  });
