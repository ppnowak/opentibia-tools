/**
 * End-to-end outfit workflow (successor of the original end-to-end.js):
 * loads a client of any version, adds outfits from image folders and publishes
 * Tibia.dat + Tibia.spr (+ OTClientV8 Tibia.cwm with high resolution sprites).
 *
 * Configuration is read from .env - see README.md. The same can be expressed as a
 * `build` manifest, which is the recommended way for CI.
 */
import { join } from 'node:path';
import dotenv from 'dotenv';
import { buildOutfit } from '../core/builder.ts';
import { createFrameGroup } from '../core/dat/types.ts';
import type { RgbaImage } from '../core/image/image.ts';
import { Project } from '../core/project.ts';
import { parseVersion } from '../core/versions.ts';
import { loadOutfitImages } from './build.ts';
import { log, readBytes, writeBytes } from './io.ts';

export async function runE2e(): Promise<void> {
  dotenv.config({ quiet: true });
  const env = process.env;
  const required = (name: string): string => {
    const v = env[name];
    if (!v) throw new Error(`Missing ${name} in .env`);
    return v;
  };
  log('Starting end to end');
  const datFile = required('ORIGINAL_TIBIA_DAT_DIR');
  const sprFile = required('ORIGINAL_TIBIA_SPR_DIR');
  const publishDir = required('BINARIES_PUBLISH_DIR');
  const lookTypeStart = env.NEW_LOOKTYPE_START_ID ? Number(env.NEW_LOOKTYPE_START_ID) : undefined;
  const cwmSize = Number(env.SPRITE_SIZE ?? 64);
  const cwmMode = (env.CWM_MODE ?? 'all') as 'all' | 'hires' | 'none';
  const dirs: string[] = [];
  for (let i = 0; env[`OUTFITS_${i}`]; i++) dirs.push(env[`OUTFITS_${i}`]!);

  log('Loading client');
  const project = Project.open(readBytes(datFile), readBytes(sprFile), { version: env.CLIENT_VERSION ? parseVersion(env.CLIENT_VERSION) : undefined });
  log(`Client ${project.label} loaded: ${project.dat.outfits.length} outfits, ${project.spr.count} sprites`);

  if (lookTypeStart && project.dat.outfits.length < lookTypeStart - 1) {
    const padding = lookTypeStart - 1 - project.dat.outfits.length;
    for (let i = 0; i < padding; i++) project.add('outfit', { groups: [createFrameGroup({ patternX: 4 })] });
    log(`Added ${padding} empty outfits so new looktypes start at ${lookTypeStart}`);
  }

  log('Adding new outfits');
  for (const dir of dirs) {
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
