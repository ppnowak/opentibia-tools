import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

interface Props {
  count: number;
  cellWidth: number;
  cellHeight: number;
  selected?: number;
  renderCell(index: number): ComponentChildren;
  /** Changing this key scrolls the selected cell into view. */
  scrollKey?: unknown;
}

/** Windowed grid: only the visible rows are rendered (lists can hold 50k+ things). */
export function VirtualGrid({ count, cellWidth, cellHeight, selected, renderCell, scrollKey }: Props) {
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
    if (selected === undefined || !ref.current) return;
    const row = Math.floor(selected / cols);
    const top = row * cellHeight;
    const el = ref.current;
    if (top < el.scrollTop || top + cellHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 2 + cellHeight / 2);
    }
  }, [scrollKey, cols]);

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
    <div class="vgrid" ref={ref} onScroll={(e) => setScroll((e.target as HTMLDivElement).scrollTop)}>
      <div style={{ height: rows * cellHeight, position: 'relative' }}>{cells}</div>
    </div>
  );
}
