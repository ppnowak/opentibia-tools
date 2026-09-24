import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

interface Props {
  count: number;
  cellWidth: number;
  cellHeight: number;
  /** Index of the focused/selected cell. */
  selected?: number;
  renderCell(index: number): ComponentChildren;
  /** Changing this key scrolls the selected cell into view. */
  scrollKey?: unknown;
  /** Keyboard navigation: called with the new index (shift = extend selection). */
  onNavigate?(index: number, shift: boolean): void;
  onActivate?(index: number): void;
  label?: string;
}

/** Windowed grid: only visible rows are rendered (lists can hold 50k+ things). */
export function VirtualGrid({ count, cellWidth, cellHeight, selected, renderCell, scrollKey, onNavigate, onActivate, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 300, h: 400 });
  const [scroll, setScroll] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const cols = Math.max(1, Math.floor(size.w / cellWidth));
  const rows = Math.ceil(count / cols);

  useEffect(() => {
    if (selected === undefined || selected < 0 || !ref.current) return;
    const top = Math.floor(selected / cols) * cellHeight;
    const el = ref.current;
    if (top < el.scrollTop || top + cellHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 2 + cellHeight / 2);
    }
  }, [scrollKey, cols]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!onNavigate || selected === undefined || !count) return;
    const page = Math.max(1, Math.floor(size.h / cellHeight)) * cols;
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: cols,
      ArrowUp: -cols,
      PageDown: page,
      PageUp: -page,
    };
    let next: number | undefined;
    if (e.key in moves) next = selected + moves[e.key];
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = count - 1;
    else if (e.key === 'Enter') {
      onActivate?.(selected);
      e.preventDefault();
      return;
    }
    if (next === undefined) return;
    e.preventDefault();
    onNavigate(Math.max(0, Math.min(count - 1, next)), e.shiftKey);
  };

  const first = Math.max(0, Math.floor(scroll / cellHeight) - 2);
  const last = Math.min(rows, Math.ceil((scroll + size.h) / cellHeight) + 2);
  const cells = [];
  for (let r = first; r < last; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (i >= count) break;
      cells.push(
        <div key={i} class="vcell" style={{ top: r * cellHeight, left: c * cellWidth, width: cellWidth, height: cellHeight }}>
          {renderCell(i)}
        </div>,
      );
    }
  }
  return (
    <div class="vgrid" ref={ref} tabIndex={0} role="grid" aria-label={label} onKeyDown={onKeyDown} onScroll={(e) => setScroll((e.target as HTMLDivElement).scrollTop)}>
      <div style={{ height: rows * cellHeight, position: 'relative' }}>{cells}</div>
    </div>
  );
}
