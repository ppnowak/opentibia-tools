import type { ThingCategory, ThingType } from '../../../src/core/dat/types.ts';
import { datToJson, exportThings } from '../../../src/core/json.ts';
import { versionLabel } from '../../../src/core/versions.ts';
import {
  activeDoc,
  activity,
  clipboard,
  closeDialog,
  commitAdd,
  commitRemove,
  currentDoc,
  dialog,
  dirty,
  docKey,
  docs,
  explorerCategory,
  historySize,
  layout,
  library,
  librarySelection,
  libraryCategory,
  multi,
  openDialog,
  openDoc,
  paletteOpen,
  project,
  redo,
  runValidation,
  saveTarget,
  selectThing,
  setLayout,
  showActivity,
  showPanel,
  toast,
  touch,
  undo,
  withBusy,
  closeDoc,
} from '../state.ts';
import { canPickDirectory, download, pickDirectory, pickFiles, writeToDirectory, type DirectoryHandle, type OutputFile } from './files.ts';
import { openCwmIntoProject, openFiles } from './loader.ts';

// ---------------------------------------------------------------- selection helpers

/** Things targeted by edit commands: the explorer multi-selection, else the active thing tab. */
export function selectedThings(): ThingType[] {
  const p = project.value;
  if (!p) return [];
  const doc = currentDoc();
  const category = explorerCategory.value;
  const ids = [...multi.value];
  if (ids.length > 1 || (ids.length === 1 && (!doc || doc.kind !== 'thing'))) {
    return ids.sort((a, b) => a - b).map((id) => p.get(category, id)).filter((t): t is ThingType => !!t);
  }
  if (doc?.kind === 'thing') {
    const t = p.get(doc.category!, doc.id!);
    return t ? [t] : [];
  }
  return [];
}

// ---------------------------------------------------------------- file actions

export async function saveClient(): Promise<void> {
  const p = project.value;
  if (!p) return;
  await withBusy('Saving…', async (progress) => {
    const out = p.compile();
    const outputs: OutputFile[] = [
      { name: 'Tibia.dat', data: out.dat },
      { name: 'Tibia.spr', data: out.spr },
    ];
    if (p.hiRes.size) outputs.push({ name: 'Tibia.cwm', data: await p.buildCwmAsync({ onProgress: progress }) });
    if (canPickDirectory) {
      let target = saveTarget.value;
      if (!target) {
        const dir = await pickDirectory();
        if (!dir) return;
        target = { name: dir.name, handle: dir };
        saveTarget.value = target;
      }
      await writeToDirectory(target.handle as DirectoryHandle, outputs);
      toast(`Saved ${outputs.map((o) => o.name).join(', ')} to “${target.name}”`, 'success');
    } else {
      for (const o of outputs) download(o.name, o.data);
      toast(`Downloaded ${outputs.map((o) => o.name).join(', ')}`, 'success');
    }
    dirty.value = false;
  });
}

export async function openClientFiles(): Promise<void> {
  const files = await pickFiles('.dat,.spr,.cwm,.zip,.json');
  if (files.length) await openFiles(files);
}

export function closeClient(): void {
  if (dirty.value && !confirm('Discard unsaved changes?')) return;
  project.value = null;
  dirty.value = false;
  docs.value = docs.value.filter((d) => d.kind === 'welcome' || d.kind === 'versions' || d.kind === 'shortcuts' || d.kind === 'cwm');
  if (!docs.value.some((d) => d.key === activeDoc.value)) {
    openDoc({ key: 'welcome', kind: 'welcome', title: 'Welcome' }, true);
  }
}

export async function importBundle(): Promise<void> {
  const [file] = await pickFiles('.json', false);
  if (file) await openFiles([file]);
}

export async function loadCwm(): Promise<void> {
  const [file] = await pickFiles('.cwm', false);
  if (file) await openCwmIntoProject(file);
}

export function exportDatJson(): void {
  const p = project.value;
  if (!p) return;
  download(`Tibia-${p.label}.json`, JSON.stringify(datToJson(p.dat, p.version, p.features), null, 1), 'application/json');
}

// ---------------------------------------------------------------- edit actions

export function duplicateSelection(): void {
  const p = project.value;
  const things = selectedThings();
  if (!p || !things.length) return;
  let last: ThingType | undefined;
  for (const t of things) {
    last = p.duplicate(t.category, t.id);
    commitAdd(last);
  }
  if (last) selectThing(last.category, last.id, { pin: true });
  toast(`Duplicated ${things.length} ${things[0].category}(s)`, 'success');
}

export function removeSelection(): void {
  const things = selectedThings();
  if (!things.length) return;
  const label = things.length === 1 ? `${things[0].category} ${things[0].id}` : `${things.length} ${things[0].category}s`;
  if (!confirm(`Remove ${label}? (Removing the last one shrinks the list; others are cleared so following ids stay stable.)`)) return;
  for (const t of [...things].sort((a, b) => b.id - a.id)) {
    commitRemove(t.category, t.id);
    closeDoc(docKey('thing', t.category, t.id));
  }
  multi.value = new Set();
}

export function copySelection(): void {
  const p = project.value;
  if (activity.value === 'library' && library.value && librarySelection.value.size) {
    const src = library.value.project;
    const things = [...librarySelection.value]
      .sort((a, b) => a - b)
      .map((id) => src.get(libraryCategory.value, id))
      .filter((t): t is ThingType => !!t);
    clipboard.value = { source: src, things };
    toast(`Copied ${things.length} ${libraryCategory.value}(s) from client ${src.label}`);
    return;
  }
  const things = selectedThings();
  if (!p || !things.length) return;
  clipboard.value = { source: p, things };
  toast(`Copied ${things.length} ${things[0].category}(s)`);
}

export async function paste(category?: ThingCategory): Promise<void> {
  const p = project.value;
  const clip = clipboard.value;
  if (!p || !clip?.things.length) return;
  await withBusy('Pasting…', () => {
    const dropped = new Set<string>();
    let last: ThingType | undefined;
    for (const t of clip.things) {
      const { thing, report } = p.importThing(clip.source, t, category ?? t.category);
      for (const k of report.droppedFlags.keys()) dropped.add(k);
      commitAdd(thing);
      last = thing;
    }
    touch(true);
    if (last) selectThing(last.category, last.id, { pin: true });
    const from = clip.source === p ? '' : ` from client ${clip.source.label}`;
    toast(`Pasted ${clip.things.length} thing(s)${from}${dropped.size ? `; dropped unsupported flags: ${[...dropped].join(', ')}` : ''}`, 'success');
  });
}

export function exportSelectionBundle(): void {
  const p = project.value;
  const things = selectedThings();
  if (!p || !things.length) return;
  const name = things.length === 1 ? `${things[0].category}-${things[0].id}` : `${things[0].category}s-${things.length}`;
  download(`${name}.otthings.json`, JSON.stringify(exportThings(p, things)), 'application/json');
}

// ---------------------------------------------------------------- command registry

export type MenuName = 'File' | 'Edit' | 'View' | 'Tools' | 'Help';

export interface Command {
  id: string;
  label: string;
  menu?: MenuName;
  /** Display form, e.g. "Ctrl+Shift+S". Also used for matching key events. */
  keys?: string;
  /** Start a new menu section before this item. */
  section?: boolean;
  run(): void | Promise<void>;
  enabled?(): boolean;
  checked?(): boolean;
}

const hasProject = () => !!project.value;
const hasThing = () => selectedThings().length > 0;

export const COMMANDS: Command[] = [
  // File
  { id: 'file.new', label: 'New Client…', menu: 'File', keys: 'Alt+Shift+N', run: () => openDialog('new-client') },
  { id: 'file.open', label: 'Open…', menu: 'File', keys: 'Ctrl+O', run: openClientFiles },
  { id: 'file.openVersion', label: 'Open with Version…', menu: 'File', run: () => openDialog('open-client') },
  { id: 'file.packs', label: 'Preload Data Pack…', menu: 'File', run: () => showActivity('packs') },
  { id: 'file.save', label: 'Save', menu: 'File', keys: 'Ctrl+S', section: true, run: saveClient, enabled: hasProject },
  { id: 'file.saveAs', label: 'Save As / Convert…', menu: 'File', keys: 'Ctrl+Shift+S', run: () => openDialog('compile'), enabled: hasProject },
  { id: 'file.importBundle', label: 'Import Things Bundle…', menu: 'File', section: true, run: importBundle, enabled: hasProject },
  { id: 'file.loadCwm', label: 'Load High-Res Sprites (.cwm)…', menu: 'File', run: loadCwm, enabled: hasProject },
  { id: 'file.exportJson', label: 'Export Dat as JSON', menu: 'File', run: exportDatJson, enabled: hasProject },
  { id: 'file.close', label: 'Close Client', menu: 'File', section: true, run: closeClient, enabled: hasProject },
  // Edit
  { id: 'edit.undo', label: 'Undo', menu: 'Edit', keys: 'Ctrl+Z', run: undo, enabled: () => historySize.value.undo > 0 },
  { id: 'edit.redo', label: 'Redo', menu: 'Edit', keys: 'Ctrl+Shift+Z', run: redo, enabled: () => historySize.value.redo > 0 },
  { id: 'edit.redoY', label: 'Redo', keys: 'Ctrl+Y', run: redo, enabled: () => historySize.value.redo > 0 },
  { id: 'edit.copy', label: 'Copy Things', menu: 'Edit', keys: 'Ctrl+C', section: true, run: copySelection, enabled: () => hasThing() || librarySelection.value.size > 0 },
  { id: 'edit.paste', label: 'Paste Things', menu: 'Edit', keys: 'Ctrl+V', run: () => paste(), enabled: () => hasProject() && !!clipboard.value },
  { id: 'edit.duplicate', label: 'Duplicate', menu: 'Edit', keys: 'Ctrl+D', run: duplicateSelection, enabled: hasThing },
  { id: 'edit.remove', label: 'Remove', menu: 'Edit', keys: 'Delete', run: removeSelection, enabled: hasThing },
  { id: 'edit.new', label: 'New Thing from Images…', menu: 'Edit', keys: 'Alt+N', section: true, run: () => openDialog('new-thing', { category: explorerCategory.value }), enabled: hasProject },
  { id: 'edit.exportBundle', label: 'Export Selection as Bundle', menu: 'Edit', run: exportSelectionBundle, enabled: hasThing },
  // View
  { id: 'view.palette', label: 'Command Palette…', menu: 'View', keys: 'Ctrl+Shift+P', run: () => { paletteOpen.value = true; } },
  { id: 'view.explorer', label: 'Explorer', menu: 'View', keys: 'Ctrl+Shift+E', section: true, run: () => showActivity('explorer'), checked: () => layout.value.sidebar && activity.value === 'explorer' },
  { id: 'view.sprites', label: 'Sprites', menu: 'View', keys: 'Ctrl+Shift+U', run: () => showActivity('sprites'), checked: () => layout.value.sidebar && activity.value === 'sprites' },
  { id: 'view.library', label: 'Library (Other Client)', menu: 'View', keys: 'Ctrl+Shift+L', run: () => showActivity('library'), checked: () => layout.value.sidebar && activity.value === 'library' },
  { id: 'view.packs', label: 'Data Packs', menu: 'View', run: () => showActivity('packs'), checked: () => layout.value.sidebar && activity.value === 'packs' },
  { id: 'view.sidebar', label: 'Side Bar', menu: 'View', keys: 'Ctrl+B', section: true, run: () => setLayout({ sidebar: !layout.value.sidebar }), checked: () => layout.value.sidebar },
  { id: 'view.inspector', label: 'Inspector', menu: 'View', keys: 'Ctrl+Alt+B', run: () => setLayout({ inspector: !layout.value.inspector }), checked: () => layout.value.inspector },
  { id: 'view.panel', label: 'Panel', menu: 'View', keys: 'Ctrl+J', run: () => setLayout({ panel: !layout.value.panel }), checked: () => layout.value.panel },
  { id: 'view.problems', label: 'Problems', menu: 'View', keys: 'Ctrl+Shift+M', section: true, run: () => showPanel('problems') },
  { id: 'view.output', label: 'Output', menu: 'View', run: () => showPanel('output') },
  { id: 'view.welcome', label: 'Welcome', menu: 'View', section: true, run: () => openDoc({ key: 'welcome', kind: 'welcome', title: 'Welcome' }, true) },
  // Tools
  { id: 'tools.validate', label: 'Validate Client', menu: 'Tools', keys: 'F8', run: () => void runValidation(), enabled: hasProject },
  { id: 'tools.convert', label: 'Convert to Another Version…', menu: 'Tools', run: () => openDialog('compile'), enabled: hasProject },
  { id: 'tools.cwm', label: 'CWM Packer', menu: 'Tools', section: true, run: () => openDoc({ key: 'cwm', kind: 'cwm', title: 'CWM Packer' }, true) },
  // Help
  { id: 'help.shortcuts', label: 'Keyboard Shortcuts', menu: 'Help', run: () => openDoc({ key: 'shortcuts', kind: 'shortcuts', title: 'Keyboard Shortcuts' }, true) },
  { id: 'help.versions', label: 'Supported Versions', menu: 'Help', run: () => openDoc({ key: 'versions', kind: 'versions', title: 'Supported Versions' }, true) },
  { id: 'help.about', label: 'About & Legal', menu: 'Help', section: true, run: () => openDialog('about') },
];

export const MENUS: MenuName[] = ['File', 'Edit', 'View', 'Tools', 'Help'];

export function isEnabled(c: Command): boolean {
  return c.enabled ? c.enabled() : true;
}

export function runCommand(id: string): void {
  const c = COMMANDS.find((x) => x.id === id);
  if (c && isEnabled(c)) void c.run();
}

function matches(keys: string, e: KeyboardEvent): boolean {
  const parts = keys.split('+');
  const key = parts.pop()!.toLowerCase();
  const want = { ctrl: parts.includes('Ctrl'), shift: parts.includes('Shift'), alt: parts.includes('Alt') };
  if ((e.ctrlKey || e.metaKey) !== want.ctrl || e.shiftKey !== want.shift || e.altKey !== want.alt) return false;
  const pressed = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  return pressed === key || e.code.toLowerCase() === `key${key}`;
}

/** Global shortcut handler. Returns true when a command ran. */
export function handleShortcut(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  const editing = !!target?.closest('input, textarea, select, [contenteditable]');
  for (const c of COMMANDS) {
    if (!c.keys || !matches(c.keys, e)) continue;
    // let text fields keep their own copy/paste/undo/delete
    if (editing && !e.ctrlKey && !e.metaKey && !e.altKey && !/^F\d+$/.test(c.keys)) return false;
    if (editing && /^Ctrl\+(C|V|Z|Y|Shift\+Z)$/.test(c.keys)) return false;
    if (dialog.value && c.id !== 'view.palette') return false;
    e.preventDefault();
    if (isEnabled(c)) void c.run();
    return true;
  }
  return false;
}

export function closeOverlays(): void {
  paletteOpen.value = false;
  closeDialog();
}

export function versionTitle(): string {
  const p = project.value;
  return p ? `Client ${versionLabel(p.version)}` : 'No client';
}
