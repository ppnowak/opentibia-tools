import { useState } from 'preact/hooks';
import type { ConversionReport } from '../../../src/core/convert.ts';
import { FLAG_INFO } from '../../../src/core/dat/flags.ts';
import { signatureFor } from '../../../src/core/signatures.ts';
import { versionLabel } from '../../../src/core/versions.ts';
import { canPickDirectory, saveFiles, type OutputFile } from '../lib/files.ts';
import { dirty, project, toast, withBusy } from '../state.ts';
import { Modal } from './ui.tsx';
import { VersionPicker, type VersionChoice } from './VersionPicker.tsx';

const hex = (n: number) => `0x${(n >>> 0).toString(16).toUpperCase()}`;

export function CompileDialog() {
  const p = project.value!;
  const [target, setTarget] = useState<VersionChoice>({ version: p.version });
  const sameVersion = target.version === p.version;
  const known = target.version ? signatureFor(target.version) : undefined;
  const [datSig, setDatSig] = useState('');
  const [sprSig, setSprSig] = useState('');
  const [cwm, setCwm] = useState(p.hiRes.size > 0);
  const [cwmSize, setCwmSize] = useState(p.hiResSize || 64);
  const [cwmOnlyHiRes, setCwmOnlyHiRes] = useState(false);
  const [report, setReport] = useState<ConversionReport | null>(null);

  const defaultDatSig = sameVersion ? p.dat.signature : (known?.dat ?? p.dat.signature);
  const defaultSprSig = sameVersion ? p.spr.signature : (known?.spr ?? p.spr.signature);

  const run = async (toDirectory: boolean) => {
    await withBusy('Compiling…', async (progress) => {
      const parse = (s: string) => (s.trim() ? Number.parseInt(s.trim(), s.trim().toLowerCase().startsWith('0x') ? 16 : 10) : undefined);
      // Customized features are applied on top of the target's defaults.
      const features = sameVersion ? { ...p.features, ...target.features } : target.features;
      const out = p.compile({
        version: target.version,
        features,
        datSignature: parse(datSig),
        sprSignature: parse(sprSig),
      });
      const outputs: OutputFile[] = [
        { name: 'Tibia.dat', data: out.dat },
        { name: 'Tibia.spr', data: out.spr },
      ];
      if (cwm) {
        const data = await p.buildCwmAsync({ size: cwmSize, onlyHiRes: cwmOnlyHiRes, onProgress: progress });
        outputs.push({ name: 'Tibia.cwm', data });
      }
      setReport(out.report);
      const how = await saveFiles(outputs, toDirectory);
      if (how === 'cancelled') return;
      if (sameVersion) dirty.value = false;
      toast(`Saved client ${versionLabel(out.version)} (${outputs.map((o) => o.name).join(', ')})`, 'success');
    });
  };

  return (
    <Modal title="Save / compile client">
      <VersionPicker label="Target version" value={target} onChange={setTarget} />
      {!sameVersion && (
        <p class="hint">
          Converting {p.label} → {target.version ? versionLabel(target.version) : ''}: flags the target does not know are dropped, outfit frame
          groups are merged/split and animation timings are added or removed.
        </p>
      )}
      <details>
        <summary>Signatures</summary>
        <div class="row wrap">
          <label class="field">
            <span>dat signature</span>
            <input placeholder={hex(defaultDatSig)} value={datSig} onInput={(e) => setDatSig((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span>spr signature</span>
            <input placeholder={hex(defaultSprSig)} value={sprSig} onInput={(e) => setSprSig((e.target as HTMLInputElement).value)} />
          </label>
        </div>
        <p class="hint">Clients check these values; defaults are the original ones (or the known signatures of the target version).</p>
      </details>
      <fieldset>
        <legend>OTClientV8 high resolution sprites</legend>
        <label class="check">
          <input type="checkbox" checked={cwm} onChange={(e) => setCwm((e.target as HTMLInputElement).checked)} /> Also build Tibia.cwm
        </label>
        {cwm && (
          <div class="row wrap">
            <label class="field inline">
              <span>Size</span>
              <select value={cwmSize} onChange={(e) => setCwmSize(Number((e.target as HTMLSelectElement).value))}>
                {[32, 48, 64, 96, 128].map((s) => (
                  <option key={s} value={s}>
                    {s}px
                  </option>
                ))}
              </select>
            </label>
            <label class="check">
              <input type="checkbox" checked={cwmOnlyHiRes} onChange={(e) => setCwmOnlyHiRes((e.target as HTMLInputElement).checked)} /> Only sprites with
              a high-res version ({p.hiRes.size})
            </label>
          </div>
        )}
      </fieldset>
      <div class="row">
        {canPickDirectory && (
          <button class="primary" onClick={() => run(true)}>
            Save to folder…
          </button>
        )}
        <button class={canPickDirectory ? '' : 'primary'} onClick={() => run(false)}>
          Download files
        </button>
      </div>
      {report && (report.droppedFlags.size > 0 || report.regroupedOutfits > 0 || report.truncatedPatternZ > 0 || report.warnings.length > 0) && (
        <div class="report">
          <h3>Conversion report</h3>
          <ul>
            {[...report.droppedFlags].map(([k, n]) => (
              <li key={k}>
                Dropped “{FLAG_INFO[k].label}” from {n} things
              </li>
            ))}
            {report.regroupedOutfits > 0 && <li>Converted frame groups of {report.regroupedOutfits} outfits</li>}
            {report.truncatedPatternZ > 0 && <li>Reduced pattern Z of {report.truncatedPatternZ} things</li>}
            {report.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
