import { existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { datFromJson } from '../core/json.ts';
import { Project } from '../core/project.ts';
import { SpriteArchive } from '../core/spr/spr.ts';
import type { ClientFeatures } from '../core/versions.ts';
import { isClientDir, readClientDir } from './client-dir.ts';
import { readBytes } from './io.ts';

export interface OpenedClient {
  project: Project;
  /** Raw Tibia.cwm bytes, when one was given or found. */
  cwm?: Uint8Array;
  /** Human description of the inputs. */
  source: string;
}

export interface InputOptions {
  version?: number;
  features?: Partial<ClientFeatures>;
  cwm?: string;
}

function findIn(dir: string, name: string): string | undefined {
  const exact = join(dir, name);
  if (existsSync(exact)) return exact;
  const lower = join(dir, name.toLowerCase());
  return existsSync(lower) ? lower : undefined;
}

/**
 * Open a client from any supported input:
 *   <Tibia.dat> <Tibia.spr>   binary client files
 *   <Tibia.json> [Tibia.spr]  dat exported with unpack-dat (sprites optional)
 *   <client dir>              source tree made by unpack-client
 *   <dir>                     directory containing Tibia.dat + Tibia.spr (+ Tibia.cwm)
 * Returns the project and how many positional arguments were consumed.
 */
export function openClientInput(args: string[], opts: InputOptions = {}): OpenedClient & { consumed: number } {
  const [first, second] = args;
  if (!first) throw new Error('Missing client input (Tibia.dat + Tibia.spr, Tibia.json or a client directory)');
  const cwmBytes = () => (opts.cwm ? readBytes(opts.cwm) : undefined);

  if (existsSync(first) && statSync(first).isDirectory()) {
    if (isClientDir(first)) {
      const project = readClientDir(first);
      return { project, cwm: cwmBytes(), source: `${first} (client source)`, consumed: 1 };
    }
    const dat = findIn(first, 'Tibia.dat');
    const spr = findIn(first, 'Tibia.spr');
    if (!dat || !spr) throw new Error(`${first} contains neither client.json nor Tibia.dat + Tibia.spr`);
    const cwmPath = opts.cwm ?? findIn(first, 'Tibia.cwm');
    const project = Project.open(readBytes(dat), readBytes(spr), { version: opts.version, features: opts.features });
    const cwm = cwmPath ? readBytes(cwmPath) : undefined;
    if (cwm) project.loadCwm(cwm);
    return { project, cwm, source: first, consumed: 1 };
  }

  if (extname(first).toLowerCase() === '.json') {
    const { dat, clientVersion, features } = datFromJson(JSON.parse(new TextDecoder().decode(readBytes(first))));
    const f = { ...features, ...opts.features };
    const hasSpr = second && extname(second).toLowerCase() === '.spr';
    const spr = hasSpr ? SpriteArchive.load(readBytes(second), f) : SpriteArchive.create(0, f);
    const project = new Project(opts.version ?? clientVersion, f, dat, spr);
    const cwm = cwmBytes();
    if (cwm) project.loadCwm(cwm);
    return { project, cwm, source: hasSpr ? `${first} + ${second}` : first, consumed: hasSpr ? 2 : 1 };
  }

  if (!second) throw new Error(`Missing Tibia.spr after ${first}`);
  const project = Project.open(readBytes(first), readBytes(second), { version: opts.version, features: opts.features });
  const cwm = cwmBytes();
  if (cwm) project.loadCwm(cwm);
  return { project, cwm, source: `${first} + ${second}`, consumed: 2 };
}
