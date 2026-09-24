import { readCwm } from './cwm/cwm.ts';
import { supportedFlags, FLAG_INFO, type FlagName } from './dat/flags.ts';
import { CATEGORY_KEY, spriteCount, type DatFile, type ThingCategory } from './dat/types.ts';
import { isPng } from './image/png.ts';
import type { SpriteArchive } from './spr/spr.ts';
import type { ClientFeatures } from './versions.ts';

export type Severity = 'error' | 'warning' | 'info';

export interface Problem {
  severity: Severity;
  code: string;
  message: string;
  category?: ThingCategory;
  id?: number;
  spriteId?: number;
}

export interface ValidationInput {
  dat: DatFile;
  features: ClientFeatures;
  spr?: SpriteArchive;
  /** Raw Tibia.cwm bytes (optional). */
  cwm?: Uint8Array;
}

export interface ValidationOptions {
  /** Report things without any sprite (off by default: real clients contain many). */
  emptyThings?: boolean;
  /** Stop collecting after this many problems (default 5000). */
  limit?: number;
}

export interface ValidationReport {
  problems: Problem[];
  errors: number;
  warnings: number;
  infos: number;
  /** Problems beyond the limit that were counted but not listed. */
  truncated: number;
}

function pngSize(data: Uint8Array): { width: number; height: number } | undefined {
  if (!isPng(data) || data.length < 24) return undefined;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

/** Check a client for structural problems that would break it in a game client. */
export function validateClient(input: ValidationInput, options: ValidationOptions = {}): ValidationReport {
  const limit = options.limit ?? 5000;
  const report: ValidationReport = { problems: [], errors: 0, warnings: 0, infos: 0, truncated: 0 };
  const add = (p: Problem) => {
    if (p.severity === 'error') report.errors++;
    else if (p.severity === 'warning') report.warnings++;
    else report.infos++;
    if (report.problems.length < limit) report.problems.push(p);
    else report.truncated++;
  };

  const { dat, features, spr } = input;
  const allowed = new Set(supportedFlags(features.datFormat));
  const maxSprite = spr?.count;
  const used = spr ? new Uint8Array(spr.count + 1) : undefined;

  if (!features.extended && spr && spr.count > 0xffff) {
    add({ severity: 'error', code: 'sprite-count-overflow', message: `${spr.count} sprites need the "extended" layout (max 65535 without it)` });
  }
  if (dat.items.length + 99 > 0xffff) add({ severity: 'error', code: 'item-count-overflow', message: 'Too many items for a u16 header' });

  for (const category of ['item', 'outfit', 'effect', 'missile'] as const) {
    const list = dat[CATEGORY_KEY[category]];
    const first = category === 'item' ? 100 : 1;
    list.forEach((t, index) => {
      const id = t.id ?? first + index;
      if (t.id !== undefined && t.id !== first + index) {
        add({ severity: 'error', code: 'id-sequence', message: `${category} at position ${index} has id ${t.id}, expected ${first + index}`, category, id });
      }
      for (const [flag, value] of Object.entries(t.flags)) {
        if (value === undefined) continue;
        if (!(flag in FLAG_INFO)) add({ severity: 'error', code: 'unknown-flag', message: `Unknown flag "${flag}"`, category, id });
        else if (!allowed.has(flag as FlagName)) {
          add({ severity: 'warning', code: 'unsupported-flag', message: `Flag "${FLAG_INFO[flag as FlagName].label}" is not supported by this client version and will be dropped`, category, id });
        }
      }
      const light = t.flags.light;
      if (light && (light.level > 255 || light.color > 255)) {
        add({ severity: 'warning', code: 'light-range', message: `Light level/color out of range (${light.level}/${light.color})`, category, id });
      }
      if (!t.groups.length) add({ severity: 'error', code: 'no-frame-group', message: 'Thing has no frame group', category, id });
      if (t.groups.length > 1 && !(category === 'outfit' && features.frameGroups)) {
        add({ severity: 'warning', code: 'extra-frame-groups', message: `${t.groups.length} frame groups; only the first is saved for this layout`, category, id });
      }
      let anySprite = false;
      t.groups.forEach((g, gi) => {
        const where = t.groups.length > 1 ? ` (group ${gi})` : '';
        for (const key of ['width', 'height', 'layers', 'patternX', 'patternY', 'patternZ', 'frames'] as const) {
          if (!Number.isInteger(g[key]) || g[key] < 1 || g[key] > 255) {
            add({ severity: 'error', code: 'bad-dimension', message: `${key} = ${g[key]} must be 1..255${where}`, category, id });
          }
        }
        const expected = spriteCount(g);
        if (g.sprites.length !== expected) {
          add({ severity: 'error', code: 'sprite-slots', message: `${g.sprites.length} sprite slots, expected ${expected}${where}`, category, id });
        }
        if (features.enhancedAnimations && g.frames > 1) {
          const d = g.animation?.durations;
          if (d && d.length !== g.frames) {
            add({ severity: 'error', code: 'animation-frames', message: `${d.length} frame durations for ${g.frames} frames${where}`, category, id });
          }
          d?.forEach((x, i) => {
            if (x.min > x.max) add({ severity: 'warning', code: 'animation-range', message: `Frame ${i + 1} min duration ${x.min} > max ${x.max}${where}`, category, id });
          });
        }
        for (const sid of g.sprites) {
          if (!sid) continue;
          anySprite = true;
          if (!features.extended && sid > 0xffff) {
            add({ severity: 'error', code: 'sprite-id-overflow', message: `Sprite id ${sid} needs the "extended" layout${where}`, category, id, spriteId: sid });
          } else if (maxSprite !== undefined && sid > maxSprite) {
            add({ severity: 'error', code: 'missing-sprite', message: `References sprite ${sid} but the spr has ${maxSprite}${where}`, category, id, spriteId: sid });
          } else if (used) used[sid] = 1;
        }
      });
      if (!anySprite && options.emptyThings) add({ severity: 'info', code: 'empty-thing', message: 'Thing has no sprites', category, id });
    });
  }

  if (spr && used) {
    let unused = 0;
    for (let i = 1; i <= spr.count; i++) if (!used[i] && !spr.isEmpty(i)) unused++;
    if (unused) add({ severity: 'info', code: 'unused-sprites', message: `${unused} non-empty sprites are not used by any thing` });
  }

  if (input.cwm) {
    try {
      const cwm = readCwm(input.cwm);
      let wrongSize = 0;
      for (const e of cwm.entries) {
        const sid = Number.parseInt(e.name, 10);
        if (!Number.isFinite(sid)) {
          add({ severity: 'warning', code: 'cwm-name', message: `CWM entry "${e.name}" is not named by sprite id` });
          continue;
        }
        const size = pngSize(e.data);
        if (!size) add({ severity: 'error', code: 'cwm-not-png', message: `CWM entry ${e.name} is not a PNG image`, spriteId: sid });
        else if (size.width !== cwm.size || size.height !== cwm.size) wrongSize++;
        if (spr && sid > spr.count) add({ severity: 'warning', code: 'cwm-orphan', message: `CWM has sprite ${sid} beyond the spr (${spr.count})`, spriteId: sid });
      }
      if (wrongSize) add({ severity: 'warning', code: 'cwm-size', message: `${wrongSize} CWM images are not ${cwm.size}×${cwm.size}px` });
    } catch (e) {
      add({ severity: 'error', code: 'cwm-invalid', message: `Invalid CWM file: ${(e as Error).message}` });
    }
  }
  return report;
}

export function formatProblemsMarkdown(report: ValidationReport, title = 'Client validation'): string {
  const icon = report.errors ? '❌' : report.warnings ? '⚠️' : '✅';
  const lines = [`### ${icon} ${title}`, '', `**${report.errors}** errors, **${report.warnings}** warnings, **${report.infos}** notes`, ''];
  if (report.problems.length) {
    lines.push('| Severity | Where | Problem |', '| --- | --- | --- |');
    for (const p of report.problems.slice(0, 200)) {
      const where = p.category ? `${p.category} ${p.id}` : p.spriteId ? `sprite ${p.spriteId}` : '—';
      lines.push(`| ${p.severity} | ${where} | ${p.message.replace(/\|/g, '\\|')} |`);
    }
    const hidden = report.problems.length - 200 + report.truncated;
    if (hidden > 0) lines.push('', `…and ${hidden} more.`);
  }
  return `${lines.join('\n')}\n`;
}
