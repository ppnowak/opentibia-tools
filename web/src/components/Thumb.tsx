import { useEffect, useRef } from 'preact/hooks';
import type { RgbaImage } from '../../../src/core/image/image.ts';
import { paint, paintFit } from '../lib/canvas.ts';

interface Props {
  image: () => RgbaImage;
  /** Values that should trigger a repaint. */
  deps: unknown[];
  /** Fit into a square box of this size; otherwise draw at `zoom`. */
  box?: number;
  zoom?: number;
  class?: string;
  title?: string;
}

export function Thumb({ image, deps, box, zoom = 1, class: cls, title }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const img = image();
    if (box) paintFit(ref.current, img, box);
    else paint(ref.current, img, zoom);
  }, deps);
  return <canvas ref={ref} class={cls ?? 'pixel'} title={title} />;
}
