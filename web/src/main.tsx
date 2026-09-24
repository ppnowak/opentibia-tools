import { render } from 'preact';
import { App } from './app.tsx';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { toast } from './state.ts';
import { classifyFiles, openClient, openJson } from './lib/loader.ts';

render(<App />, document.getElementById('app')!);

const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('A new version of OpenTibia Tools is available. Reload now?')) void updateSW(true);
  },
  onOfflineReady() {
    toast('Ready to work offline', 'success');
  },
});

// Files opened through the OS ("Open with…") when installed as a PWA.
interface LaunchParams {
  files: Array<{ getFile(): Promise<File> }>;
}
const launchQueue = (window as unknown as { launchQueue?: { setConsumer(cb: (p: LaunchParams) => void): void } }).launchQueue;
launchQueue?.setConsumer(async (params) => {
  if (!params.files.length) return;
  const list = await Promise.all(params.files.map((h) => h.getFile()));
  const req = classifyFiles(list);
  if (req.dat || req.spr) await openClient(req);
  else if (req.json) await openJson(req.json);
});
