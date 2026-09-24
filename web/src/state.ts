import { signal } from '@preact/signals';
import type { Project } from '../../src/core/project.ts';
import type { ThingCategory, ThingType } from '../../src/core/dat/types.ts';

export type Tab = ThingCategory | 'sprite';

export interface Busy {
  label: string;
  done?: number;
  total?: number;
}

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  text: string;
}

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
export const tab = signal<Tab>('item');
export const selected = signal<Record<Tab, number>>({ item: 100, outfit: 1, effect: 1, missile: 1, sprite: 1 });
export const busy = signal<Busy | null>(null);
export const toasts = signal<Toast[]>([]);
export const dirty = signal(false);
export const dialog = signal<{ kind: string; props?: Record<string, unknown> } | null>(null);

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 4500): void {
  const t = { id: ++toastId, kind, text };
  toasts.value = [...toasts.value, t];
  setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== t.id)), ms);
}

export function openDialog(kind: string, props?: Record<string, unknown>): void {
  dialog.value = { kind, props };
}

export function closeDialog(): void {
  dialog.value = null;
}

export function touch(sprites = false): void {
  revision.value++;
  if (sprites) spriteRevision.value++;
  dirty.value = true;
}

export function select(t: Tab, id: number): void {
  selected.value = { ...selected.value, [t]: id };
  tab.value = t;
}

// ---- undo / redo for thing edits -------------------------------------------------------

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

function apply(entry: HistoryEntry, undo: boolean): void {
  const p = project.value;
  if (!p) return;
  switch (entry.kind) {
    case 'replace':
      p.replace(undo ? entry.before : entry.after);
      select(entry.before.category, entry.before.id);
      break;
    case 'add':
      if (undo) p.remove(entry.thing.category, entry.thing.id);
      else p.list(entry.thing.category).push(entry.thing);
      select(entry.thing.category, undo ? Math.max(entry.thing.id - 1, entry.thing.category === 'item' ? 100 : 1) : entry.thing.id);
      break;
    case 'remove':
      if (undo) {
        if (entry.wasLast) p.list(entry.before.category).push(entry.before);
        else p.replace(entry.before);
      } else p.remove(entry.before.category, entry.before.id);
      select(entry.before.category, entry.before.id);
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
