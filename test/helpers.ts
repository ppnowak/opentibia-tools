import { createFrameGroup, FrameGroupType, type DatFile, type ThingType } from '../src/core/dat/types.ts';
import type { ClientFeatures } from '../src/core/versions.ts';
import { SPRITE_RGBA_BYTES } from '../src/core/spr/spr.ts';

/** Deterministic 32x32 test sprite: a colored square with transparent border. */
export function testSprite(seed: number): Uint8Array {
  const px = new Uint8Array(SPRITE_RGBA_BYTES);
  for (let y = 4; y < 28; y++)
    for (let x = 4 + (seed % 5); x < 28; x++) {
      const o = (y * 32 + x) * 4;
      px[o] = (seed * 37 + x) & 0xff;
      px[o + 1] = (seed * 91 + y) & 0xff;
      px[o + 2] = (seed * 13) & 0xff;
      px[o + 3] = 255;
    }
  return px;
}

/** A small dat covering every flag kind that the given layout supports. */
export function sampleDat(features: ClientFeatures): DatFile {
  const anim = (frames: number) =>
    features.enhancedAnimations && frames > 1
      ? { mode: 1, loopCount: 0, startFrame: -1, durations: Array.from({ length: frames }, (_, i) => ({ min: 100 + i, max: 200 + i })) }
      : undefined;
  const items: ThingType[] = [
    { id: 100, category: 'item', flags: { ground: 150, fullGround: true }, groups: [createFrameGroup({ sprites: [1] })] },
    {
      id: 101,
      category: 'item',
      flags: { stackable: true, pickupable: true, light: { level: 4, color: 215 }, minimap: 12 },
      groups: [createFrameGroup({ patternX: 4, patternY: 2, sprites: [1, 2, 3, 4, 5, 6, 7, 8] })],
    },
    {
      id: 102,
      category: 'item',
      flags: { offset: features.datFormat === 'v1' || features.datFormat === 'v2' ? { x: 8, y: 8 } : { x: 4, y: 6 }, elevation: 8, writable: 512 },
      groups: [createFrameGroup({ width: 2, height: 2, exactSize: 64, frames: 2, animation: anim(2), sprites: [1, 2, 3, 4, 5, 6, 7, 8] })],
    },
  ];
  const outfitGroups = features.frameGroups
    ? [
        createFrameGroup({ type: FrameGroupType.Idle, patternX: 4, layers: 2, sprites: [1, 2, 3, 4, 5, 6, 7, 8] }),
        createFrameGroup({ type: FrameGroupType.Moving, patternX: 4, layers: 2, frames: 2, animation: anim(2), sprites: Array.from({ length: 16 }, (_, i) => (i % 8) + 1) }),
      ]
    : [createFrameGroup({ patternX: 4, layers: 2, frames: 3, animation: anim(3), sprites: Array.from({ length: 24 }, (_, i) => (i % 8) + 1) })];
  return {
    signature: 0x12345678,
    items,
    outfits: [{ id: 1, category: 'outfit', flags: { animateAlways: true }, groups: outfitGroups }],
    effects: [{ id: 1, category: 'effect', flags: {}, groups: [createFrameGroup({ frames: 4, animation: anim(4), sprites: [1, 2, 3, 4] })] }],
    missiles: [{ id: 1, category: 'missile', flags: {}, groups: [createFrameGroup({ patternX: 3, patternY: 3, sprites: [1, 2, 3, 4, 5, 6, 7, 8, 1] })] }],
  };
}
