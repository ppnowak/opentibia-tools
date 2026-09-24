import { useState } from 'preact/hooks';
import { Project } from '../../../src/core/project.ts';
import { pickFiles } from '../lib/files.ts';
import { setProject, openFiles } from '../lib/loader.ts';
import { closeDialog, dialog, toast } from '../state.ts';
import { CompileDialog } from './CompileDialog.tsx';
import { NewThingDialog } from './NewThingDialog.tsx';
import { Modal } from './ui.tsx';
import { VersionPicker, type VersionChoice } from './VersionPicker.tsx';

export function Dialogs() {
  const d = dialog.value!;
  switch (d.kind) {
    case 'compile':
      return <CompileDialog />;
    case 'new-thing':
      return <NewThingDialog {...(d.props as { category?: string })} />;
    case 'new-client':
      return <NewClientDialog />;
    case 'open-client':
      return <OpenClientDialog />;
    case 'about':
      return <AboutDialog />;
    default:
      return null;
  }
}

function NewClientDialog() {
  const [choice, setChoice] = useState<VersionChoice>({ version: 860 });
  const create = () => {
    const p = Project.create(choice.version ?? 860, choice.features);
    setProject(p, {});
    closeDialog();
    toast(`Created an empty client ${p.label}`, 'success');
  };
  return (
    <Modal
      title="New client"
      footer={
        <>
          <button class="ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button class="primary" onClick={create}>
            Create
          </button>
        </>
      }
    >
      <p class="muted">Start an empty client and add items, outfits, effects and missiles from images or from other clients.</p>
      <VersionPicker value={choice} onChange={setChoice} />
    </Modal>
  );
}

function OpenClientDialog() {
  const [choice, setChoice] = useState<VersionChoice>({});
  const [picked, setPicked] = useState<File[]>([]);
  return (
    <Modal
      title="Open client with version"
      footer={
        <>
          <button class="ghost" onClick={closeDialog}>
            Cancel
          </button>
          <button class="primary" disabled={!picked.length} onClick={() => openFiles(picked, { version: choice.version, features: choice.features })}>
            Open
          </button>
        </>
      }
    >
      <p class="muted">
        Use this when auto-detection picks the wrong layout, or for custom clients (e.g. OTClient builds with extended sprites or transparency on
        older protocols).
      </p>
      <div class="row">
        <button onClick={async () => setPicked(await pickFiles('.dat,.spr,.cwm,.zip'))}>Choose files…</button>
        <span class="muted small">{picked.map((f) => f.name).join(', ') || 'Tibia.dat + Tibia.spr (+ .cwm) or a data pack .zip'}</span>
      </div>
      <VersionPicker value={choice} onChange={setChoice} allowAuto />
    </Modal>
  );
}

function AboutDialog() {
  return (
    <Modal title="About OpenTibia Tools">
      <p>
        Editor and toolkit for Tibia client files — <code>Tibia.dat</code>, <code>Tibia.spr</code> and OTClientV8 <code>Tibia.cwm</code> — for every
        protocol from 7.10 to 15.x. Everything runs locally in your browser; no file is uploaded anywhere.
      </p>
      <p>
        The same engine powers the <code>opentibia-tools</code> command line and GitHub Action for validating, diffing, converting and building
        clients in CI. Source: <a href="https://github.com/ppnowak/opentibia-tools">github.com/ppnowak/opentibia-tools</a>.
      </p>
      <h3>Legal</h3>
      <p class="muted">
        OpenTibia Tools does not include, host, mirror or redistribute any Tibia client files. Data packs are downloaded by your own browser directly
        from their original source (downloads.ots.me) and only processed locally. Tibia is a trademark of CipSoft GmbH; this project is not
        affiliated with CipSoft. You are responsible for having the right to use the files you open.
      </p>
    </Modal>
  );
}
