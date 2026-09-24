import { useState } from 'preact/hooks';
import { Redo2, Save, Undo2 } from 'lucide-preact';
import { COMMANDS, MENUS, isEnabled, runCommand, type MenuName } from '../lib/commands.ts';
import { dirty, files, historySize, project, revision } from '../state.ts';
import { Dropdown } from './ui.tsx';

export function MenuBar() {
  revision.value;
  const [open, setOpen] = useState<{ menu: MenuName; x: number; y: number } | null>(null);
  const p = project.value;
  const title = p
    ? `${[files.value.dat, files.value.spr].filter(Boolean).join(' · ') || 'Untitled client'} — Client ${p.label}${dirty.value ? ' ●' : ''}`
    : 'OpenTibia Tools';

  const show = (menu: MenuName, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setOpen({ menu, x: r.left, y: r.bottom + 2 });
  };

  return (
    <header class="menubar">
      <div class="logo">
        <img src="./icons/icon.svg" alt="" width={18} height={18} />
      </div>
      {MENUS.map((m) => (
        <button
          key={m}
          class={`menu-btn ${open?.menu === m ? 'open' : ''}`}
          onClick={(e) => (open?.menu === m ? setOpen(null) : show(m, e.currentTarget as HTMLElement))}
          onPointerEnter={(e) => open && open.menu !== m && show(m, e.currentTarget as HTMLElement)}
        >
          {m}
        </button>
      ))}
      <div class="title">{title}</div>
      <div class="quick">
        <button class="icon" title="Undo (Ctrl+Z)" disabled={!historySize.value.undo} onClick={() => runCommand('edit.undo')}>
          <Undo2 size={15} />
        </button>
        <button class="icon" title="Redo (Ctrl+Shift+Z)" disabled={!historySize.value.redo} onClick={() => runCommand('edit.redo')}>
          <Redo2 size={15} />
        </button>
        <button class="icon" title="Save (Ctrl+S)" disabled={!p} onClick={() => runCommand('file.save')}>
          <Save size={15} />
        </button>
      </div>
      {open && (
        <Dropdown
          key={open.menu}
          x={open.x}
          y={open.y}
          onClose={() => setOpen(null)}
          items={COMMANDS.filter((c) => c.menu === open.menu).map((c) => ({
            label: c.label,
            keys: c.keys,
            section: c.section,
            enabled: isEnabled(c),
            checked: c.checked?.(),
            run: () => void c.run(),
          }))}
        />
      )}
    </header>
  );
}
