import { signal } from '@preact/signals';
import type { Project } from '../../src/core/project.ts';
import type { ThingCategory, ThingType } from '../../src/core/dat/types.ts';
import type { OutfitColors } from '../../src/core/render.ts';
import { validateClient, type ValidationReport } from '../../src/core/validate.ts';

// ---------------------------------------------------------------- project & files

export interface LoadedFiles {
  dat?: string;
  spr?: string;
  cwm?: string;
}

export const project = signal<Project | null>(null);
export const files = signal<LoadedFiles>({});
/** Bumped after every change to the project; components read it to re-render. */
export const revision = signal(0);
/** Bumped when sprite pixels change (invalidates thumbnails). */
export const spriteRevision = signal(0);
export const dirty = signal(false);

export function touch(sprites = false): void {
  revision.value++;
  if (sprites) spriteRevision.value++;
  dirty.value = true;
}

// ---------------------------------------------------------------- workbench layout

export type Activity = 'explorer' | 'sprites' | 'library' | 'packs';
export type PanelTab = 'problems' | 'output';

export interface Layout {
  sidebar: boolean;
  inspector: boolean;
  panel: boolean;
  sidebarWidth: number;
  inspectorWidth: number;
  panelHeight: number;
  panelTab: PanelTab;
  thumb: number;
}

const LAYOUT_KEY = 'ot-tools:layout';
const defaultLayout: Layout = { sidebar: true, inspector: true, panel: false, sidebarWidth: 300, inspectorWidth: 310, panelHeight: 190, panelTab: 'output', thumb: 64 };

function loadLayout(): Layout {
  try {
    return { ...defaultLayout, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') };
  } catch {
    return defaultLayout;
  }
}

export const layout = signal<Layout>(loadLayout());
export const activity = signal<Activity>('explorer');

export function setLayout(patch: Partial<Layout>): void {
  layout.value = { ...layout.value, ...patch };
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout.value));
  } catch {
    /* ignore */
  }
}

/** Reveal a side bar view. */
export function showActivity(a: Activity): void {
  activity.value = a;
  if (!layout.value.sidebar) setLayout({ sidebar: true });
}

/** Activity bar click: clicking the visible view collapses the side bar. */
export function toggleActivity(a: Activity): void {
  if (activity.value === a && layout.value.sidebar) setLayout({ sidebar: false });
  else showActivity(a);
}

export function showPanel(tab: PanelTab): void {
  setLayout({ panel: true, panelTab: tab });
}

// ---------------------------------------------------------------- documents (editor tabs)

export type DocKind = 'welcome' | 'thing' | 'sprite' | 'cwm' | 'versions' | 'shortcuts';

export interface Doc {
  key: string;
  kind: DocKind;
  category?: ThingCategory;
  id?: number;
  /** Preview tabs are replaced by the next opened document unless pinned. */
  preview?: boolean;
  title?: string;
}

const WELCOME: Doc = { key: 'welcome', kind: 'welcome', title: 'Welcome' };
export const docs = signal<Doc[]>([WELCOME]);
export const activeDoc = signal<string>('welcome');

export function docKey(kind: DocKind, category?: string, id?: number): string {
  return [kind, category, id].filter((x) => x !== undefined).join(':');
}

export function openDoc(doc: Doc, pin = false): void {
  const list = docs.value;
  const existing = list.find((d) => d.key === doc.key);
  if (existing) {
    if (pin && existing.preview) docs.value = list.map((d) => (d.key === doc.key ? { ...d, preview: false } : d));
  } else {
    const next = { ...doc, preview: !pin };
    const previewIdx = list.findIndex((d) => d.preview);
    if (!pin && previewIdx >= 0) docs.value = list.map((d, i) => (i === previewIdx ? next : d));
    else {
      const activeIdx = list.findIndex((d) => d.key === activeDoc.value);
      docs.value = [...list.slice(0, activeIdx + 1), next, ...list.slice(activeIdx + 1)];
    }
  }
  activeDoc.value = doc.key;
}

export function pinDoc(key: string): void {
  docs.value = docs.value.map((d) => (d.key === key ? { ...d, preview: false } : d));
}

export function closeDoc(key: string): void {
  const list = docs.value;
  const idx = list.findIndex((d) => d.key === key);
  if (idx < 0) return;
  const next = list.filter((d) => d.key !== key);
  docs.value = next;
  if (activeDoc.value === key) activeDoc.value = next[Math.min(idx, next.length - 1)]?.key ?? '';
}

export function closeAllDocs(): void {
  docs.value = [WELCOME];
  activeDoc.value = 'welcome';
}

export function currentDoc(): Doc | undefined {
  return docs.value.find((d) => d.key === activeDoc.value);
}

// ---------------------------------------------------------------- selection

export const explorerCategory = signal<ThingCategory>('item');
export const selected = signal<Record<ThingCategory | 'sprite', number>>({ item: 100, outfit: 1, effect: 1, missile: 1, sprite: 1 });
/** Multi selection in the explorer (ids of explorerCategory). */
export const multi = signal<Set<number>>(new Set());

export function selectThing(category: ThingCategory, id: number, opts: { pin?: boolean; keepMulti?: boolean } = {}): void {
  selected.value = { ...selected.value, [category]: id };
  explorerCategory.value = category;
  if (!opts.keepMulti) multi.value = new Set([id]);
  openDoc({ key: docKey('thing', category, id), kind: 'thing', category, id }, opts.pin);
}

export function selectSprite(id: number, pin = false): void {
  selected.value = { ...selected.value, sprite: id };
  openDoc({ key: docKey('sprite', undefined, id), kind: 'sprite', id }, pin);
}

/** Back-compat helper used by dialogs. */
export function select(t: ThingCategory | 'sprite', id: number): void {
  if (t === 'sprite') selectSprite(id);
  else selectThing(t, id);
}

// ---------------------------------------------------------------- view preferences

export const outfitColors = signal<OutfitColors>({ head: 78, body: 69, legs: 58, feet: 76 });

// ---------------------------------------------------------------- library (second client)

export const library = signal<{ project: Project; name: string } | null>(null);
export const libraryCategory = signal<ThingCategory>('outfit');
export const librarySelection = signal<Set<number>>(new Set());

// ---------------------------------------------------------------- clipboard

export const clipboard = signal<{ source: Project; things: ThingType[] } | null>(null);

// ---------------------------------------------------------------- output log, notifications, problems

export interface LogEntry {
  id: number;
  time: Date;
  level: 'info' | 'error' | 'success' | 'warning';
  text: string;
}

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success' | 'warning';
  text: string;
}

export const logs = signal<LogEntry[]>([]);
export const toasts = signal<Toast[]>([]);
let seq = 0;

export function log(text: string, level: LogEntry['level'] = 'info'): void {
  logs.value = [...logs.value.slice(-499), { id: ++seq, time: new Date(), level, text }];
}

/** Latest message shown in the status bar for a few seconds. */
export const statusMessage = signal<{ id: number; text: string; level: LogEntry['level'] } | null>(null);

/**
 * Notify the user. Everything is written to the Output log and flashed in the status bar;
 * errors and important results also pop up as a toast (at most three at a time).
 */
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 4000): void {
  log(text, kind);
  const id = ++seq;
  statusMessage.value = { id, text, level: kind };
  setTimeout(() => {
    if (statusMessage.value?.id === id) statusMessage.value = null;
  }, 6000);
  if (kind === 'info') return;
  const t = { id, kind, text };
  toasts.value = [...toasts.value, t].slice(-3);
  setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== t.id)), kind === 'error' ? Math.max(ms, 7000) : ms);
}

export const problems = signal<ValidationReport | null>(null);

export function runValidation(show = true): ValidationReport | null {
  const p = project.value;
  if (!p) return null;
  const report = validateClient({ dat: p.dat, features: p.features, spr: p.spr });
  problems.value = report;
  log(`Validation: ${report.errors} errors, ${report.warnings} warnings, ${report.infos} notes`, report.errors ? 'error' : report.warnings ? 'warning' : 'success');
  if (show) showPanel('problems');
  return report;
}

// ---------------------------------------------------------------- dialogs & busy state

export interface Busy {
  label: string;
  done?: number;
  total?: number;
}

export const busy = signal<Busy | null>(null);
export const dialog = signal<{ kind: string; props?: Record<string, unknown> } | null>(null);
export const paletteOpen = signal(false);

export function openDialog(kind: string, props?: Record<string, unknown>): void {
  dialog.value = { kind, props };
}

export function closeDialog(): void {
  dialog.value = null;
}

/** Directory chosen on the first "Save" (File System Access API) reused by later saves. */
export const saveTarget = signal<{ name: string; handle: unknown } | null>(null);

// ---------------------------------------------------------------- undo / redo for thing edits

type HistoryEntry =
  | { kind: 'replace'; before: ThingType; after: ThingType }
  | { kind: 'add'; thing: ThingType }
  | { kind: 'remove'; before: ThingType; wasLast: boolean };

const undoStack: HistoryEntry[] = [];
const redoStack: HistoryEntry[] = [];
export const historySize = signal({ undo: 0, redo: 0 });

function syncHistory(): void {
  historySize.value = { undo: undoStack.length, redo: redoStack.length };
}

function record(entry: HistoryEntry): void {
  undoStack.push(entry);
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  syncHistory();
}

export function resetHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
  syncHistory();
}

/** Replace a thing (immutable update) and record it for undo. */
export function commitThing(next: ThingType): void {
  const p = project.value;
  if (!p) return;
  const before = p.get(next.category, next.id);
  if (!before) return;
  p.replace(next);
  record({ kind: 'replace', before, after: next });
  touch();
}

export function commitAdd(thing: ThingType): void {
  record({ kind: 'add', thing });
  touch();
}

export function commitRemove(category: ThingCategory, id: number): void {
  const p = project.value;
  if (!p) return;
  const before = p.get(category, id);
  if (!before) return;
  const wasLast = p.list(category).length - 1 === id - (category === 'item' ? 100 : 1);
  p.remove(category, id);
  record({ kind: 'remove', before, wasLast });
  touch();
}

function apply(entry: HistoryEntry, undoing: boolean): void {
  const p = project.value;
  if (!p) return;
  switch (entry.kind) {
    case 'replace':
      p.replace(undoing ? entry.before : entry.after);
      selectThing(entry.before.category, entry.before.id);
      break;
    case 'add':
      if (undoing) p.remove(entry.thing.category, entry.thing.id);
      else p.list(entry.thing.category).push(entry.thing);
      if (!undoing) selectThing(entry.thing.category, entry.thing.id);
      break;
    case 'remove':
      if (undoing) {
        if (entry.wasLast) p.list(entry.before.category).push(entry.before);
        else p.replace(entry.before);
      } else p.remove(entry.before.category, entry.before.id);
      selectThing(entry.before.category, entry.before.id);
      break;
  }
  touch();
}

export function undo(): void {
  const e = undoStack.pop();
  if (!e) return;
  apply(e, true);
  redoStack.push(e);
  syncHistory();
}

export function redo(): void {
  const e = redoStack.pop();
  if (!e) return;
  apply(e, false);
  undoStack.push(e);
  syncHistory();
}

/** Run a long task while showing progress; yields to the UI periodically via the callback. */
export async function withBusy<T>(label: string, fn: (progress: (done: number, total: number) => Promise<void>) => Promise<T> | T): Promise<T | undefined> {
  busy.value = { label };
  await nextFrame();
  let last = 0;
  try {
    return await fn(async (done, total) => {
      const now = performance.now();
      if (now - last > 80) {
        last = now;
        busy.value = { label, done, total };
        await nextFrame();
      }
    });
  } catch (e) {
    console.error(e);
    toast((e as Error).message, 'error', 8000);
    return undefined;
  } finally {
    busy.value = null;
  }
}

export function nextFrame(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
