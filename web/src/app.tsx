import { useEffect } from 'preact/hooks';
import { busy, dialog, dirty, project, redo, toasts, undo } from './state.ts';
import { StartScreen } from './components/StartScreen.tsx';
import { Editor } from './components/Editor.tsx';
import { Dialogs } from './components/Dialogs.tsx';

export function App() {
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.value) e.preventDefault();
    };
    const keys = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('keydown', keys);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('keydown', keys);
    };
  }, []);

  return (
    <>
      {project.value ? <Editor /> : <StartScreen />}
      {dialog.value && <Dialogs />}
      {busy.value && (
        <div class="overlay busy" role="status" aria-live="polite">
          <div class="busy-box">
            <div class="spinner" />
            <div>{busy.value.label}</div>
            {busy.value.total ? (
              <progress value={busy.value.done} max={busy.value.total} />
            ) : null}
          </div>
        </div>
      )}
      <div class="toasts" aria-live="polite">
        {toasts.value.map((t) => (
          <div key={t.id} class={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}
