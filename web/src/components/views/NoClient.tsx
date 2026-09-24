import { FilePlus2, FolderOpen, Package } from 'lucide-preact';
import { runCommand } from '../../lib/commands.ts';
import { showActivity } from '../../state.ts';

export function NoClient() {
  return (
    <>
      <div class="pane-head">
        <span class="grow">Explorer</span>
      </div>
      <div class="empty-pane">
        <p>No client is open.</p>
        <div class="col">
          <button class="primary" onClick={() => runCommand('file.open')}>
            <FolderOpen size={14} /> Open Client…
          </button>
          <button onClick={() => showActivity('packs')}>
            <Package size={14} /> Preload Data Pack…
          </button>
          <button onClick={() => runCommand('file.new')}>
            <FilePlus2 size={14} /> New Client…
          </button>
        </div>
        <p class="hint" style={{ marginTop: 12 }}>
          You can also drop <code>Tibia.dat</code> + <code>Tibia.spr</code> or a data pack <code>.zip</code> anywhere on the window.
        </p>
      </div>
    </>
  );
}
