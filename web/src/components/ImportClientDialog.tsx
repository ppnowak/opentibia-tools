import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { FLAG_INFO, type FlagName } from '../../../src/core/dat/flags.ts';
import { CATEGORIES, FIRST_ID, type ThingCategory } from '../../../src/core/dat/types.ts';
import type { Project } from '../../../src/core/project.ts';
import { thingThumbnail } from '../lib/canvas.ts';
import { pickFiles } from '../lib/files.ts';
import { classifyFiles, openClient } from '../lib/loader.ts';
import { closeDialog, commitAdd, project, select, toast, touch, withBusy } from '../state.ts';
import { Modal } from './Dialogs.tsx';
import { Thumb } from './Thumb.tsx';
import { VersionPicker, type VersionChoice } from './VersionPicker.tsx';
import { VirtualGrid } from './VirtualGrid.tsx';

/** The source client stays loaded between dialog openings. */
const source = signal<{ project: Project; name: string } | null>(null);

export function ImportClientDialog() {
  const p = project.value!;
  const src = source.value;
  const [choice, setChoice] = useState<VersionChoice>({});
  const [category, setCategory] = useState<ThingCategory>('outfit');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [target, setTarget] = useState<ThingCategory | 'same'>('same');

  const open = async () => {
    const files = await pickFiles('.dat,.spr,.cwm');
    const req = classifyFiles(files);
    if (!req.dat || !req.spr) {
      toast('Select both Tibia.dat and Tibia.spr of the source client', 'error');
      return;
    }
    const sp = await openClient({ ...req, ...choice }, 'source');
    if (sp) {
      source.value = { project: sp, name: `${req.dat.name} (${sp.label})` };
      setPicked(new Set());
    }
  };

  const doImport = async () => {
    if (!src || !picked.size) return;
    const dropped = new Map<FlagName, number>();
    let last: { category: ThingCategory; id: number } | undefined;
    await withBusy('Importing…', async (progress) => {
      const ids = [...picked].sort((a, b) => a - b);
      for (let i = 0; i < ids.length; i++) {
        const thing = src.project.get(category, ids[i]);
        if (!thing) continue;
        const { thing: added, report } = p.importThing(src.project, thing, target === 'same' ? category : target);
        for (const [k, n] of report.droppedFlags) dropped.set(k, (dropped.get(k) ?? 0) + n);
        commitAdd(added);
        last = { category: added.category, id: added.id };
        await progress(i + 1, ids.length);
      }
    });
    touch(true);
    if (last) select(last.category, last.id);
    toast(
      `Imported ${picked.size} ${category}s from ${src.project.label}${dropped.size ? `; dropped unsupported flags: ${[...dropped.keys()].map((k) => FLAG_INFO[k].label).join(', ')}` : ''}`,
      'success',
      8000,
    );
    closeDialog();
  };

  const list = src?.project.list(category) ?? [];
  const first = FIRST_ID[category];

  return (
    <Modal title="Import things from another client" wide>
      <p class="hint">
        Copy items, outfits, effects or missiles (with their sprites) from any other client version into {p.label}. Things are converted to this
        client's layout automatically.
      </p>
      <div class="row wrap">
        <VersionPicker value={choice} onChange={setChoice} allowAuto label="Source version" />
        <button class="primary" onClick={open}>
          {src ? 'Open another source…' : 'Open source client (dat + spr)…'}
        </button>
        {src && <span class="muted">Source: {src.name}</span>}
      </div>
      {src && (
        <>
          <nav class="tabs small">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                class={category === c ? 'active' : ''}
                onClick={() => {
                  setCategory(c);
                  setPicked(new Set());
                }}
              >
                {c}s <small>{src.project.list(c).length}</small>
              </button>
            ))}
          </nav>
          <p class="muted small">Click to select, Shift+click to select a range. {picked.size} selected.</p>
          <div class="import-grid">
            <VirtualGrid
              count={list.length}
              cellWidth={76}
              cellHeight={90}
              renderCell={(i) => {
                const id = first + i;
                const thing = list[i];
                return (
                  <button
                    class={`cell ${picked.has(id) ? 'selected' : ''}`}
                    onClick={(e) => {
                      const next = new Set(picked);
                      if ((e as MouseEvent).shiftKey && anchor !== null) {
                        for (let x = Math.min(anchor, id); x <= Math.max(anchor, id); x++) next.add(x);
                      } else if (next.has(id)) next.delete(id);
                      else next.add(id);
                      setAnchor(id);
                      setPicked(next);
                    }}
                  >
                    <Thumb box={64} image={() => thingThumbnail(src.project, thing, 0)} deps={[thing]} />
                    <span>{id}</span>
                  </button>
                );
              }}
            />
          </div>
          <div class="row end wrap">
            <label class="field inline">
              <span>Add as</span>
              <select value={target} onChange={(e) => setTarget((e.target as HTMLSelectElement).value as ThingCategory | 'same')}>
                <option value="same">{category}s (same category)</option>
                {CATEGORIES.filter((c) => c !== category).map((c) => (
                  <option key={c} value={c}>
                    {c}s
                  </option>
                ))}
              </select>
            </label>
            <button class="ghost" onClick={() => setPicked(new Set())}>
              Clear selection
            </button>
            <button class="primary" disabled={!picked.size} onClick={doImport}>
              Import {picked.size || ''} selected
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
