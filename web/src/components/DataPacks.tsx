import { useState } from 'preact/hooks';
import { versionLabel } from '../../../src/core/versions.ts';
import { pickFiles } from '../lib/files.ts';
import { DATA_PACKS, downloadPackToComputer, packUrl, preloadPack, PACKS_BASE_URL, type DataPack } from '../lib/packs.ts';
import { withBusy } from '../state.ts';

interface Props {
  /** Called with the extracted client files (and the pack's version as a hint). */
  onFiles(files: File[], version: number): Promise<void> | void;
  /** Called with a zip the user downloaded and picked manually. */
  onZip(files: File[]): Promise<void> | void;
}

function packLabel(p: DataPack): string {
  const suffix = p.name.includes('_') ? ` (${p.name.split('_').slice(1).join(' ')})` : p.name.includes('.') && p.name.split('.').length > 2 ? ` (${p.name})` : '';
  return `${versionLabel(p.version)}${suffix} — ${p.size}B`;
}

/** Pick one of the public data packs; the user's browser downloads it straight from downloads.ots.me. */
export function DataPacks({ onFiles, onZip }: Props) {
  const [name, setName] = useState('860');
  const [waiting, setWaiting] = useState<DataPack | null>(null);
  const pack = DATA_PACKS.find((p) => p.name === name) ?? DATA_PACKS[0];

  const preload = async () => {
    const result = await withBusy(`Downloading ${pack.name}.zip from downloads.ots.me…`, (progress) =>
      preloadPack(pack, (done, total) => progress(done, total)),
    );
    if (!result) return;
    if (result.kind === 'files') {
      setWaiting(null);
      await onFiles(result.files, pack.version);
    } else setWaiting(pack);
  };

  const openDownloaded = async () => {
    const files = await pickFiles('.zip,.dat,.spr,.cwm');
    if (files.length) await onZip(files);
  };

  return (
    <section class="card">
      <h2>Preload a data pack</h2>
      <p>
        Get the <code>Tibia.dat</code> + <code>Tibia.spr</code> of any protocol from the public collection at{' '}
        <a href={PACKS_BASE_URL} target="_blank" rel="noopener noreferrer">
          downloads.ots.me
        </a>
        .
      </p>
      <div class="row wrap">
        <label class="field inline">
          <span>Pack</span>
          <select value={pack.name} onChange={(e) => setName((e.target as HTMLSelectElement).value)}>
            {[...DATA_PACKS].reverse().map((p) => (
              <option key={p.name} value={p.name}>
                {packLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <button class="primary" onClick={preload}>
          Preload
        </button>
      </div>
      {waiting && (
        <div class="notice" role="status">
          <p>
            Your browser is downloading <strong>{waiting.name}.zip</strong> ({waiting.size}B) from downloads.ots.me. When it has finished, open
            the downloaded zip here — it is extracted locally in your browser.
          </p>
          <div class="row wrap">
            <button class="primary" onClick={openDownloaded}>
              Open downloaded {waiting.name}.zip…
            </button>
            <button class="ghost" onClick={() => downloadPackToComputer(waiting)}>
              Download again
            </button>
            <a class="small" href={packUrl(waiting)} target="_blank" rel="noopener noreferrer">
              direct link
            </a>
          </div>
        </div>
      )}
      <p class="hint">
        OpenTibia Tools does not host, mirror or redistribute any client files. Packs are downloaded by your own browser directly from
        downloads.ots.me to your computer and only extracted locally; nothing is uploaded. You are responsible for having the right to use them.
      </p>
    </section>
  );
}
