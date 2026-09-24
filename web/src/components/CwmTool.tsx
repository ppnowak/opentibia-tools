import { useEffect, useMemo, useState } from 'preact/hooks';
import { cwmSpriteId, readCwm, writeCwm, type CwmFile } from '../../../src/core/cwm/cwm.ts';
import { decodePng } from '../../../src/core/image/png.ts';
import { download, filesFromDrop, pickFiles, readFile, zipFiles } from '../lib/files.ts';
import { project, toast, withBusy } from '../state.ts';
import { Modal } from './Dialogs.tsx';
import { VirtualGrid } from './VirtualGrid.tsx';

function CwmImage({ data }: { data: Uint8Array }) {
  const url = useMemo(() => URL.createObjectURL(new Blob([data as BlobPart], { type: 'image/png' })), [data]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} class="pixel" width={64} height={64} alt="" loading="lazy" />;
}

export function CwmTool() {
  const [cwm, setCwm] = useState<(CwmFile & { name: string }) | null>(null);
  const [size, setSize] = useState(64);
  const p = project.value;

  const openCwm = async (file: File) => {
    await withBusy('Reading CWM…', async () => {
      const parsed = readCwm(await readFile(file));
      setCwm({ ...parsed, name: file.name });
    });
  };

  const pack = async (files: File[]) => {
    const pngs = files.filter((f) => /\.png$/i.test(f.name) && !Number.isNaN(cwmSpriteId(f.name)));
    if (!pngs.length) {
      toast('Add PNG files named by sprite id (e.g. 123.png)', 'error');
      return;
    }
    await withBusy('Packing CWM…', async (progress) => {
      pngs.sort((a, b) => cwmSpriteId(a.name) - cwmSpriteId(b.name));
      const entries = [];
      for (let i = 0; i < pngs.length; i++) {
        entries.push({ name: pngs[i].name, data: await readFile(pngs[i]) });
        if (i % 200 === 0) await progress(i, pngs.length);
      }
      const detected = decodePng(entries[0].data).width;
      download('Tibia.cwm', writeCwm({ size: detected, entries }));
      toast(`Packed ${entries.length} sprites (${detected}px) into Tibia.cwm`, 'success');
    });
  };

  return (
    <Modal title="OTClientV8 CWM packer" wide>
      <p class="hint">
        <code>Tibia.cwm</code> is OTClientV8's container for high resolution sprites: PNG images named by sprite id (e.g. 64×64 versions of the
        32×32 sprites in <code>Tibia.spr</code>).
      </p>
      <div class="start-grid">
        <section
          class="card dropzone small"
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            const files = await filesFromDrop(e);
            const c = files.find((f) => /\.cwm$/i.test(f.name));
            if (c) await openCwm(c);
            else await pack(files);
          }}
        >
          <h3>Inspect / extract</h3>
          <button onClick={async () => { const [f] = await pickFiles('.cwm', false); if (f) await openCwm(f); }}>Open .cwm…</button>
          <h3>Pack</h3>
          <p>Drop a folder of PNG files named by sprite id to build a .cwm.</p>
          <button onClick={async () => pack(await pickFiles('.png'))}>Choose PNG files…</button>
        </section>
        {p && (
          <section class="card">
            <h3>From the open client ({p.label})</h3>
            <p>Upscale every sprite of the current Tibia.spr (high-res sprites you imported are used as-is).</p>
            <div class="row">
              <label class="field inline">
                <span>Size</span>
                <select value={size} onChange={(e) => setSize(Number((e.target as HTMLSelectElement).value))}>
                  {[48, 64, 96, 128].map((s) => (
                    <option key={s} value={s}>
                      {s}px
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() =>
                  withBusy('Building CWM…', async (progress) => {
                    const data = await p.buildCwmAsync({ size, onProgress: progress });
                    download('Tibia.cwm', data);
                  })
                }
              >
                Build Tibia.cwm
              </button>
            </div>
          </section>
        )}
      </div>
      {cwm && (
        <div class="cwm-view">
          <div class="row">
            <strong>{cwm.name}</strong>
            <span class="muted">
              version {cwm.version} · {cwm.size}px · {cwm.entries.length} images
            </span>
            <button
              onClick={() =>
                withBusy('Zipping…', () => {
                  const entries: Record<string, Uint8Array> = {};
                  for (const e of cwm.entries) entries[e.name] = e.data;
                  download(`${cwm.name.replace(/\.cwm$/i, '')}.zip`, zipFiles(entries), 'application/zip');
                })
              }
            >
              Extract all (zip)
            </button>
          </div>
          <div class="import-grid">
            <VirtualGrid
              count={cwm.entries.length}
              cellWidth={76}
              cellHeight={90}
              renderCell={(i) => (
                <div class="cell">
                  <CwmImage data={cwm.entries[i].data} />
                  <span>{cwm.entries[i].name}</span>
                </div>
              )}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
