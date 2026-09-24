/**
 * End-to-end outfit workflow (successor of the original end-to-end.js):
 * loads a client of any version, adds outfits from image folders and publishes
 * Tibia.dat + Tibia.spr (+ OTClientV8 Tibia.cwm with high resolution sprites).
 *
 * Configuration is read from .env - see README.md.
 */
import { join } from 'node:path';
import dotenv from 'dotenv';
import { buildOutfit, DIRECTIONS, parseLegacyOutfitName, type Direction } from '../core/builder.ts';
import { createFrameGroup } from '../core/dat/types.ts';
import type { RgbaImage } from '../core/image/image.ts';
import { Project } from '../core/project.ts';
import { parseVersion } from '../core/versions.ts';
import { listFiles, log, readBytes, readImage, writeBytes } from './io.ts';

dotenv.config();
const env = process.env;

const required = (name: string): string => {
  const v = env[name];
  if (!v) throw new Error(`Missing ${name} in .env`);
  return v;
};

function outfitDirs(): string[] {
  const dirs: string[] = [];
  for (let i = 0; env[`OUTFITS_${i}`]; i++) dirs.push(env[`OUTFITS_${i}`]!);
  return dirs;
}

function loadOutfitImages(dir: string): { frames: Partial<Record<Direction, RgbaImage[]>>; tileSize: number } {
  const frames: Partial<Record<Direction, RgbaImage[]>> = {};
  let tileSize = 32;
  for (const name of listFiles(dir, ['.png', '.bmp'])) {
    const parsed = parseLegacyOutfitName(name);
    if (!parsed) {
      log(`  skipping ${name} (expected <direction><frame>.png, e.g. 11.png)`);
      continue;
    }
    const img = readImage(join(dir, name));
    tileSize = Math.max(tileSize, img.width >= 64 && img.height >= 64 ? 64 : 32);
    (frames[parsed.direction] ??= [])[parsed.frame] = img;
  }
  // fill gaps so every direction has the same number of frames
  const count = Math.max(0, ...DIRECTIONS.map((d) => frames[d]?.length ?? 0));
  for (const d of DIRECTIONS) {
    const list = (frames[d] ??= []);
    for (let i = 0; i < count; i++) list[i] ??= { width: 1, height: 1, data: new Uint8Array(4) };
  }
  return { frames, tileSize };
}

async function main(): Promise<void> {
  log('Starting end to end');
  const datFile = required('ORIGINAL_TIBIA_DAT_DIR');
  const sprFile = required('ORIGINAL_TIBIA_SPR_DIR');
  const publishDir = required('BINARIES_PUBLISH_DIR');
  const lookTypeStart = env.NEW_LOOKTYPE_START_ID ? Number(env.NEW_LOOKTYPE_START_ID) : undefined;
  const cwmSize = Number(env.SPRITE_SIZE ?? 64);
  const cwmMode = (env.CWM_MODE ?? 'all') as 'all' | 'hires' | 'none';

  log('Loading client');
  const project = Project.open(readBytes(datFile), readBytes(sprFile), { version: env.CLIENT_VERSION ? parseVersion(env.CLIENT_VERSION) : undefined });
  log(`Client ${project.label} loaded: ${project.dat.outfits.length} outfits, ${project.spr.count} sprites`);

  if (lookTypeStart && project.dat.outfits.length < lookTypeStart - 1) {
    const padding = lookTypeStart - 1 - project.dat.outfits.length;
    for (let i = 0; i < padding; i++) project.add('outfit', { groups: [createFrameGroup({ patternX: 4 })] });
    log(`Added ${padding} empty outfits so new looktypes start at ${lookTypeStart}`);
  }

  log('Adding new outfits');
  for (const dir of outfitDirs()) {
    const { frames, tileSize } = loadOutfitImages(dir);
    const groups = buildOutfit(
      { spr: project.spr, hiRes: project.hiRes as Map<number, RgbaImage>, dedupe: true },
      { frames },
      { tileSize, frameGroups: project.features.frameGroups },
    );
    const thing = project.add('outfit', { groups });
    log(`  ${dir} -> looktype ${thing.id} (${groups[groups.length - 1].frames} frames, ${tileSize}px source)`);
  }

  const out = project.compile();
  writeBytes(join(publishDir, 'Tibia.dat'), out.dat);
  log('Compiled Tibia.dat file');
  writeBytes(join(publishDir, 'Tibia.spr'), out.spr);
  log('Compiled Tibia.spr file');

  if (cwmMode !== 'none') {
    const cwm = project.buildCwm({
      size: cwmSize,
      onlyHiRes: cwmMode === 'hires',
      onProgress: (done, total) => done % 20000 === 0 && log(`  cwm ${done}/${total}`),
    });
    writeBytes(join(publishDir, 'Tibia.cwm'), cwm);
    log('Compiled Tibia.cwm file');
  }
  log('Done');
}

main().catch((e: Error) => {
  console.error(`Error: ${e.message}`);
  process.exitCode = 1;
});
