import { readCwm } from '../../../src/core/cwm/cwm.ts';
import { readDat } from '../../../src/core/dat/dat.ts';
import { detectClient, detectSprExtended, detectTransparency } from '../../../src/core/detect.ts';
import { datFromJson, importThings, type ThingBundle } from '../../../src/core/json.ts';
import { Project } from '../../../src/core/project.ts';
import { SpriteArchive } from '../../../src/core/spr/spr.ts';
import { getVersion, type ClientFeatures } from '../../../src/core/versions.ts';
import { closeDialog, files, project, resetHistory, select, tab, toast, touch, withBusy, dirty } from '../state.ts';
import { extOf, readFile } from './files.ts';

export interface OpenRequest {
  dat?: File;
  spr?: File;
  cwm?: File;
  json?: File;
  /** undefined = auto-detect */
  version?: number;
  features?: Partial<ClientFeatures>;
}

export function classifyFiles(list: File[]): OpenRequest & { other: File[] } {
  const req: OpenRequest & { other: File[] } = { other: [] };
  for (const f of list) {
    const ext = extOf(f.name);
    if (ext === 'dat' && !req.dat) req.dat = f;
    else if (ext === 'spr' && !req.spr) req.spr = f;
    else if (ext === 'cwm' && !req.cwm) req.cwm = f;
    else if (ext === 'json' && !req.json) req.json = f;
    else req.other.push(f);
  }
  return req;
}

/** Open a client from files. Either dat, spr or both may be provided. */
export async function openClient(req: OpenRequest, target: 'main' | 'source' = 'main'): Promise<Project | undefined> {
  return withBusy('Loading client files…', async () => {
    const datBytes = req.dat ? await readFile(req.dat) : undefined;
    const sprBytes = req.spr ? await readFile(req.spr) : undefined;
    let p: Project;
    if (datBytes && sprBytes) {
      p = Project.open(datBytes, sprBytes, { version: req.version, features: req.features });
      if (p.ambiguous) {
        toast('The client version could not be detected with certainty; if things look wrong, reopen with the version selected explicitly.', 'info', 9000);
      }
    } else if (datBytes) {
      const d = req.version ? undefined : detectClient(datBytes);
      const version = req.version ?? d!.version;
      const features = { ...(d?.features ?? getVersion(version).features), ...req.features };
      const dat = d?.dat && !req.features ? d.dat : readDat(datBytes, features);
      p = new Project(version, features, dat, SpriteArchive.create(0, features));
    } else if (sprBytes) {
      const extended = req.features?.extended ?? (req.version ? getVersion(req.version).features.extended : detectSprExtended(sprBytes) ?? false);
      const transparency = req.features?.transparency ?? detectTransparency(sprBytes, extended) ?? false;
      const version = req.version ?? (extended ? 1098 : 860);
      const features = { ...getVersion(version).features, extended, transparency };
      p = new Project(version, features, { signature: 0, items: [], outfits: [], effects: [], missiles: [] }, SpriteArchive.load(sprBytes, features));
    } else {
      throw new Error('Select a Tibia.dat and/or Tibia.spr file');
    }
    if (req.cwm) {
      const n = p.loadCwm(await readFile(req.cwm));
      toast(`Loaded ${n} high resolution sprites from ${req.cwm.name}`, 'success');
    }
    if (target === 'main') {
      project.value = p;
      files.value = { dat: req.dat?.name, spr: req.spr?.name, cwm: req.cwm?.name };
      resetHistory();
      select(datBytes ? 'item' : 'sprite', datBytes ? (p.dat.items[0]?.id ?? 100) : 1);
      if (!datBytes) tab.value = 'sprite';
      touch(true);
      dirty.value = false;
      closeDialog();
      toast(`Opened client ${p.label}: ${p.dat.items.length} items, ${p.dat.outfits.length} outfits, ${p.spr.count} sprites`, 'success');
    }
    return p;
  });
}

/** Load a JSON file: either a thing bundle (imported into the open project) or a dat JSON dump. */
export async function openJson(file: File): Promise<void> {
  await withBusy(`Reading ${file.name}…`, async () => {
    const json = JSON.parse(new TextDecoder().decode(await readFile(file)));
    if (json.format === 'opentibia-tools/things') {
      const p = project.value;
      if (!p) throw new Error('Open a client first, then import the things bundle');
      const { things, report } = importThings(p, json as ThingBundle);
      touch(true);
      if (things.length) select(things[0].category, things[0].id);
      const dropped = [...report.droppedFlags.keys()];
      toast(`Imported ${things.length} things${dropped.length ? ` (dropped unsupported flags: ${dropped.join(', ')})` : ''}`, 'success');
    } else if (json.format === 'opentibia-tools/dat') {
      const { dat, clientVersion, features } = datFromJson(json);
      const p = new Project(clientVersion, features, dat, SpriteArchive.create(0, features));
      project.value = p;
      files.value = { dat: file.name };
      resetHistory();
      select('item', 100);
      touch(true);
      toast(`Opened ${file.name} (client ${p.label}, no sprites)`, 'success');
    } else {
      throw new Error('Unknown JSON file (expected an opentibia-tools things bundle or dat dump)');
    }
  });
}

export async function openCwmIntoProject(file: File): Promise<void> {
  const p = project.value;
  if (!p) return;
  await withBusy('Loading CWM…', async () => {
    const bytes = await readFile(file);
    readCwm(bytes); // validate
    const n = p.loadCwm(bytes);
    files.value = { ...files.value, cwm: file.name };
    touch(true);
    toast(`Loaded ${n} high resolution sprites`, 'success');
  });
}
