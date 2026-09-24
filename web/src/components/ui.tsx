import { Fragment, type ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-preact';
import { closeDialog } from '../state.ts';

export interface MenuItem {
  label: string;
  keys?: string;
  run(): void;
  enabled?: boolean;
  checked?: boolean;
  section?: boolean;
}

/** Floating menu at a screen position (menus and context menus). */
export function Dropdown({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ x: Math.min(x, window.innerWidth - r.width - 4), y: Math.min(y, window.innerHeight - r.height - 4) });
    }
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    setTimeout(() => window.addEventListener('pointerdown', down), 0);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [x, y]);
  return (
    <div class="dropdown" ref={ref} style={{ left: pos.x, top: pos.y }} role="menu">
      {items.map((it, i) => (
        <Fragment key={`${i}-${it.label}`}>
          {it.section && i > 0 && <hr />}
          <button
            class="item"
            role="menuitem"
            disabled={it.enabled === false}
            onClick={() => {
              onClose();
              it.run();
            }}
          >
            <span class="tick">{it.checked && <Check size={14} />}</span>
            <span class="label">{it.label}</span>
            {it.keys && <span class="keys">{it.keys}</span>}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

/** Drag handle resizing a neighbouring pane. */
export function Splitter({ dir, onDrag }: { dir: 'v' | 'h'; onDrag(delta: number): void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      class={`splitter-${dir} ${dragging ? 'dragging' : ''}`}
      role="separator"
      aria-orientation={dir === 'v' ? 'vertical' : 'horizontal'}
      onPointerDown={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.setPointerCapture(e.pointerId);
        setDragging(true);
        let last = dir === 'v' ? e.clientX : e.clientY;
        const move = (ev: PointerEvent) => {
          const cur = dir === 'v' ? ev.clientX : ev.clientY;
          onDrag(cur - last);
          last = cur;
        };
        const up = () => {
          setDragging(false);
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      }}
    />
  );
}

/** Collapsible inspector section. */
export function Section({ title, count, children, initiallyOpen = true, id }: { title: string; count?: ComponentChildren; children: ComponentChildren; initiallyOpen?: boolean; id: string }) {
  const storageKey = `ot-tools:section:${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return v === null ? initiallyOpen : v === '1';
    } catch {
      return initiallyOpen;
    }
  });
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(storageKey, open ? '0' : '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <div class="section">
      <button class="section-head" onClick={toggle} aria-expanded={open}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
        {count !== undefined && <span class="count">{count}</span>}
      </button>
      {open && <div class="section-body">{children}</div>}
    </div>
  );
}

export function Modal({ title, children, wide, footer }: { title: string; children: ComponentChildren; wide?: boolean; footer?: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDialog();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="overlay" onPointerDown={(e) => e.target === e.currentTarget && closeDialog()}>
      <div class={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button class="icon" aria-label="Close" onClick={closeDialog}>
            <X size={16} />
          </button>
        </header>
        <div class="modal-body">{children}</div>
        {footer && <div class="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
