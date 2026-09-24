import { describe, expect, it } from 'vitest';
import { BinaryReader } from '../src/core/binary/reader.ts';
import { BinaryWriter } from '../src/core/binary/writer.ts';
import { buildOutfit, parseLegacyOutfitName, sliceTiles } from '../src/core/builder.ts';
import { convertDat } from '../src/core/convert.ts';
import { readCwm, writeCwm } from '../src/core/cwm/cwm.ts';
import { readDat, writeDat } from '../src/core/dat/dat.ts';
import { DAT_FORMATS, type DatFormat } from '../src/core/dat/flags.ts';
import { FrameGroupType, resizeFrameGroup, spriteIndex } from '../src/core/dat/types.ts';
import { detectClient, detectSprExtended } from '../src/core/detect.ts';
import { createImage, decodeBmp, encodeBmp, resizeImage } from '../src/core/image/image.ts';
import { decodePng, encodePng } from '../src/core/image/png.ts';
import { exportThings, importThings } from '../src/core/json.ts';
import { Project } from '../src/core/project.ts';
import { outfitColor, renderThing } from '../src/core/render.ts';
import { decodeSprite, encodeSprite, SpriteArchive } from '../src/core/spr/spr.ts';
import { signatureFor } from '../src/core/signatures.ts';
import { ALL_VERSIONS, featuresFor, getVersion, parseVersion, versionLabel } from '../src/core/versions.ts';
import { sampleDat, testSprite } from './helpers.ts';

describe('binary', () => {
  it('round-trips little endian values and strings', () => {
    const w = new BinaryWriter(2).u8(0xab).u16(0xbeef).u32(0xdeadbeef).i32(-5).i8(-1).string('Tibia');
    const r = new BinaryReader(w.toBytes());
    expect([r.u8(), r.u16(), r.u32(), r.i32(), r.i8(), r.string()]).toEqual([0xab, 0xbeef, 0xdeadbeef, -5, -1, 'Tibia']);
    expect(r.hasMore()).toBe(false);
    expect(() => r.u8()).toThrow(RangeError);
  });
});

describe('versions', () => {
  it('parses version labels', () => {
    expect(parseVersion('8.60')).toBe(860);
    expect(parseVersion('7.4')).toBe(740);
    expect(parseVersion('15.10.2daede')).toBe(1510);
    expect(parseVersion('1098')).toBe(1098);
    expect(versionLabel(772)).toBe('7.72');
  });

  it('maps every version to a dat format', () => {
    const expected: Array<[number, DatFormat]> = [
      [710, 'v1'], [730, 'v1'], [740, 'v2'], [750, 'v2'], [760, 'v3'], [772, 'v3'],
      [780, 'v4'], [854, 'v4'], [860, 'v5'], [986, 'v5'], [1010, 'v6'], [1510, 'v6'],
    ];
    for (const [v, f] of expected) expect(featuresFor(v).datFormat).toBe(f);
    expect(featuresFor(960).extended).toBe(true);
    expect(featuresFor(954).extended).toBe(false);
    expect(featuresFor(1050).enhancedAnimations).toBe(true);
    expect(featuresFor(1057).frameGroups).toBe(true);
    expect(ALL_VERSIONS.length).toBeGreaterThan(90);
  });
});

describe('dat', () => {
  const versions = [710, 740, 760, 800, 860, 960, 1010, 1050, 1098];
  for (const v of versions) {
    it(`round-trips a ${versionLabel(v)} layout byte for byte`, () => {
      const f = featuresFor(v);
      const bytes = writeDat(sampleDat(f), f);
      const parsed = readDat(bytes, f);
      expect(writeDat(parsed, f)).toEqual(bytes);
      expect(parsed.items[1].flags.light).toEqual({ level: 4, color: 215 });
      expect(parsed.items[2].groups[0].width).toBe(2);
    });
  }

  it('preserves the original order of flags', () => {
    const f = featuresFor(1098);
    const dat = sampleDat(f);
    dat.items[0].flags = { usable: true, fullGround: true, ground: 100 };
    const out = readDat(writeDat(dat, f), f);
    expect(Object.keys(out.items[0].flags)).toEqual(['usable', 'fullGround', 'ground']);
  });

  it('reports unknown flags with context', () => {
    const f = featuresFor(710);
    const bytes = writeDat(sampleDat(f), f);
    bytes[12] = 0x70; // not a 7.10 flag
    expect(() => readDat(bytes, f)).toThrow(/Unknown flag 0x70 for item 100/);
  });

  it('rejects files with trailing data', () => {
    const f = featuresFor(860);
    const bytes = writeDat(sampleDat(f), f);
    const longer = new Uint8Array(bytes.length + 3);
    longer.set(bytes);
    expect(() => readDat(longer, f)).toThrow(/trailing bytes/);
  });

  it('every format table has unique codes and names', () => {
    for (const fmt of Object.values(DAT_FORMATS)) {
      expect(new Set(fmt.codes.map(([c]) => c)).size).toBe(fmt.codes.length);
      expect(new Set(fmt.codes.map(([, n]) => n)).size).toBe(fmt.codes.length);
    }
  });
});

describe('detection', () => {
  for (const v of [710, 740, 760, 800, 860, 1010, 1050, 1098]) {
    it(`detects a ${versionLabel(v)} file by its signature`, () => {
      const f = featuresFor(v);
      const dat = { ...sampleDat(f), signature: signatureFor(v)?.dat ?? 0 };
      const d = detectClient(writeDat(dat, f));
      expect(d.features).toEqual(f);
      expect(d.method).toBe('signature');
    });
  }

  it('probes layouts of files with unknown signatures and reports ambiguity', () => {
    const f = featuresFor(1098);
    const dat = sampleDat(f);
    // a realistic item makes the file unambiguous
    dat.items.push({ id: 103, category: 'item', flags: { market: { category: 1, tradeAs: 103, showAs: 103, name: 'sword', restrictVocation: 0, requiredLevel: 8 }, wrappable: true }, groups: dat.items[0].groups });
    const d = detectClient(writeDat(dat, f));
    expect(d.method).toBe('probe');
    expect(d.features).toEqual(f);
    expect(d.alternatives).toEqual([]);
    const tiny = sampleDat(featuresFor(760));
    expect(detectClient(writeDat(tiny, featuresFor(760))).alternatives.length).toBeGreaterThan(0);
  });

  it('uses the sprite count to rule out layouts', () => {
    const f = featuresFor(1098);
    const spr = SpriteArchive.create(0, f);
    for (let i = 1; i <= 8; i++) spr.add(testSprite(i));
    const d = detectClient(writeDat(sampleDat(f), f), spr.write());
    expect(d.features.extended).toBe(true);
    expect(d.features.frameGroups).toBe(true);
  });

  it('detects extended spr files', () => {
    const small = SpriteArchive.create(1, { extended: false, transparency: false });
    small.add(testSprite(1));
    const big = SpriteArchive.create(1, { extended: true, transparency: false });
    big.add(testSprite(1));
    expect(detectSprExtended(small.write())).toBe(false);
    expect(detectSprExtended(big.write())).toBe(true);
  });
});

describe('spr', () => {
  it('encodes and decodes sprites losslessly', () => {
    for (const transparency of [false, true]) {
      const px = testSprite(3);
      if (transparency) px[(10 * 32 + 10) * 4 + 3] = 128;
      const rec = encodeSprite(px, transparency)!;
      expect(decodeSprite(rec, transparency)).toEqual(px);
    }
    expect(encodeSprite(new Uint8Array(32 * 32 * 4), false)).toBeNull();
  });

  it('keeps untouched records and re-serializes identically', () => {
    for (const extended of [false, true]) {
      const a = SpriteArchive.create(0xabc, { extended, transparency: false });
      for (let i = 1; i <= 20; i++) a.add(i % 7 === 0 ? new Uint8Array(4096) : testSprite(i));
      const bytes = a.write();
      const b = SpriteArchive.load(bytes, { extended, transparency: false });
      expect(b.count).toBe(20);
      expect(b.isEmpty(7)).toBe(true);
      expect(b.write()).toEqual(bytes);
      b.setPixels(3, testSprite(99));
      const c = SpriteArchive.load(b.write(), { extended, transparency: false });
      expect(c.getPixels(3)).toEqual(testSprite(99));
      expect(c.getPixels(4)).toEqual(testSprite(4));
    }
  });

  it('converts between alpha and non-alpha archives', () => {
    const a = SpriteArchive.create(1, { extended: false, transparency: false });
    a.add(testSprite(5));
    const alpha = SpriteArchive.load(a.write({ transparency: true }), { extended: false, transparency: true });
    expect(alpha.getPixels(1)).toEqual(testSprite(5));
  });
});

describe('images', () => {
  it('png round trip', () => {
    const img = { width: 32, height: 32, data: testSprite(7) };
    expect(decodePng(encodePng(img)).data).toEqual(img.data);
  });

  it('bmp round trip keeps alpha', () => {
    const img = { width: 32, height: 32, data: testSprite(8) };
    expect(decodeBmp(encodeBmp(img)).data).toEqual(img.data);
  });

  it('resizes with nearest neighbour exactly for integer scales', () => {
    const img = { width: 32, height: 32, data: testSprite(2) };
    const up = resizeImage(img, 64, 64, 'nearest');
    expect(resizeImage(up, 32, 32, 'nearest').data).toEqual(img.data);
  });

  it('computes the outfit palette', () => {
    expect(outfitColor(0)).toEqual([255, 255, 255]);
    expect(outfitColor(132)).toHaveLength(3);
  });
});

describe('cwm', () => {
  it('round-trips the OTClientV8 container', () => {
    const entries = [
      { name: '1.png', data: encodePng({ width: 64, height: 64, data: new Uint8Array(64 * 64 * 4).fill(200) }) },
      { name: '25.png', data: new Uint8Array([1, 2, 3]) },
    ];
    const bytes = writeCwm({ size: 64, entries });
    expect(bytes[0]).toBe(1);
    const back = readCwm(bytes);
    expect(back.size).toBe(64);
    expect(back.entries.map((e) => e.name)).toEqual(['1.png', '25.png']);
    expect(back.entries[1].data).toEqual(entries[1].data);
  });
});

function project(version: number): Project {
  const p = Project.create(version);
  for (let i = 1; i <= 8; i++) p.spr.add(testSprite(i));
  p.dat = sampleDat(p.features);
  return p;
}

describe('conversion', () => {
  it('merges outfit frame groups for older clients and splits them back', () => {
    const p = project(1098);
    const { dat: old, report } = convertDat(p.dat, p.features, featuresFor(860));
    expect(old.outfits[0].groups).toHaveLength(1);
    expect(old.outfits[0].groups[0].frames).toBe(3); // standing + 2 walking frames
    expect(report.regroupedOutfits).toBe(1);
    const { dat: back } = convertDat(old, featuresFor(860), featuresFor(1098));
    expect(back.outfits[0].groups.map((g) => [g.type, g.frames])).toEqual([
      [FrameGroupType.Idle, 1],
      [FrameGroupType.Moving, 2],
    ]);
  });

  it('drops flags the target cannot store', () => {
    const p = project(1098);
    p.dat.items[0].flags.usable = true;
    const { dat, report } = convertDat(p.dat, p.features, featuresFor(740));
    expect(dat.items[0].flags.usable).toBeUndefined();
    expect(report.droppedFlags.get('usable')).toBe(1);
  });

  it('compiles to every known version and reads the result back', () => {
    const p = project(1098);
    for (const v of ALL_VERSIONS) {
      const out = p.compile({ version: v.value });
      const dat = readDat(out.dat, out.features);
      expect(dat.items).toHaveLength(3);
      const spr = SpriteArchive.load(new Uint8Array(out.spr.flatMap((x) => [...x])), out.features);
      expect(spr.getPixels(5)).toEqual(testSprite(5));
    }
  });
});

describe('builder & project', () => {
  it('slices images anchored at the bottom-right tile', () => {
    const img = createImage(64, 64);
    img.data[(63 * 64 + 63) * 4 + 3] = 255; // bottom-right pixel
    const tiles = sliceTiles(img, 2, 2);
    expect(tiles[0].data[(31 * 32 + 31) * 4 + 3]).toBe(255); // tile (0,0) is the bottom-right one
  });

  it('builds outfits from legacy e2e file names', () => {
    expect(parseLegacyOutfitName('41.png')).toEqual({ direction: 'north', frame: 0 });
    expect(parseLegacyOutfitName('dir/13.png')).toEqual({ direction: 'south', frame: 2 });
    expect(parseLegacyOutfitName('x.png')).toBeUndefined();
    const spr = SpriteArchive.create(0, { extended: false, transparency: false });
    const img = (seed: number) => ({ width: 32, height: 32, data: testSprite(seed) });
    const frames = { north: [img(1), img(2)], east: [img(3), img(4)], south: [img(5), img(6)], west: [img(7), img(8)] };
    const [single] = buildOutfit({ spr }, { frames });
    expect(single.patternX).toBe(4);
    expect(single.frames).toBe(2);
    expect(spr.getPixels(single.sprites[spriteIndex(single, 0, 0, 0, 2, 0, 0, 1)])).toEqual(testSprite(6));
    const groups = buildOutfit({ spr }, { frames }, { frameGroups: true });
    expect(groups.map((g) => g.frames)).toEqual([1, 1]);
  });

  it('keeps high-res originals for CWM output', () => {
    const p = project(860);
    const big = resizeImage({ width: 32, height: 32, data: testSprite(1) }, 64, 64);
    const id = p.addSpriteImage(big);
    expect(p.getHiRes(id)?.width).toBe(64);
    const cwm = readCwm(p.buildCwm({ size: 64, onlyHiRes: true }));
    expect(cwm.entries.map((e) => e.name)).toEqual([`${id}.png`]);
    expect(decodePng(cwm.entries[0].data).data).toEqual(big.data);
  });

  it('copies things between clients of different versions', () => {
    const src = project(1098);
    const dst = project(772);
    const before = dst.spr.count;
    const { thing } = dst.importThing(src, src.dat.outfits[0]);
    expect(thing.id).toBe(2);
    expect(thing.groups).toHaveLength(1);
    expect(dst.spr.count).toBe(before + 8);
    dst.importThing(src, src.dat.outfits[0]);
    expect(dst.spr.count).toBe(before + 8); // sprites imported earlier are reused
    const rendered = renderThing(thing, dst.spr, { patternX: 2 });
    expect(rendered.width).toBe(32);
  });

  it('exports and imports thing bundles', () => {
    const src = project(860);
    const bundle = JSON.parse(JSON.stringify(exportThings(src, [src.dat.items[1]])));
    const dst = Project.create(1098);
    const { things } = importThings(dst, bundle);
    expect(things[0].id).toBe(100);
    expect(dst.spr.getPixels(things[0].groups[0].sprites[3])).toEqual(testSprite(4));
  });

  it('resizes frame groups keeping sprite positions', () => {
    const p = project(860);
    const g = p.dat.items[1].groups[0];
    const r = resizeFrameGroup(g, { patternX: 2, frames: 2 });
    expect(r.sprites).toHaveLength(2 * 2 * 2);
    expect(r.sprites[spriteIndex(r, 0, 0, 0, 1, 1, 0, 0)]).toBe(g.sprites[spriteIndex(g, 0, 0, 0, 1, 1, 0, 0)]);
    expect(r.animation?.durations).toHaveLength(2);
  });

  it('opens compiled files with auto detection', () => {
    const p = project(1050);
    const out = p.compile();
    const spr = new Uint8Array(out.spr.flatMap((x) => [...x]));
    const q = Project.open(out.dat, spr);
    expect(q.features).toEqual(getVersion(1050).features);
    expect(q.dat.items).toHaveLength(3);
  });
});
