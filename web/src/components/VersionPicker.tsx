import { DAT_FORMATS } from '../../../src/core/dat/flags.ts';
import { ALL_VERSIONS, featuresFor, versionLabel, type ClientFeatures } from '../../../src/core/versions.ts';

export interface VersionChoice {
  /** undefined = auto-detect */
  version?: number;
  /** Explicit feature overrides (only when "custom" options are toggled). */
  features?: Partial<ClientFeatures>;
}

interface Props {
  value: VersionChoice;
  onChange(v: VersionChoice): void;
  allowAuto?: boolean;
  label?: string;
}

const FEATURE_LABELS: Array<[keyof Omit<ClientFeatures, 'datFormat'>, string, string]> = [
  ['extended', 'Extended', 'u32 sprite ids and sprite count (default for 9.60+)'],
  ['transparency', 'Transparency', 'Sprites with an alpha channel (OTClient feature)'],
  ['enhancedAnimations', 'Improved animations', 'Frame durations and loop settings (default for 10.50+)'],
  ['frameGroups', 'Frame groups', 'Separate idle/moving outfit animations (default for 10.57+)'],
];

export function VersionPicker({ value, onChange, allowAuto, label = 'Client version' }: Props) {
  const defaults = value.version ? featuresFor(value.version) : undefined;
  const effective = defaults ? { ...defaults, ...value.features } : undefined;
  return (
    <div class="version-picker">
      <label class="field">
        <span>{label}</span>
        <select
          value={value.version ?? ''}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            onChange({ version: v ? Number(v) : undefined, features: undefined });
          }}
        >
          {allowAuto && <option value="">Auto-detect</option>}
          {[...ALL_VERSIONS].reverse().map((v) => (
            <option key={v.value} value={v.value}>
              {v.label} — dat {DAT_FORMATS[v.features.datFormat].label}
            </option>
          ))}
        </select>
      </label>
      {effective && (
        <details class="features">
          <summary>
            Layout options{value.features && Object.keys(value.features).length ? ' (customized)' : ''}
          </summary>
          <div class="feature-grid">
            {FEATURE_LABELS.map(([key, text, help]) => (
              <label key={key} class="check" title={help}>
                <input
                  type="checkbox"
                  checked={effective[key]}
                  onChange={(e) => {
                    const checked = (e.target as HTMLInputElement).checked;
                    const next = { ...value.features, [key]: checked };
                    if (defaults && defaults[key] === checked) delete next[key];
                    onChange({ ...value, features: Object.keys(next).length ? next : undefined });
                  }}
                />
                {text}
              </label>
            ))}
          </div>
          <p class="hint">
            Defaults for {versionLabel(value.version!)}. Change them for custom clients (e.g. OTClient builds with extended
            sprites or transparency on older protocols).
          </p>
        </details>
      )}
    </div>
  );
}
