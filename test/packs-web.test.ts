import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { DATA_PACKS, expandZips, packUrl, packVersion, versionFromName } from '../web/src/lib/packs.ts';

describe('data packs', () => {
  it('lists every published pack with its version', () => {
    expect(DATA_PACKS).toHaveLength(100);
    expect(packVersion('860_old')).toBe(860);
    expect(packVersion('15.10.2daede')).toBe(1510);
    expect(packUrl(DATA_PACKS[0])).toBe('https://downloads.ots.me/data/tibia-clients/dat_and_spr/710.zip');
  });

  it('derives version hints from zip names', () => {
    expect(versionFromName('860.zip')).toBe(860);
    expect(versionFromName('C:\\Downloads\\15.10.2daede.zip')).toBe(1510);
    expect(versionFromName('860_old.zip')).toBe(860);
    expect(versionFromName('client.zip')).toBeUndefined();
  });

  it('extracts client files from a pack zip', async () => {
    const zip = zipSync({ '772/': new Uint8Array(0), '772/Tibia.dat': new Uint8Array([1, 2]), '772/Tibia.spr': new Uint8Array([3]), '772/readme.txt': new Uint8Array([9]) });
    const { files, version } = await expandZips([new File([zip], '772.zip')]);
    expect(version).toBe(772);
    expect(files.map((f) => f.name).sort()).toEqual(['Tibia.dat', 'Tibia.spr']);
    expect(new Uint8Array(await files.find((f) => f.name === 'Tibia.spr')!.arrayBuffer())).toEqual(new Uint8Array([3]));
  });
});
