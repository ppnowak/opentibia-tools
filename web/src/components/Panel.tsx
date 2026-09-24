import { useEffect, useRef } from 'preact/hooks';
import { AlertTriangle, CircleX, Info, RefreshCw, Trash2, X } from 'lucide-preact';
import type { Problem } from '../../../src/core/validate.ts';
import { layout, logs, problems, project, runValidation, selectSprite, selectThing, setLayout } from '../state.ts';

function ProblemIcon({ p }: { p: Problem }) {
  if (p.severity === 'error') return <CircleX size={14} class="lvl-error" />;
  if (p.severity === 'warning') return <AlertTriangle size={14} class="lvl-warning" />;
  return <Info size={14} class="lvl-info" />;
}

export function Panel() {
  const tab = layout.value.panelTab;
  const report = problems.value;
  const outRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tab === 'output' && outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [logs.value.length, tab]);

  return (
    <section class="panel" style={{ height: layout.value.panelHeight }} aria-label="Panel">
      <div class="panel-tabs">
        <button class={`ptab ${tab === 'problems' ? 'on' : ''}`} onClick={() => setLayout({ panelTab: 'problems' })}>
          Problems {report ? <span class="badge">{report.errors + report.warnings}</span> : null}
        </button>
        <button class={`ptab ${tab === 'output' ? 'on' : ''}`} onClick={() => setLayout({ panelTab: 'output' })}>
          Output
        </button>
        <span class="grow" />
        {tab === 'problems' && (
          <button class="icon" title="Validate again (F8)" disabled={!project.value} onClick={() => runValidation()}>
            <RefreshCw size={14} />
          </button>
        )}
        {tab === 'output' && (
          <button class="icon" title="Clear output" onClick={() => (logs.value = [])}>
            <Trash2 size={14} />
          </button>
        )}
        <button class="icon" title="Close panel (Ctrl+J)" onClick={() => setLayout({ panel: false })}>
          <X size={14} />
        </button>
      </div>
      {tab === 'problems' ? (
        <div class="panel-body">
          {!report && (
            <div class="empty-pane">
              {project.value ? (
                <>
                  No validation run yet. <button class="link" onClick={() => runValidation()}>Validate the client</button> (F8).
                </>
              ) : (
                'Open a client to validate it.'
              )}
            </div>
          )}
          {report && !report.problems.length && <div class="empty-pane">No problems found.</div>}
          {report?.problems.map((pr, i) => (
            <div
              key={i}
              class="problem"
              onClick={() => {
                if (pr.category && pr.id !== undefined) selectThing(pr.category, pr.id, { pin: true });
                else if (pr.spriteId) selectSprite(pr.spriteId, true);
              }}
            >
              <ProblemIcon p={pr} />
              <span>{pr.message}</span>
              <span class="faint">
                {pr.category ? `${pr.category} ${pr.id}` : pr.spriteId ? `sprite ${pr.spriteId}` : ''} [{pr.code}]
              </span>
            </div>
          ))}
          {report && report.truncated > 0 && <div class="empty-pane">… and {report.truncated} more</div>}
        </div>
      ) : (
        <div class="panel-body" ref={outRef}>
          {logs.value.map((l) => (
            <div key={l.id} class="log-line">
              <span class="time">{l.time.toLocaleTimeString()}</span>
              <span class={`lvl-${l.level}`}>{l.level.padEnd(7)}</span>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
