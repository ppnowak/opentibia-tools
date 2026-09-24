import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { closeDialog, dialog } from '../state.ts';
import { CompileDialog } from './CompileDialog.tsx';
import { CwmTool } from './CwmTool.tsx';
import { ImportClientDialog } from './ImportClientDialog.tsx';
import { NewThingDialog } from './NewThingDialog.tsx';

export function Modal({ title, children, wide }: { title: string; children: ComponentChildren; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDialog();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && closeDialog()}>
      <div class={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button class="ghost" aria-label="Close" onClick={closeDialog}>
            ✕
          </button>
        </header>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Dialogs() {
  const d = dialog.value!;
  switch (d.kind) {
    case 'compile':
      return <CompileDialog />;
    case 'new-thing':
      return <NewThingDialog {...(d.props as { category?: string })} />;
    case 'import-client':
      return <ImportClientDialog />;
    case 'cwm-tool':
      return <CwmTool />;
    default:
      return null;
  }
}
