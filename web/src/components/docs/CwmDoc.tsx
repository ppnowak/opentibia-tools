import { useEffect, useMemo, useState } from 'preact/hooks';
import { cwmSpriteId, readCwm, writeCwm, type CwmFile } from '../../../../src/core/cwm/cwm.ts';
import { decodePng } from '../../../../src/core/image/png.ts';
import { download, pickFiles, readFile, zipFiles } from '../../lib/files.ts';
import { project, toast, withBusy } from '../../state.ts';
import { VirtualGrid } from '../VirtualGrid.tsx';

function CwmImage({ data }: { data: Uint8Array }) {
  const url = useMemo(() => URL.createObjectURL(new Blob([data as BlobPart], { type: 'image/png' })), [data]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} class="pixel checker" width={64} height={64} alt="" loading="lazy" />;
}

/** OTClientV8 Tibia.cwm: inspect, extract, pack, or build from the open client. */
export function CwmDoc() {
  const [cwm, setCwm] = useState<(CwmFile & { name: string }) | null>(null);
  const [size, setSize] = useState(64);
  const p = project.value;

  const openCwm = async () => {
    const [file] = await pickFiles('.cwm', false);
    if (!file) return;
    await withBusy('Reading CWM…', async () => setCwm({ ...readCwm(await readFile(file)), name: file.name }));
  };

  const pack = async () => {
    const files = (await pickFiles('.png')).filter((f) => !Number.isNaN(cwmSpriteId(f.name)));
    if (!files.length) {
      toast('Choose PNG files named by sprite id (e.g. 123.png)', 'error');
      return;
    }
    await withBusy('Packing CWM…', async (progress) => {
      files.sort((a, b) => cwmSpriteId(a.name) - cwmSpriteId(b.name));
      const entries = [];
      for (let i = 0; i < files.length; i++) {
        entries.push({ name: files[i].name, data: await readFile(files[i]) });
        if (i % 200 === 0) await progress(i, files.length);
      }
      const detected = decodePng(entries[0].data).width;
      download('Tibia.cwm', writeCwm({ size: detected, entries }));
      toast(`Packed ${entries.length} sprites (${detected}px) into Tibia.cwm`, 'success');
    });
  };

  return (
    <div class="doc">
      <div class="doc-toolbar">
        <span class="doc-title">CWM Packer</span>
        <span class="muted small">OTClientV8 high resolution sprites</span>
        <span class="grow" />
        <button class="ghost" onClick={openCwm}>
          Open .cwm…
        </button>
        <button class="ghost" onClick={pack}>
          Pack PNG files…
        </button>
        {p && (
          <>
            <span class="sep" />
            <select value={size} onChange={(e) => setSize(Number((e.target as HTMLSelectElement).value))} title="Sprite size">
              {[48, 64, 96, 128].map((s) => (
                <option key={s} value={s}>
                  {s}px
                </option>
              ))}
            </select>
            <button
              class="ghost"
              title="Upscale every sprite of the open client (imported high-res sprites are used as-is)"
              onClick={() =>
                withBusy('Building CWM…', async (progress) => {
                  download('Tibia.cwm', await p.buildCwmAsync({ size, onProgress: progress }));
                })
              }
            >
              Build from client {p.label}
            </button>
          </>
        )}
      </div>
      {cwm ? (
        <>
          <div class="row" style={{ padding: '6px 12px' }}>
            <strong>{cwm.name}</strong>
            <span class="muted">
              version {cwm.version} · {cwm.size}px · {cwm.entries.length} images
            </span>
            <span class="grow" />
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
          <VirtualGrid
            count={cwm.entries.length}
            cellWidth={80}
            cellHeight={96}
            renderCell={(i) => (
              <div class="cell">
                <CwmImage data={cwm.entries[i].data} />
                <span>{cwm.entries[i].name}</span>
              </div>
            )}
          />
        </>
      ) : (
        <div class="doc-scroll">
          <p class="muted">
            <code>Tibia.cwm</code> holds PNG images named by sprite id — usually 64×64 versions of the 32×32 sprites in <code>Tibia.spr</code>. Open one to
            inspect or extract it, pack a folder of PNGs, or build one from the open client.
          </p>
        </div>
      )}
    </div>
  );
}
