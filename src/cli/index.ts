#!/usr/bin/env node
import { basename, extname, join } from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { detectSprExtended, detectTransparency } from '../core/detect.ts';
import { cwmSpriteId, readCwm, writeCwm } from '../core/cwm/cwm.ts';
import { readDat } from '../core/dat/dat.ts';
import { CATEGORIES, type ThingCategory } from '../core/dat/types.ts';
import { colorToAlpha, resizeImage, type ResizeMode } from '../core/image/image.ts';
import { decodePng, encodePng } from '../core/image/png.ts';
import { datFromJson, datToJson, exportThings, importThings, type ThingBundle } from '../core/json.ts';
import { Project } from '../core/project.ts';
import { renderThing } from '../core/render.ts';
import { SPRITE_SIZE, SpriteArchive } from '../core/spr/spr.ts';
import { ALL_VERSIONS, getVersion, parseVersion, versionLabel, type ClientFeatures } from '../core/versions.ts';
import { ensureDir, listFiles, log, readBytes, readImage, writeBytes, writeImage, type ImageFormat } from './io.ts';

const argv = yargs(hideBin(process.argv))
  .usage('Usage: npm run <mode> -- <args> [options]   (or: npm run cli -- --mode=<mode> <args>)')
  .option('mode', { type: 'string', demandOption: true, describe: 'Command to run (see README)' })
  .option('client', { type: 'string', describe: 'Client/protocol version, e.g. 7.72, 860, 10.98 (auto-detected when omitted)' })
  .option('target', { type: 'string', describe: 'Target client version for pack/convert commands' })
  .option('extended', { type: 'boolean', describe: 'Force u32 sprite ids/count' })
  .option('transparency', { type: 'boolean', describe: 'Force sprites with alpha channel' })
  .option('improved-animations', { type: 'boolean', describe: 'Force enhanced animation data' })
  .option('frame-groups', { type: 'boolean', describe: 'Force outfit frame groups' })
  .option('format', { type: 'string', choices: ['png', 'bmp'], describe: 'Image format for exported sprites' })
  .option('size', { type: 'number', describe: 'Sprite size in pixels for exported images / CWM' })
  .option('resize', { type: 'string', choices: ['nearest', 'bilinear'], default: 'nearest' })
  .option('category', { type: 'string', choices: CATEGORIES as unknown as string[], describe: 'Thing category' })
  .option('ids', { type: 'string', describe: 'Comma separated ids / ranges, e.g. 1,5,10-20' })
  .parseSync();

const positional = argv._.map(String);

function featureOverrides(): Partial<ClientFeatures> {
  const o: Partial<ClientFeatures> = {};
  if (argv.extended !== undefined) o.extended = argv.extended;
  if (argv.transparency !== undefined) o.transparency = argv.transparency;
  if (argv['improved-animations'] !== undefined) o.enhancedAnimations = argv['improved-animations'];
  if (argv['frame-groups'] !== undefined) o.frameGroups = argv['frame-groups'];
  return o;
}

function requireArgs(n: number, usage: string): string[] {
  if (positional.length < n) throw new Error(`Usage: ${usage}`);
  return positional;
}

function parseIds(spec: string | undefined, max: number, min = 1): number[] {
  if (!spec) return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-').map((x) => Number(x.trim()));
    if (b !== undefined && !Number.isNaN(b)) for (let i = a; i <= b; i++) out.push(i);
    else out.push(a);
  }
  return out;
}

function openProject(datFile: string, sprFile: string): Project {
  const overrides = featureOverrides();
  const project = Project.open(readBytes(datFile), readBytes(sprFile), {
    version: argv.client ? parseVersion(argv.client) : undefined,
    features: Object.keys(overrides).length ? overrides : undefined,
  });
  const f = project.features;
  log(
    `Loaded client ${project.label} (dat ${f.datFormat}${f.extended ? ', extended' : ''}${f.enhancedAnimations ? ', improved animations' : ''}${f.frameGroups ? ', frame groups' : ''}${f.transparency ? ', transparency' : ''}): ` +
      `${project.dat.items.length} items, ${project.dat.outfits.length} outfits, ${project.dat.effects.length} effects, ${project.dat.missiles.length} missiles, ${project.spr.count} sprites`,
  );
  return project;
}

function sprOnly(sprFile: string): SpriteArchive {
  const bytes = readBytes(sprFile);
  const v = argv.client ? getVersion(argv.client, featureOverrides()).features : undefined;
  if (v) return SpriteArchive.load(bytes, v);
  const extended = detectSprExtended(bytes);
  if (extended === undefined) throw new Error('Could not detect the spr layout, pass --client=<version>');
  const transparency = argv.transparency ?? detectTransparency(bytes, extended) ?? false;
  return SpriteArchive.load(bytes, { extended, transparency });
}

async function main(): Promise<void> {
  switch (argv.mode) {
    // npm run unpack-dat ./binary/Tibia.dat ./binary/Tibia.json -- --client=8.60
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
        const { detectClient } = await import('../core/detect.ts');
        const d = detectClient(bytes);
        version = d.version;
        features = d.features;
        dat = d.dat!;
        log(`Detected layout of client ${versionLabel(version)} (use --client to set it explicitly)`);
      }
      writeBytes(jsonFile, new TextEncoder().encode(JSON.stringify(datToJson(dat, version, features), null, 2)));
      log(`File ${datFile} was unpacked into ${jsonFile}`);
      break;
    }

    // npm run pack-dat ./binary/Tibia.json ./binary/NewTibia.dat -- [--target=10.98]
    case 'pack-dat': {
      const [jsonFile, datFile] = requireArgs(2, 'pack-dat <Tibia.json> <Tibia.dat> [--target=version]');
      const { dat, clientVersion, features } = datFromJson(JSON.parse(new TextDecoder().decode(readBytes(jsonFile))));
      const spr = SpriteArchive.create(0, features);
      const project = new Project(clientVersion, features, dat, spr);
      const target = argv.target ? parseVersion(argv.target) : undefined;
      const out = project.compile({ version: target, features: featureOverrides() });
      writeBytes(datFile, out.dat);
      reportConversion(out.report);
      log(`File ${jsonFile} was packed into ${datFile} (client ${versionLabel(out.version)})`);
      break;
    }

    // npm run unpack-spr ./binary/Tibia.spr ./sprites/tibia -- [--format=png] [--size=64]
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
      break;
    }

    // npm run pack-spr ./sprites/tibia ./binary/Tibia.spr -- --client=8.60
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
      break;
    }

    // npm run convert-to-png ./sprites/tibia ./sprites/png64 64
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
      break;
    }

    // npm run unpack-cwm ./binary/Tibia.cwm ./sprites/tibia-cwm
    case 'unpack-cwm': {
      const [cwmFile, dir] = requireArgs(2, 'unpack-cwm <Tibia.cwm> <directory>');
      const cwm = readCwm(readBytes(cwmFile));
      log(`Found ${cwm.entries.length} sprites (${cwm.size}px), extracting...`);
      ensureDir(dir);
      for (const e of cwm.entries) writeBytes(join(dir, e.name), e.data);
      log(`File ${cwmFile} was extracted to ${dir}`);
      break;
    }

    // npm run pack-cwm ./sprites/png64 ./binary/Tibia.cwm
    case 'pack-cwm': {
      const [dir, cwmFile] = requireArgs(2, 'pack-cwm <directory> <Tibia.cwm> [--size=64]');
      const names = listFiles(dir, ['.png']).filter((n) => !Number.isNaN(cwmSpriteId(n)));
      const entries = names.map((name) => ({ name, data: readBytes(join(dir, name)) }));
      const size = argv.size ?? (entries.length ? decodePng(entries[0].data).width : 64);
      writeBytes(cwmFile, writeCwm({ size, entries }));
      log(`Directory ${dir} was packed to ${cwmFile} (${entries.length} sprites, ${size}px)`);
      break;
    }

    // npm run spr-to-cwm ./binary/Tibia.spr ./binary/Tibia.cwm -- --size=64
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
      break;
    }

    // npm run info ./binary/Tibia.dat ./binary/Tibia.spr
    case 'info': {
      const [datFile, sprFile] = requireArgs(2, 'info <Tibia.dat> <Tibia.spr>');
      const p = openProject(datFile, sprFile);
      console.log(
        JSON.stringify(
          {
            version: p.label,
            features: p.features,
            datSignature: `0x${p.dat.signature.toString(16)}`,
            sprSignature: `0x${p.spr.signature.toString(16)}`,
            counts: p.counts(),
            sprites: p.spr.count,
          },
          null,
          2,
        ),
      );
      break;
    }

    // npm run convert ./760/Tibia.dat ./760/Tibia.spr ./out -- --target=8.60
    case 'convert': {
      const [datFile, sprFile, outDir] = requireArgs(3, 'convert <Tibia.dat> <Tibia.spr> <output dir> --target=version');
      if (!argv.target) throw new Error('--target=<version> is required');
      const p = openProject(datFile, sprFile);
      const out = p.compile({ version: parseVersion(argv.target), features: featureOverrides() });
      writeBytes(join(outDir, 'Tibia.dat'), out.dat);
      writeBytes(join(outDir, 'Tibia.spr'), out.spr);
      reportConversion(out.report);
      log(`Converted client ${p.label} to ${versionLabel(out.version)} in ${outDir}`);
      break;
    }

    // npm run cli -- --mode=export-images Tibia.dat Tibia.spr ./out --category=outfit --ids=1-10
    case 'export-images': {
      const [datFile, sprFile, outDir] = requireArgs(3, 'export-images <Tibia.dat> <Tibia.spr> <dir> --category=item --ids=100-200');
      const p = openProject(datFile, sprFile);
      const category = (argv.category ?? 'item') as ThingCategory;
      const list = p.list(category);
      const ids = parseIds(argv.ids, list.length ? list[list.length - 1].id : 0, list[0]?.id ?? 1);
      ensureDir(outDir);
      for (const id of ids) {
        const t = p.get(category, id);
        if (!t) continue;
        writeImage(join(outDir, `${category}-${id}.png`), renderThing(t, p.spr, { patternX: category === 'outfit' ? 2 : 0 }), 'png');
      }
      log(`Exported ${ids.length} ${category} images to ${outDir}`);
      break;
    }

    // npm run cli -- --mode=export-things Tibia.dat Tibia.spr outfits.json --category=outfit --ids=128-140
    case 'export-things': {
      const [datFile, sprFile, outFile] = requireArgs(3, 'export-things <Tibia.dat> <Tibia.spr> <bundle.json> --category=outfit --ids=1-5');
      const p = openProject(datFile, sprFile);
      const category = (argv.category ?? 'item') as ThingCategory;
      if (!argv.ids) throw new Error('--ids is required, e.g. --ids=128-140');
      const things = parseIds(argv.ids, 0, 0)
        .map((id) => p.get(category, id))
        .filter((t) => t !== undefined);
      writeBytes(outFile, new TextEncoder().encode(JSON.stringify(exportThings(p, things))));
      log(`Exported ${things.length} ${category}s to ${outFile}`);
      break;
    }

    // npm run cli -- --mode=import-things Tibia.dat Tibia.spr outfits.json ./out
    case 'import-things': {
      const [datFile, sprFile, bundleFile, outDir] = requireArgs(4, 'import-things <Tibia.dat> <Tibia.spr> <bundle.json> <output dir>');
      const p = openProject(datFile, sprFile);
      const bundle = JSON.parse(new TextDecoder().decode(readBytes(bundleFile))) as ThingBundle;
      const { things, report } = importThings(p, bundle);
      const out = p.compile();
      writeBytes(join(outDir, 'Tibia.dat'), out.dat);
      writeBytes(join(outDir, 'Tibia.spr'), out.spr);
      reportConversion(report);
      log(`Imported ${things.length} things (${things.map((t) => `${t.category} ${t.id}`).join(', ')}) into ${outDir}`);
      break;
    }

    case 'versions': {
      for (const v of ALL_VERSIONS) {
        const f = v.features;
        console.log(`${v.label.padEnd(6)} dat ${f.datFormat} ${f.extended ? 'extended ' : ''}${f.enhancedAnimations ? 'improved-animations ' : ''}${f.frameGroups ? 'frame-groups' : ''}`);
      }
      break;
    }

    default:
      throw new Error(`Mode ${argv.mode} is not supported!`);
  }
}

function reportConversion(report: { droppedFlags: Map<string, number>; warnings: string[]; regroupedOutfits: number; truncatedPatternZ: number }): void {
  if (report.droppedFlags.size) {
    log(`Dropped flags not supported by the target: ${[...report.droppedFlags].map(([k, n]) => `${k} (${n})`).join(', ')}`);
  }
  if (report.regroupedOutfits) log(`Converted frame groups of ${report.regroupedOutfits} outfits`);
  if (report.truncatedPatternZ) log(`Reduced pattern Z of ${report.truncatedPatternZ} things`);
  for (const w of report.warnings) log(`Warning: ${w}`);
}

log(`Starting program ${argv.mode}`);
main().catch((e: Error) => {
  console.error(`Error: ${e.message}`);
  process.exitCode = 1;
});
