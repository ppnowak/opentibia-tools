import { zipSync } from 'fflate';
import { colorToAlpha, decodeBmp, type RgbaImage } from '../../../src/core/image/image.ts';
import { decodePng } from '../../../src/core/image/png.ts';

export async function readFile(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** Decode any browser supported image (png, bmp, gif, webp, jpg) into RGBA. */
export async function decodeImageFile(file: File, magentaToAlpha = true): Promise<RgbaImage> {
  const ext = extOf(file.name);
  let img: RgbaImage;
  try {
    const bitmap = await createImageBitmap(file, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    img = { width: bitmap.width, height: bitmap.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
    bitmap.close();
  } catch {
    const bytes = await readFile(file);
    img = ext === 'bmp' ? decodeBmp(bytes) : decodePng(bytes);
  }
  // Legacy sprite dumps use magenta as the transparent color.
  if (magentaToAlpha) colorToAlpha(img);
  return img;
}

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function download(name: string, data: Uint8Array | Uint8Array[] | string, mime = 'application/octet-stream'): void {
  const parts = (Array.isArray(data) ? data : [data]) as BlobPart[];
  downloadBlob(name, new Blob(parts, { type: mime }));
}

export interface OutputFile {
  name: string;
  data: Uint8Array | Uint8Array[];
}

interface DirectoryHandle {
  getFileHandle(name: string, opts: { create: boolean }): Promise<{ createWritable(): Promise<{ write(d: BlobPart): Promise<void>; close(): Promise<void> }> }>;
}

export const canPickDirectory = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** Save several files: into a user picked directory when supported, otherwise as downloads. */
export async function saveFiles(outputs: OutputFile[], preferDirectory = true): Promise<'directory' | 'download' | 'cancelled'> {
  if (preferDirectory && canPickDirectory) {
    let dir: DirectoryHandle;
    try {
      dir = await (window as unknown as { showDirectoryPicker(o: object): Promise<DirectoryHandle> }).showDirectoryPicker({ mode: 'readwrite' });
    } catch {
      return 'cancelled';
    }
    for (const f of outputs) {
      const handle = await dir.getFileHandle(f.name, { create: true });
      const w = await handle.createWritable();
      await w.write(new Blob((Array.isArray(f.data) ? f.data : [f.data]) as BlobPart[]));
      await w.close();
    }
    return 'directory';
  }
  for (const f of outputs) download(f.name, f.data);
  return 'download';
}

export function zipFiles(entries: Record<string, Uint8Array>): Uint8Array {
  return zipSync(entries, { level: 0 });
}

/** Open a file picker and resolve with the chosen files. */
export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.click();
  });
}

/** Collect files from a drop event, including files inside dropped folders. */
export async function filesFromDrop(e: DragEvent): Promise<File[]> {
  const items = [...(e.dataTransfer?.items ?? [])];
  const entries = items.map((i) => (i as DataTransferItem & { webkitGetAsEntry?(): FileSystemEntry | null }).webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
  if (!entries.length) return [...(e.dataTransfer?.files ?? [])];
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      out.push(await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)));
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const b of batch) await walk(b);
      }
    }
  };
  for (const entry of entries) await walk(entry);
  return out;
}
