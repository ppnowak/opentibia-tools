import { X } from 'lucide-preact';
import { activeDoc, closeDoc, docs, pinDoc, project, revision, type Doc } from '../state.ts';
import { CwmDoc } from './docs/CwmDoc.tsx';
import { ShortcutsDoc, VersionsDoc, WelcomeDoc } from './docs/InfoDocs.tsx';
import { SpriteDoc } from './docs/SpriteDoc.tsx';
import { ThingDoc } from './docs/ThingDoc.tsx';

function title(d: Doc): string {
  if (d.kind === 'thing') {
    const name = project.value?.get(d.category!, d.id!)?.flags.market?.name;
    return `${d.category![0].toUpperCase()}${d.category!.slice(1)} ${d.id}${name ? ` · ${name}` : ''}`;
  }
  if (d.kind === 'sprite') return `Sprite ${d.id}`;
  return d.title ?? d.kind;
}

/** Tab strip + the active document. */
export function Editors() {
  revision.value;
  const list = docs.value;
  const active = list.find((d) => d.key === activeDoc.value) ?? list[0];
  return (
    <div class="doc" style={{ minHeight: 0 }}>
      <div class="tabs-bar" role="tablist">
        {list.map((d) => (
          <div
            key={d.key}
            role="tab"
            aria-selected={d === active}
            class={`tab ${d === active ? 'active' : ''} ${d.preview ? 'preview' : ''}`}
            title={d.preview ? 'Preview tab — double-click to keep it open' : undefined}
            onClick={() => (activeDoc.value = d.key)}
            onDblClick={() => pinDoc(d.key)}
            onAuxClick={(e) => (e as MouseEvent).button === 1 && closeDoc(d.key)}
          >
            <span class="tab-title">{title(d)}</span>
            <button
              class="icon"
              aria-label={`Close ${title(d)}`}
              onClick={(e) => {
                e.stopPropagation();
                closeDoc(d.key);
              }}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      {!active && <WelcomeDoc />}
      {active?.kind === 'welcome' && <WelcomeDoc />}
      {active?.kind === 'thing' && <ThingDoc key={active.key} docKey={active.key} category={active.category!} id={active.id!} />}
      {active?.kind === 'sprite' && <SpriteDoc key={active.key} id={active.id!} />}
      {active?.kind === 'cwm' && <CwmDoc />}
      {active?.kind === 'versions' && <VersionsDoc />}
      {active?.kind === 'shortcuts' && <ShortcutsDoc />}
    </div>
  );
}
