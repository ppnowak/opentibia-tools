import { existsSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { datFromJson, datToJson } from '../core/json.ts';
import { Project } from '../core/project.ts';
import { SPRITE_SIZE, SpriteArchive } from '../core/spr/spr.ts';
import { encodePng } from '../core/image/png.ts';
import { resizeImage } from '../core/image/image.ts';
import type { ClientFeatures } from '../core/versions.ts';
import { ensureDir, listFiles, readBytes, readImage, writeBytes } from './io.ts';

/**
 * Git friendly client source tree:
 *
 *   client.json      version, layout, signatures, sprite count
 *   Tibia.json       things (canonical, version independent JSON)
 *   sprites/<id>.png 32x32 sprites
 *   hires/<id>.png   optional high resolution sprites (OTClientV8 Tibia.cwm)
 */
export interface ClientManifest {
  format: 'opentibia-tools/client';
  formatVersion: 1;
  client: number;
  features: ClientFeatures;
  datSignature: number;
  sprSignature: number;
  spriteCount: number;
  hiResSize?: number;
}

export function isClientDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory() && existsSync(join(path, 'client.json'));
}

export function writeClientDir(project: Project, dir: string, onProgress?: (done: number, total: number) => void): number {
  ensureDir(join(dir, 'sprites'));
  const manifest: ClientManifest = {
    format: 'opentibia-tools/client',
    formatVersion: 1,
    client: project.version,
    features: project.features,
    datSignature: project.dat.signature,
    sprSignature: project.spr.signature,
    spriteCount: project.spr.count,
    ...(project.hiRes.size ? { hiResSize: project.hiResSize } : {}),
  };
  writeBytes(join(dir, 'client.json'), new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`));
  writeBytes(join(dir, 'Tibia.json'), new TextEncoder().encode(JSON.stringify(datToJson(project.dat, project.version, project.features), null, 1)));
  let written = 0;
  for (let id = 1; id <= project.spr.count; id++) {
    if (!project.spr.isEmpty(id)) {
      writeBytes(join(dir, 'sprites', `${id}.png`), encodePng({ width: SPRITE_SIZE, height: SPRITE_SIZE, data: project.spr.getPixels(id) }));
      written++;
    }
    const hi = project.hiRes.get(id);
    if (hi) {
      ensureDir(join(dir, 'hires'));
      writeBytes(join(dir, 'hires', `${id}.png`), hi instanceof Uint8Array ? hi : encodePng(hi));
    }
    if (onProgress && id % 5000 === 0) onProgress(id, project.spr.count);
  }
  return written;
}

export function readClientDir(dir: string): Project {
  const manifest = JSON.parse(new TextDecoder().decode(readBytes(join(dir, 'client.json')))) as ClientManifest;
  if (manifest.format !== 'opentibia-tools/client') throw new Error(`${dir}/client.json is not an opentibia-tools client manifest`);
  const { dat } = datFromJson(JSON.parse(new TextDecoder().decode(readBytes(join(dir, 'Tibia.json')))));
  dat.signature = manifest.datSignature;
  const spr = SpriteArchive.create(manifest.sprSignature, manifest.features);
  const spritesDir = join(dir, 'sprites');
  if (existsSync(spritesDir)) {
    for (const name of listFiles(spritesDir, ['.png', '.bmp'])) {
      const id = Number.parseInt(basename(name, extname(name)), 10);
      if (!id) continue;
      let img = readImage(join(spritesDir, name));
      if (img.width !== SPRITE_SIZE || img.height !== SPRITE_SIZE) img = resizeImage(img, SPRITE_SIZE, SPRITE_SIZE, 'bilinear');
      spr.setPixels(id, img.data);
    }
  }
  if (spr.count < manifest.spriteCount) spr.resize(manifest.spriteCount);
  const project = new Project(manifest.client, manifest.features, dat, spr);
  const hiresDir = join(dir, 'hires');
  if (existsSync(hiresDir)) {
    project.hiResSize = manifest.hiResSize ?? 64;
    for (const name of listFiles(hiresDir, ['.png'])) {
      const id = Number.parseInt(basename(name, '.png'), 10);
      if (id) project.hiRes.set(id, readBytes(join(hiresDir, name)));
    }
  }
  return project;
}
