import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { COMMANDS, isEnabled } from '../lib/commands.ts';
import { paletteOpen, project, selectThing, explorerCategory } from '../state.ts';
import { CATEGORIES, FIRST_ID, type ThingCategory } from '../../../src/core/dat/types.ts';

interface Entry {
  label: string;
  hint?: string;
  run(): void;
}

/** Ctrl+Shift+P: run any command, or type "item 2400" / "#2400" to jump to a thing. */
export function CommandPalette() {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    const p = project.value;
    const m = /^(?:(item|outfit|effect|missile)s?\s*|#)(\d+)$/i.exec(q.trim());
    if (p && m) {
      const category = (m[1]?.toLowerCase() as ThingCategory | undefined) ?? explorerCategory.value;
      const id = Number(m[2]);
      if (p.get(category, id)) out.push({ label: `Go to ${category} ${id}`, run: () => selectThing(category, id, { pin: true }) });
      for (const c of CATEGORIES)
        if (c !== category && p.get(c, id) && !m[1]) out.push({ label: `Go to ${c} ${id}`, run: () => selectThing(c, id, { pin: true }) });
    } else if (p && /^\d+$/.test(q.trim())) {
      const id = Number(q.trim());
      for (const c of CATEGORIES) if (id >= FIRST_ID[c] && p.get(c, id)) out.push({ label: `Go to ${c} ${id}`, run: () => selectThing(c, id, { pin: true }) });
    }
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    for (const c of COMMANDS) {
      if (!c.menu || !isEnabled(c)) continue;
      const text = `${c.menu} ${c.label}`.toLowerCase();
      if (words.every((w) => text.includes(w))) out.push({ label: `${c.menu}: ${c.label}`, hint: c.keys, run: () => void c.run() });
    }
    return out;
  }, [q]);

  const run = (e?: Entry) => {
    paletteOpen.value = false;
    e?.run();
  };

  return (
    <div class="overlay" onPointerDown={(e) => e.target === e.currentTarget && (paletteOpen.value = false)}>
      <div class="palette-box" role="dialog" aria-label="Command palette">
        <input
          ref={input}
          placeholder="Type a command, or an id like “item 2400”"
          value={q}
          onInput={(e) => {
            setQ((e.target as HTMLInputElement).value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') paletteOpen.value = false;
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIdx((i) => Math.min(entries.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIdx((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') run(entries[idx]);
          }}
        />
        <div class="palette-list dropdown" style={{ position: 'static', boxShadow: 'none', border: 'none' }}>
          {entries.map((e, i) => (
            <button key={e.label} class={`item ${i === idx ? 'active' : ''}`} onPointerEnter={() => setIdx(i)} onClick={() => run(e)}>
              <span class="tick" />
              <span class="label">{e.label}</span>
              {e.hint && <span class="keys">{e.hint}</span>}
            </button>
          ))}
          {!entries.length && <div class="empty-pane">No matching commands</div>}
        </div>
      </div>
    </div>
  );
}
