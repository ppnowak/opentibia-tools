/**
 * Integration test against real client files. Point TIBIA_PACKS_DIR at a directory with
 * extracted packs from https://downloads.ots.me/data/tibia-clients/dat_and_spr/, e.g.
 *   packs/860/Tibia.dat, packs/860/Tibia.spr, packs/1098/Tibia.dat, ...
 * (`npm run verify-packs` downloads and checks all of them.)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Project } from '../src/core/project.ts';
import { parseVersion } from '../src/core/versions.ts';

const dir = process.env.TIBIA_PACKS_DIR;
const packs = dir && existsSync(dir) ? readdirSync(dir).filter((d) => existsSync(join(dir, d, 'Tibia.dat'))) : [];

describe.skipIf(!packs.length)('real client packs', () => {
  for (const pack of packs) {
    it(`round-trips ${pack}`, () => {
      const dat = new Uint8Array(readFileSync(join(dir!, pack, 'Tibia.dat')));
      const spr = new Uint8Array(readFileSync(join(dir!, pack, 'Tibia.spr')));
      const p = Project.open(dat, spr, { version: parseVersion(pack) });
      const out = p.compile();
      expect(Buffer.compare(Buffer.from(out.dat), Buffer.from(dat))).toBe(0);
      expect(Buffer.compare(Buffer.concat(out.spr), Buffer.from(spr))).toBe(0);
    }, 120_000);
  }
});
