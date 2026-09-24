import { useState } from 'preact/hooks';
import { DAT_FORMATS, FLAG_INFO, supportedFlags, type FlagName, type MarketInfo, type ThingFlags } from '../../../src/core/dat/flags.ts';
import { createFrameGroup, FrameGroupType, resizeFrameGroup, type FrameGroup, type GroupDimensions, type ThingCategory, type ThingType } from '../../../src/core/dat/types.ts';
import { commitThing, project, revision, selected, tab } from '../state.ts';

export function PropertiesPanel() {
  const p = project.value!;
  revision.value;
  const category = tab.value as ThingCategory;
  const thing = p.get(category, selected.value[category]);
  const [section, setSection] = useState<'flags' | 'group'>('flags');
  if (!thing) return <aside class="props" />;
  return (
    <aside class="props">
      <nav class="tabs small">
        <button class={section === 'flags' ? 'active' : ''} onClick={() => setSection('flags')}>
          Flags
        </button>
        <button class={section === 'group' ? 'active' : ''} onClick={() => setSection('group')}>
          Appearance
        </button>
      </nav>
      {section === 'flags' ? <FlagsEditor thing={thing} /> : <GroupsEditor thing={thing} />}
    </aside>
  );
}

function num(e: Event): number {
  const v = Number((e.target as HTMLInputElement).value);
  return Number.isFinite(v) ? v : 0;
}

function FlagsEditor({ thing }: { thing: ThingType }) {
  const p = project.value!;
  const names = supportedFlags(p.features.datFormat);
  const unsupported = (Object.keys(thing.flags) as FlagName[]).filter((k) => !names.includes(k));
  const setFlag = (name: FlagName, value: unknown) => {
    const flags: Record<string, unknown> = { ...thing.flags };
    if (value === undefined || value === false) delete flags[name];
    else flags[name] = value;
    commitThing({ ...thing, flags: flags as ThingFlags });
  };
  const defaults: Record<string, unknown> = {
    u16: 0,
    light: { level: 3, color: 215 },
    offset: { x: 8, y: 8 },
    market: { category: 1, tradeAs: thing.id, showAs: thing.id, name: '', restrictVocation: 0, requiredLevel: 0 },
  };
  return (
    <div class="flags">
      {names.map((name) => {
        const info = FLAG_INFO[name];
        const value = thing.flags[name] as unknown;
        const on = value !== undefined;
        return (
          <div key={name} class={`flag ${on ? 'on' : ''}`}>
            <label class="check">
              <input type="checkbox" checked={on} onChange={(e) => setFlag(name, (e.target as HTMLInputElement).checked ? (info.kind === 'bool' ? true : defaults[info.kind]) : undefined)} />
              {info.label}
            </label>
            {on && info.kind === 'u16' && (
              <label class="sub">
                {'valueLabel' in info ? info.valueLabel : 'Value'}
                <input type="number" min={0} max={65535} value={value as number} onChange={(e) => setFlag(name, num(e))} />
              </label>
            )}
            {on && info.kind === 'light' && (
              <div class="sub">
                <label>
                  Level <input type="number" min={0} max={65535} value={(value as { level: number }).level} onChange={(e) => setFlag(name, { ...(value as object), level: num(e) })} />
                </label>
                <label>
                  Color <input type="number" min={0} max={65535} value={(value as { color: number }).color} onChange={(e) => setFlag(name, { ...(value as object), color: num(e) })} />
                </label>
              </div>
            )}
            {on && info.kind === 'offset' && (
              <div class="sub">
                <label>
                  X <input type="number" min={0} max={65535} value={(value as { x: number }).x} onChange={(e) => setFlag(name, { ...(value as object), x: num(e) })} />
                </label>
                <label>
                  Y <input type="number" min={0} max={65535} value={(value as { y: number }).y} onChange={(e) => setFlag(name, { ...(value as object), y: num(e) })} />
                </label>
              </div>
            )}
            {on && info.kind === 'market' && <MarketEditor value={value as MarketInfo} onChange={(m) => setFlag(name, m)} />}
          </div>
        );
      })}
      {unsupported.length > 0 && (
        <p class="hint warn">
          Flags not supported by this client version (dropped on save): {unsupported.map((k) => FLAG_INFO[k].label).join(', ')}
        </p>
      )}
    </div>
  );
}

function MarketEditor({ value, onChange }: { value: MarketInfo; onChange(m: MarketInfo): void }) {
  const field = (key: keyof MarketInfo, label: string) => (
    <label>
      {label}
      {key === 'name' ? (
        <input type="text" maxLength={255} value={value.name} onChange={(e) => onChange({ ...value, name: (e.target as HTMLInputElement).value })} />
      ) : (
        <input type="number" min={0} max={65535} value={value[key] as number} onChange={(e) => onChange({ ...value, [key]: num(e) })} />
      )}
    </label>
  );
  return (
    <div class="sub market">
      {field('name', 'Name')}
      {field('category', 'Category')}
      {field('tradeAs', 'Trade as')}
      {field('showAs', 'Show as')}
      {field('restrictVocation', 'Vocation')}
      {field('requiredLevel', 'Level')}
    </div>
  );
}

const DIMS: Array<[keyof GroupDimensions, string, number]> = [
  ['width', 'Width (tiles)', 8],
  ['height', 'Height (tiles)', 8],
  ['layers', 'Layers', 8],
  ['patternX', 'Pattern X', 16],
  ['patternY', 'Pattern Y', 16],
  ['patternZ', 'Pattern Z', 16],
  ['frames', 'Frames', 255],
];

function GroupsEditor({ thing }: { thing: ThingType }) {
  const p = project.value!;
  const canGroups = thing.category === 'outfit' && p.features.frameGroups;
  const setGroup = (i: number, g: FrameGroup) => {
    const groups = thing.groups.slice();
    groups[i] = g;
    commitThing({ ...thing, groups });
  };
  return (
    <div class="groups">
      {thing.groups.map((g, i) => (
        <fieldset key={i}>
          <legend>{thing.groups.length > 1 || canGroups ? (g.type === FrameGroupType.Moving ? 'Moving' : 'Idle') : 'Frame group'}</legend>
          <div class="dims">
            {DIMS.map(([key, label, max]) =>
              key === 'patternZ' && !DAT_FORMATS[p.features.datFormat].patternZ ? null : (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min={1}
                    max={max}
                    value={g[key]}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(max, num(e)));
                      if (v !== g[key]) setGroup(i, resizeFrameGroup(g, { [key]: v }));
                    }}
                  />
                </label>
              ),
            )}
            {(g.width > 1 || g.height > 1) && (
              <label title="Stored 'exact size' byte used by the client for large things">
                Exact size
                <input type="number" min={1} max={255} value={g.exactSize} onChange={(e) => setGroup(i, { ...g, exactSize: Math.max(1, Math.min(255, num(e))) })} />
              </label>
            )}
          </div>
          <p class="muted small">{g.sprites.length} sprite slots</p>
          {g.frames > 1 && p.features.enhancedAnimations && <AnimationEditor group={g} onChange={(ng) => setGroup(i, ng)} />}
          {canGroups && thing.groups.length > 1 && (
            <button class="small danger" onClick={() => commitThing({ ...thing, groups: thing.groups.filter((_, j) => j !== i) })}>
              Remove group
            </button>
          )}
        </fieldset>
      ))}
      {canGroups && thing.groups.length < 2 && (
        <button
          onClick={() => {
            const base = thing.groups[0];
            const moving = createFrameGroup({ ...base, type: FrameGroupType.Moving, sprites: base.sprites.slice() });
            const groups = [{ ...base, type: FrameGroupType.Idle }, moving];
            commitThing({ ...thing, groups });
          }}
        >
          Add moving group
        </button>
      )}
    </div>
  );
}

function AnimationEditor({ group, onChange }: { group: FrameGroup; onChange(g: FrameGroup): void }) {
  const a = group.animation ?? { mode: 0, loopCount: 0, startFrame: 0, durations: Array.from({ length: group.frames }, () => ({ min: 100, max: 100 })) };
  const set = (patch: Partial<typeof a>) => onChange({ ...group, animation: { ...a, ...patch } });
  return (
    <details class="animation">
      <summary>Animation timing</summary>
      <div class="dims">
        <label>
          Mode
          <select value={a.mode} onChange={(e) => set({ mode: num(e) })}>
            <option value={0}>Asynchronous</option>
            <option value={1}>Synchronous</option>
          </select>
        </label>
        <label title="0 = infinite, -1 = ping-pong">
          Loop count
          <input type="number" min={-1} value={a.loopCount} onChange={(e) => set({ loopCount: num(e) })} />
        </label>
        <label title="-1 = random">
          Start frame
          <input type="number" min={-1} max={group.frames - 1} value={a.startFrame} onChange={(e) => set({ startFrame: num(e) })} />
        </label>
        <label>
          Set all (ms)
          <input
            type="number"
            min={0}
            placeholder="e.g. 100"
            onChange={(e) => {
              const v = num(e);
              set({ durations: a.durations.map(() => ({ min: v, max: v })) });
            }}
          />
        </label>
      </div>
      <table class="durations">
        <thead>
          <tr>
            <th>Frame</th>
            <th>Min ms</th>
            <th>Max ms</th>
          </tr>
        </thead>
        <tbody>
          {a.durations.map((d, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                <input type="number" min={0} value={d.min} onChange={(e) => set({ durations: a.durations.map((x, j) => (j === i ? { ...x, min: num(e) } : x)) })} />
              </td>
              <td>
                <input type="number" min={0} value={d.max} onChange={(e) => set({ durations: a.durations.map((x, j) => (j === i ? { ...x, max: num(e) } : x)) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
