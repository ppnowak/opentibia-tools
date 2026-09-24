import { convertThing, emptyReport, type ConversionReport } from './convert.ts';
import { addTile } from './builder.ts';
import type { DatFile, ThingCategory, ThingType } from './dat/types.ts';
import { decodePng, encodePng } from './image/png.ts';
import type { Project } from './project.ts';
import { SPRITE_SIZE } from './spr/spr.ts';
import type { ClientFeatures } from './versions.ts';

export interface DatJson extends DatFile {
  format: 'opentibia-tools/dat';
  formatVersion: 1;
  clientVersion: number;
  features: ClientFeatures;
}

export function datToJson(dat: DatFile, clientVersion: number, features: ClientFeatures): DatJson {
  return { format: 'opentibia-tools/dat', formatVersion: 1, clientVersion, features, ...dat };
}

export function datFromJson(json: unknown): { dat: DatFile; clientVersion: number; features: ClientFeatures } {
  const j = json as Partial<DatJson>;
  if (j.format !== 'opentibia-tools/dat' || !j.features || !j.clientVersion) {
    throw new Error('Not an opentibia-tools dat JSON file (use "unpack-dat" to create one)');
  }
  const dat: DatFile = {
    signature: j.signature ?? 0,
    items: j.items ?? [],
    outfits: j.outfits ?? [],
    effects: j.effects ?? [],
    missiles: j.missiles ?? [],
  };
  return { dat, clientVersion: j.clientVersion, features: j.features };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * Portable bundle of things with their sprites (PNG), used to copy objects between clients
 * of different versions ("*.otthings.json").
 */
export interface ThingBundle {
  format: 'opentibia-tools/things';
  formatVersion: 1;
  clientVersion: number;
  features: ClientFeatures;
  /** Sprite ids inside things refer to sprites[id - 1]. */
  things: Array<Omit<ThingType, 'id'>>;
  sprites: string[];
  /** Optional high resolution sprites by bundle sprite id. */
  hiRes?: Record<string, string>;
}

export function exportThings(project: Project, things: ThingType[]): ThingBundle {
  const map = new Map<number, number>();
  const sprites: string[] = [];
  const hiRes: Record<string, string> = {};
  const out = things.map((t) => ({
    category: t.category,
    flags: structuredClone(t.flags),
    groups: t.groups.map((g) => ({
      ...structuredClone(g),
      sprites: g.sprites.map((sid) => {
        if (!sid || project.spr.isEmpty(sid)) return 0;
        let bid = map.get(sid);
        if (bid === undefined) {
          sprites.push(bytesToBase64(encodePng({ width: SPRITE_SIZE, height: SPRITE_SIZE, data: project.spr.getPixels(sid) })));
          bid = sprites.length;
          map.set(sid, bid);
          const hi = project.getHiRes(sid);
          if (hi) hiRes[bid] = bytesToBase64(encodePng(hi));
        }
        return bid;
      }),
    })),
  }));
  return {
    format: 'opentibia-tools/things',
    formatVersion: 1,
    clientVersion: project.version,
    features: project.features,
    things: out,
    sprites,
    ...(Object.keys(hiRes).length ? { hiRes } : {}),
  };
}

/** Add the things of a bundle to a project (converted to its layout). Returns the new things. */
export function importThings(
  project: Project,
  bundle: ThingBundle,
  category?: ThingCategory,
): { things: ThingType[]; report: ConversionReport } {
  if (bundle.format !== 'opentibia-tools/things') throw new Error('Not an opentibia-tools things bundle');
  const report = emptyReport();
  const ids = new Map<number, number>();
  const sink = { spr: project.spr, dedupe: true };
  const spriteId = (bid: number): number => {
    if (!bid) return 0;
    let id = ids.get(bid);
    if (id === undefined) {
      const img = decodePng(base64ToBytes(bundle.sprites[bid - 1]));
      const hi = bundle.hiRes?.[bid];
      if (hi) {
        id = project.spr.add(img.data);
        project.hiRes.set(id, base64ToBytes(hi));
      } else id = addTile(sink, img);
      ids.set(bid, id);
    }
    return id;
  };
  const added = bundle.things.map((t) => {
    const converted = convertThing({ ...t, id: 0 } as ThingType, bundle.features, project.features, report);
    for (const g of converted.groups) g.sprites = g.sprites.map(spriteId);
    return project.add(category ?? t.category, { flags: converted.flags, groups: converted.groups });
  });
  return { things: added, report };
}
