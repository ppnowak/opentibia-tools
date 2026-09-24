import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { DAT_FORMATS, FLAG_INFO, supportedFlags, type FlagName, type MarketInfo, type ThingFlags } from '../../../src/core/dat/flags.ts';
import { createFrameGroup, FrameGroupType, resizeFrameGroup, type FrameGroup, type GroupDimensions, type ThingType } from '../../../src/core/dat/types.ts';
import { OUTFIT_COLOR_COUNT, outfitColor, type OutfitColors } from '../../../src/core/render.ts';
import { commitThing, currentDoc, activeDoc, outfitColors, project, revision, spriteRevision } from '../state.ts';
import { Section } from './ui.tsx';

function num(e: Event): number {
  const v = Number((e.target as HTMLInputElement).value);
  return Number.isFinite(v) ? v : 0;
}

export function Inspector({ width }: { width: number }) {
  revision.value;
  activeDoc.value;
  const p = project.value;
  const doc = currentDoc();
  let body;
  if (p && doc?.kind === 'thing') {
    const thing = p.get(doc.category!, doc.id!);
    body = thing ? <ThingInspector thing={thing} /> : null;
  } else if (p && doc?.kind === 'sprite') {
    body = <SpriteInspector id={doc.id!} />;
  }
  return (
    <aside class="inspector" style={{ width }} aria-label="Inspector">
      <div class="pane-head">
        <span class="grow">Inspector</span>
      </div>
      <div class="pane-body">{body ?? <div class="empty-pane">Select a thing or sprite to see its properties.</div>}</div>
    </aside>
  );
}

function SpriteInspector({ id }: { id: number }) {
  const p = project.value!;
  spriteRevision.value;
  const hi = p.getHiRes(id);
  const rec = p.spr.getRecord(id);
  return (
    <Section id="sprite" title="Sprite">
      <div class="props">
        <span class="k">Id</span>
        <span class="v mono">{id}</span>
        <span class="k">Size</span>
        <span class="v">32 × 32</span>
        <span class="k">Stored bytes</span>
        <span class="v mono">{rec ? rec.length : 'empty'}</span>
        <span class="k">High-res</span>
        <span class="v">{hi ? `${hi.width} × ${hi.height}` : '—'}</span>
        <span class="k">Alpha channel</span>
        <span class="v">{p.features.transparency ? 'yes' : 'no'}</span>
      </div>
    </Section>
  );
}

function ThingInspector({ thing }: { thing: ThingType }) {
  const p = project.value!;
  const unique = new Set(thing.groups.flatMap((g) => g.sprites).filter(Boolean)).size;
  const flagsSet = Object.keys(thing.flags).length;
  return (
    <>
      <Section id="thing" title="Thing">
        <div class="props">
          <span class="k">Category</span>
          <span class="v" style={{ textTransform: 'capitalize' }}>
            {thing.category}
          </span>
          <span class="k">Id</span>
          <span class="v mono">{thing.id}</span>
          {thing.flags.market?.name && (
            <>
              <span class="k">Name</span>
              <span class="v">{thing.flags.market.name}</span>
            </>
          )}
          <span class="k">Frame groups</span>
          <span class="v">{thing.groups.length}</span>
          <span class="k">Sprites</span>
          <span class="v">
            {unique} unique / {thing.groups.reduce((n, g) => n + g.sprites.length, 0)} slots
          </span>
          <span class="k">Layout</span>
          <span class="v">{DAT_FORMATS[p.features.datFormat].label}</span>
        </div>
      </Section>
      <Section id="flags" title="Flags" count={flagsSet}>
        <FlagsEditor thing={thing} />
      </Section>
      <Section id="appearance" title="Appearance" count={thing.groups.length > 1 ? `${thing.groups.length} groups` : undefined}>
        <GroupsEditor thing={thing} />
      </Section>
      {thing.category === 'outfit' && (
        <Section id="preview" title="Preview colors">
          <OutfitColorPicker colors={outfitColors.value} onChange={(c) => (outfitColors.value = c)} />
        </Section>
      )}
    </>
  );
}

function FlagsEditor({ thing }: { thing: ThingType }) {
  const p = project.value!;
  const [filter, setFilter] = useState('');
  const [onlySet, setOnlySet] = useState(false);
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
  const shown = names.filter((n) => (!onlySet || thing.flags[n] !== undefined) && FLAG_INFO[n].label.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div>
      <div class="row" style={{ marginBottom: 6 }}>
        <input type="search" placeholder="Filter flags" value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} style={{ flex: 1 }} />
        <label class="check small" title="Only show flags that are set">
          <input type="checkbox" checked={onlySet} onChange={(e) => setOnlySet((e.target as HTMLInputElement).checked)} /> Set
        </label>
      </div>
      {shown.map((name) => {
        const info = FLAG_INFO[name];
        const value = thing.flags[name] as unknown;
        const on = value !== undefined;
        const idAttr = `flag-${name}`;
        return (
          <div key={name} class={`flag-row ${on ? 'on' : ''}`}>
            <input
              id={idAttr}
              type="checkbox"
              checked={on}
              onChange={(e) => setFlag(name, (e.target as HTMLInputElement).checked ? (info.kind === 'bool' ? true : defaults[info.kind]) : undefined)}
            />
            <label for={idAttr}>{info.label}</label>
            {on && info.kind === 'u16' && (
              <div class="flag-values">
                <span>{'valueLabel' in info ? info.valueLabel : 'Value'}</span>
                <input type="number" min={0} max={65535} value={value as number} onChange={(e) => setFlag(name, num(e))} />
              </div>
            )}
            {on && info.kind === 'light' && (
              <div class="flag-values">
                <span>Level</span>
                <input type="number" min={0} max={255} value={(value as { level: number }).level} onChange={(e) => setFlag(name, { ...(value as object), level: num(e) })} />
                <span>Color</span>
                <input type="number" min={0} max={255} value={(value as { color: number }).color} onChange={(e) => setFlag(name, { ...(value as object), color: num(e) })} />
              </div>
            )}
            {on && info.kind === 'offset' && (
              <div class="flag-values">
                <span>X</span>
                <input type="number" min={0} max={65535} value={(value as { x: number }).x} onChange={(e) => setFlag(name, { ...(value as object), x: num(e) })} />
                <span>Y</span>
                <input type="number" min={0} max={65535} value={(value as { y: number }).y} onChange={(e) => setFlag(name, { ...(value as object), y: num(e) })} />
              </div>
            )}
            {on && info.kind === 'market' && <MarketEditor value={value as MarketInfo} onChange={(m) => setFlag(name, m)} />}
          </div>
        );
      })}
      {unsupported.length > 0 && (
        <p class="hint warn">Not supported by this version (dropped on save): {unsupported.map((k) => FLAG_INFO[k].label).join(', ')}</p>
      )}
    </div>
  );
}

function MarketEditor({ value, onChange }: { value: MarketInfo; onChange(m: MarketInfo): void }) {
  const fields: Array<[keyof MarketInfo, string]> = [
    ['name', 'Name'],
    ['category', 'Category'],
    ['tradeAs', 'Trade as'],
    ['showAs', 'Show as'],
    ['restrictVocation', 'Vocation'],
    ['requiredLevel', 'Level'],
  ];
  return (
    <div class="flag-values">
      {fields.map(([key, label]) => (
        <Fragment key={key}>
          <span>{label}</span>
          {key === 'name' ? (
            <input type="text" maxLength={255} value={value.name} onChange={(e) => onChange({ ...value, name: (e.target as HTMLInputElement).value })} />
          ) : (
            <input type="number" min={0} max={65535} value={value[key] as number} onChange={(e) => onChange({ ...value, [key]: num(e) })} />
          )}
        </Fragment>
      ))}
    </div>
  );
}

const DIMS: Array<[keyof GroupDimensions, string, number]> = [
  ['width', 'Width', 8],
  ['height', 'Height', 8],
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
    <div class="col">
      {thing.groups.map((g, i) => (
        <fieldset key={i}>
          <legend>{thing.groups.length > 1 || canGroups ? (g.type === FrameGroupType.Moving ? 'Moving' : 'Idle') : 'Frame group'}</legend>
          <div class="props">
            {DIMS.map(([key, label, max]) =>
              key === 'patternZ' && !DAT_FORMATS[p.features.datFormat].patternZ ? null : (
                <Fragment key={key}>
                  <span class="k">{label}</span>
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
                </Fragment>
              ),
            )}
            {(g.width > 1 || g.height > 1) && (
              <>
                <span class="k" title="Stored 'exact size' byte used by the client for large things">
                  Exact size
                </span>
                <input type="number" min={1} max={255} value={g.exactSize} onChange={(e) => setGroup(i, { ...g, exactSize: Math.max(1, Math.min(255, num(e))) })} />
              </>
            )}
          </div>
          <p class="muted small" style={{ margin: '6px 0 0' }}>
            {g.sprites.length} sprite slots
          </p>
          {g.frames > 1 && p.features.enhancedAnimations && <AnimationEditor group={g} onChange={(ng) => setGroup(i, ng)} />}
          {canGroups && thing.groups.length > 1 && (
            <button class="ghost danger small" style={{ marginTop: 6 }} onClick={() => commitThing({ ...thing, groups: thing.groups.filter((_, j) => j !== i) })}>
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
            commitThing({ ...thing, groups: [{ ...base, type: FrameGroupType.Idle }, moving] });
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
    <details style={{ marginTop: 6 }}>
      <summary>Animation timing</summary>
      <div class="props" style={{ marginTop: 6 }}>
        <span class="k">Mode</span>
        <select value={a.mode} onChange={(e) => set({ mode: num(e) })}>
          <option value={0}>Asynchronous</option>
          <option value={1}>Synchronous</option>
        </select>
        <span class="k" title="0 = infinite, -1 = ping-pong">
          Loop count
        </span>
        <input type="number" min={-1} value={a.loopCount} onChange={(e) => set({ loopCount: num(e) })} />
        <span class="k" title="-1 = random">
          Start frame
        </span>
        <input type="number" min={-1} max={group.frames - 1} value={a.startFrame} onChange={(e) => set({ startFrame: num(e) })} />
        <span class="k">Set all (ms)</span>
        <input
          type="number"
          min={0}
          placeholder="e.g. 100"
          onChange={(e) => {
            const v = num(e);
            set({ durations: a.durations.map(() => ({ min: v, max: v })) });
          }}
        />
      </div>
      <table class="durations" style={{ marginTop: 6 }}>
        <thead>
          <tr>
            <th>#</th>
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

function OutfitColorPicker({ colors, onChange }: { colors: OutfitColors; onChange(c: OutfitColors): void }) {
  const [part, setPart] = useState<keyof OutfitColors>('head');
  return (
    <div>
      <div class="color-parts">
        {(['head', 'body', 'legs', 'feet'] as const).map((k) => {
          const [r, g, b] = outfitColor(colors[k]);
          return (
            <button key={k} class={part === k ? 'on' : ''} onClick={() => setPart(k)} title={`${k}: ${colors[k]}`}>
              <span class="swatch" style={{ background: `rgb(${r},${g},${b})` }} /> {k}
            </button>
          );
        })}
      </div>
      <div class="palette" role="listbox" aria-label={`${part} color`}>
        {[...Array(OUTFIT_COLOR_COUNT).keys()].map((c) => {
          const [r, g, b] = outfitColor(c);
          return <button key={c} title={String(c)} class={colors[part] === c ? 'on' : ''} style={{ background: `rgb(${r},${g},${b})` }} onClick={() => onChange({ ...colors, [part]: c })} />;
        })}
      </div>
    </div>
  );
}
