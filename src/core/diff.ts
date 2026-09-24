import { FLAG_INFO, type FlagName } from './dat/flags.ts';
import { CATEGORY_KEY, type DatFile, type FrameGroup, type ThingCategory, type ThingType } from './dat/types.ts';
import type { SpriteArchive } from './spr/spr.ts';

export interface ThingChange {
  category: ThingCategory;
  id: number;
  changes: string[];
}

export interface DatDiff {
  added: Array<{ category: ThingCategory; id: number }>;
  removed: Array<{ category: ThingCategory; id: number }>;
  changed: ThingChange[];
  counts: Record<ThingCategory, { before: number; after: number }>;
}

export interface SpriteDiff {
  before: number;
  after: number;
  added: number[];
  removed: number[];
  changed: number[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function describeGroup(g: FrameGroup): string {
  return `${g.width}×${g.height}, ${g.layers} layer(s), patterns ${g.patternX}/${g.patternY}/${g.patternZ}, ${g.frames} frame(s)`;
}

function flagLabel(name: string): string {
  return FLAG_INFO[name as FlagName]?.label ?? name;
}

function isEmpty(t: ThingType): boolean {
  return !Object.keys(t.flags).length && t.groups.every((g) => g.sprites.every((s) => !s));
}

export function diffThing(a: ThingType, b: ThingType): string[] {
  const changes: string[] = [];
  const keys = new Set([...Object.keys(a.flags), ...Object.keys(b.flags)]);
  for (const k of keys) {
    const va = (a.flags as Record<string, unknown>)[k];
    const vb = (b.flags as Record<string, unknown>)[k];
    if (va === undefined && vb !== undefined) changes.push(`+ ${flagLabel(k)}${vb === true ? '' : ` ${JSON.stringify(vb)}`}`);
    else if (va !== undefined && vb === undefined) changes.push(`- ${flagLabel(k)}`);
    else if (!same(va, vb)) changes.push(`~ ${flagLabel(k)}: ${JSON.stringify(va)} → ${JSON.stringify(vb)}`);
  }
  if (a.groups.length !== b.groups.length) changes.push(`frame groups: ${a.groups.length} → ${b.groups.length}`);
  const n = Math.min(a.groups.length, b.groups.length);
  for (let i = 0; i < n; i++) {
    const ga = a.groups[i];
    const gb = b.groups[i];
    const label = n > 1 ? `group ${i}: ` : '';
    const da = describeGroup(ga);
    const db = describeGroup(gb);
    if (da !== db) changes.push(`${label}${da} → ${db}`);
    else {
      let spriteChanges = 0;
      for (let s = 0; s < ga.sprites.length; s++) if (ga.sprites[s] !== gb.sprites[s]) spriteChanges++;
      if (spriteChanges) changes.push(`${label}${spriteChanges} sprite slot(s) changed`);
    }
    if (!same(ga.animation, gb.animation) && da === db) changes.push(`${label}animation timing changed`);
  }
  return changes;
}

/** Compare two dat files thing by thing (by id). */
export function diffDat(before: DatFile, after: DatFile): DatDiff {
  const diff: DatDiff = {
    added: [],
    removed: [],
    changed: [],
    counts: {} as DatDiff['counts'],
  };
  for (const category of ['item', 'outfit', 'effect', 'missile'] as const) {
    const a = before[CATEGORY_KEY[category]];
    const b = after[CATEGORY_KEY[category]];
    const first = category === 'item' ? 100 : 1;
    diff.counts[category] = { before: a.length, after: b.length };
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const id = first + i;
      if (i >= a.length) diff.added.push({ category, id });
      else if (i >= b.length) diff.removed.push({ category, id });
      else {
        const changes = diffThing(a[i], b[i]);
        if (!changes.length) continue;
        if (!isEmpty(a[i]) && isEmpty(b[i])) diff.removed.push({ category, id });
        else diff.changed.push({ category, id, changes });
      }
    }
  }
  return diff;
}

/** Compare sprite archives by encoded sprite records. */
export function diffSprites(before: SpriteArchive, after: SpriteArchive): SpriteDiff {
  const out: SpriteDiff = { before: before.count, after: after.count, added: [], removed: [], changed: [] };
  const max = Math.max(before.count, after.count);
  for (let id = 1; id <= max; id++) {
    const a = before.getRecord(id);
    const b = after.getRecord(id);
    if (!a && !b) continue;
    // a record may exist but hold only transparent pixels, which is the same as empty
    const blank = (arc: SpriteArchive) => arc.getPixels(id).every((v, i) => (i & 3) !== 3 || v === 0);
    if (!a) {
      if (!blank(after)) out.added.push(id);
    } else if (!b) {
      if (!blank(before)) out.removed.push(id);
    }
    else if (a.length !== b.length || a.some((v, i) => i >= 3 && v !== b[i])) {
      // encodings differ (other color key or encoder): compare the actual pixels
      const pa = before.getPixels(id);
      const pb = after.getPixels(id);
      if (pa.some((v, i) => v !== pb[i])) out.changed.push(id);
    }
  }
  return out;
}

export function isEmptyDiff(d: DatDiff, s?: SpriteDiff): boolean {
  return !d.added.length && !d.removed.length && !d.changed.length && (!s || (!s.added.length && !s.removed.length && !s.changed.length));
}

export function formatDiffMarkdown(d: DatDiff, s?: SpriteDiff, title = 'Client changes'): string {
  const lines = [`### ${title}`, ''];
  if (isEmptyDiff(d, s)) return `${lines.join('\n')}No changes.\n`;
  lines.push('| | Before | After |', '| --- | ---: | ---: |');
  for (const [c, v] of Object.entries(d.counts)) lines.push(`| ${c}s | ${v.before} | ${v.after} |`);
  if (s) lines.push(`| sprites | ${s.before} | ${s.after} |`);
  lines.push('');
  const list = (items: Array<{ category: string; id: number }>) =>
    items.slice(0, 50).map((x) => `${x.category} ${x.id}`).join(', ') + (items.length > 50 ? `, … (${items.length} total)` : '');
  if (d.added.length) lines.push(`**Added (${d.added.length}):** ${list(d.added)}`, '');
  if (d.removed.length) lines.push(`**Removed/cleared (${d.removed.length}):** ${list(d.removed)}`, '');
  if (d.changed.length) {
    lines.push(`**Changed (${d.changed.length}):**`, '');
    for (const c of d.changed.slice(0, 100)) lines.push(`- ${c.category} ${c.id}: ${c.changes.join('; ')}`);
    if (d.changed.length > 100) lines.push(`- … ${d.changed.length - 100} more`);
    lines.push('');
  }
  if (s && (s.added.length || s.removed.length || s.changed.length)) {
    lines.push(`**Sprites:** ${s.added.length} added, ${s.changed.length} changed, ${s.removed.length} removed`, '');
  }
  return `${lines.join('\n')}\n`;
}

export function formatDiffText(d: DatDiff, s?: SpriteDiff): string {
  if (isEmptyDiff(d, s)) return 'No changes.';
  const lines: string[] = [];
  for (const [c, v] of Object.entries(d.counts)) if (v.before !== v.after) lines.push(`${c}s: ${v.before} -> ${v.after}`);
  for (const a of d.added) lines.push(`+ ${a.category} ${a.id}`);
  for (const r of d.removed) lines.push(`- ${r.category} ${r.id}`);
  for (const c of d.changed) lines.push(`~ ${c.category} ${c.id}: ${c.changes.join('; ')}`);
  if (s) lines.push(`sprites: ${s.before} -> ${s.after} (${s.added.length} added, ${s.changed.length} changed, ${s.removed.length} removed)`);
  return lines.join('\n');
}
