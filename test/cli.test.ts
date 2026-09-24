import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const tmp = mkdtempSync(join(tmpdir(), 'ott-cli-'));
const built = join(tmp, 'built');

function cli(...args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ['--import', 'tsx', join(root, 'src/cli/index.ts'), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_STEP_SUMMARY: join(tmp, 'summary.md') },
  });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

describe('cli', () => {
  beforeAll(() => {
    const r = cli('build', 'examples/ci/client.build.json', `--out=${built}`);
    if (r.code !== 0) throw new Error(`build failed: ${r.stdout}\n${r.stderr}`);
  }, 60_000);

  it('builds a client from a manifest', () => {
    for (const f of ['Tibia.dat', 'Tibia.spr', 'Tibia.cwm', 'Tibia.json']) expect(existsSync(join(built, f))).toBe(true);
    const info = cli('info', built, '--json');
    expect(info.code).toBe(0);
    const data = JSON.parse(info.stdout);
    expect(data.version).toBe('8.60');
    expect(data.counts).toEqual({ item: 1, outfit: 1, effect: 0, missile: 0 });
    expect(data.hiResSprites).toBeGreaterThan(0);
  });

  it('validates clients and fails on errors', () => {
    const ok = cli('validate', built, '--strict', '--json');
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.stdout).errors).toBe(0);

    const json = JSON.parse(readFileSync(join(built, 'Tibia.json'), 'utf8'));
    json.items[0].groups[0].sprites[0] = 9999;
    writeFileSync(join(tmp, 'broken.json'), JSON.stringify(json));
    const bad = cli('validate', join(tmp, 'broken.json'), join(built, 'Tibia.spr'), '--json');
    expect(bad.code).toBe(1);
    expect(JSON.parse(bad.stdout).problems.some((p: { code: string }) => p.code === 'missing-sprite')).toBe(true);
    expect(readFileSync(join(tmp, 'summary.md'), 'utf8')).toContain('Validation of client 8.60');
  });

  it('diffs clients', () => {
    const same = cli('diff', built, built, '--fail-on-change');
    expect(same.code).toBe(0);
    expect(same.stdout).toContain('No changes');

    const json = JSON.parse(readFileSync(join(built, 'Tibia.json'), 'utf8'));
    delete json.items[0].flags.pickupable;
    writeFileSync(join(tmp, 'changed.json'), JSON.stringify(json));
    const changed = cli('diff', join(built, 'Tibia.json'), join(tmp, 'changed.json'), '--fail-on-change', '--json');
    expect(changed.code).toBe(1);
    expect(JSON.parse(changed.stdout).dat.changed[0].changes).toEqual(['- Pickupable']);
  });

  it('round-trips a client through a source tree', () => {
    const src = join(tmp, 'src');
    expect(cli('unpack-client', built, src).code).toBe(0);
    expect(existsSync(join(src, 'client.json'))).toBe(true);
    expect(existsSync(join(src, 'sprites', '1.png'))).toBe(true);
    const out = join(tmp, 'repacked');
    expect(cli('pack-client', src, out).code).toBe(0);
    expect(readFileSync(join(out, 'Tibia.dat'))).toEqual(readFileSync(join(built, 'Tibia.dat')));
    expect(cli('diff', built, out, '--fail-on-change').code).toBe(0);
  });

  it('keeps the legacy --mode commands', () => {
    const json = join(tmp, 'legacy.json');
    const dat = join(tmp, 'legacy.dat');
    expect(cli('--mode=unpack-dat', join(built, 'Tibia.dat'), json, '--client=8.60').code).toBe(0);
    expect(cli('--mode=pack-dat', json, dat).code).toBe(0);
    expect(readFileSync(dat)).toEqual(readFileSync(join(built, 'Tibia.dat')));
  });

  it('converts between versions', () => {
    const out = join(tmp, 'converted');
    expect(cli('convert', built, out, '--target=10.98').code).toBe(0);
    const info = JSON.parse(cli('info', out, '--json').stdout);
    expect(info.features.frameGroups).toBe(true);
    expect(info.counts.outfit).toBe(1);
  });

  it('reports usage errors with exit code 2', () => {
    expect(cli('convert', 'nothing').code).toBe(2);
    expect(cli('no-such-command').code).toBe(2);
    expect(cli('help').code).toBe(0);
  });
});
