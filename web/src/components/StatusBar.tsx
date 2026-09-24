import { AlertTriangle, CircleX, Clipboard, PanelBottom, PanelLeft, PanelRight } from 'lucide-preact';
import { DAT_FORMATS } from '../../../src/core/dat/flags.ts';
import { versionLabel } from '../../../src/core/versions.ts';
import { statusMessage, clipboard, currentDoc, activeDoc, dirty, layout, multi, problems, project, revision, runValidation, setLayout, showPanel } from '../state.ts';

export function StatusBar() {
  revision.value;
  activeDoc.value;
  const p = project.value;
  const doc = currentDoc();
  const report = problems.value;
  const f = p?.features;
  return (
    <footer class="statusbar">
      {p && f ? (
        <>
          <span class="sb client" title={p.sameSignatureVersions.length ? `Same layout as ${p.sameSignatureVersions.map(versionLabel).join(', ')}` : undefined}>
            Client {p.label}
          </span>
          <span class="sb" title="dat layout and options">
            {DAT_FORMATS[f.datFormat].label}
            {f.extended ? ' · extended' : ''}
            {f.enhancedAnimations ? ' · animations' : ''}
            {f.frameGroups ? ' · frame groups' : ''}
            {f.transparency ? ' · alpha' : ''}
          </span>
          <button class="sb" title="Problems (F8 to validate)" onClick={() => (report ? showPanel('problems') : runValidation())}>
            <CircleX size={13} /> {report?.errors ?? '–'} <AlertTriangle size={13} /> {report?.warnings ?? '–'}
          </button>
          {dirty.value && <span class="sb dirty">● Unsaved changes</span>}
        </>
      ) : (
        <span class="sb">No client open</span>
      )}
      <span class="grow status-msg">{statusMessage.value && <span class={`lvl-${statusMessage.value.level}`}>{statusMessage.value.text}</span>}</span>
      {clipboard.value && (
        <span class="sb" title="Clipboard">
          <Clipboard size={13} /> {clipboard.value.things.length} thing(s) from {clipboard.value.source.label}
        </span>
      )}
      {doc?.kind === 'thing' && (
        <span class="sb mono">
          {doc.category} {doc.id}
          {multi.value.size > 1 ? ` (+${multi.value.size - 1} selected)` : ''}
        </span>
      )}
      {doc?.kind === 'sprite' && <span class="sb mono">sprite {doc.id}</span>}
      {p && (
        <span class="sb">
          {p.spr.count} sprites{p.hiRes.size ? ` · ${p.hiRes.size} hi-res` : ''}
        </span>
      )}
      <button class="sb" title="Toggle side bar (Ctrl+B)" onClick={() => setLayout({ sidebar: !layout.value.sidebar })}>
        <PanelLeft size={13} />
      </button>
      <button class="sb" title="Toggle panel (Ctrl+J)" onClick={() => setLayout({ panel: !layout.value.panel })}>
        <PanelBottom size={13} />
      </button>
      <button class="sb" title="Toggle inspector (Ctrl+Alt+B)" onClick={() => setLayout({ inspector: !layout.value.inspector })}>
        <PanelRight size={13} />
      </button>
    </footer>
  );
}
