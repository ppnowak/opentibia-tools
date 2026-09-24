import { readCwm } from '../../../src/core/cwm/cwm.ts';
import { readDat } from '../../../src/core/dat/dat.ts';
import { detectClient, detectSprExtended, detectTransparency } from '../../../src/core/detect.ts';
import { datFromJson, importThings, type ThingBundle } from '../../../src/core/json.ts';
import { Project } from '../../../src/core/project.ts';
import { SpriteArchive } from '../../../src/core/spr/spr.ts';
import { getVersion, versionLabel, type ClientFeatures } from '../../../src/core/versions.ts';
import {
  activity,
  closeAllDocs,
  closeDialog,
  commitAdd,
  dirty,
  explorerCategory,
  files,
  log,
  problems,
  project,
  resetHistory,
  saveTarget,
  selectSprite,
  selectThing,
  toast,
  touch,
  withBusy,
  type LoadedFiles,
} from '../state.ts';
import { extOf, readFile } from './files.ts';
import { expandZips } from './packs.ts';

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

function describe(p: Project): string {
  return `client ${p.label}: ${p.dat.items.length} items, ${p.dat.outfits.length} outfits, ${p.dat.effects.length} effects, ${p.dat.missiles.length} missiles, ${p.spr.count} sprites`;
}

/** Make a project the one being edited and reset the workbench around it. */
export function setProject(p: Project, loaded: LoadedFiles): void {
  project.value = p;
  files.value = loaded;
  saveTarget.value = null;
  problems.value = null;
  resetHistory();
  closeAllDocs();
  touch(true);
  dirty.value = false;
  if (p.dat.items.length || p.dat.outfits.length) {
    activity.value = 'explorer';
    const category = p.dat.items.length ? 'item' : 'outfit';
    explorerCategory.value = category;
    selectThing(category, p.list(category)[0].id);
  } else if (p.spr.count) {
    activity.value = 'sprites';
    selectSprite(1);
  }
}

/** Load client files into a Project (main editor or library). */
export async function loadClient(req: OpenRequest): Promise<Project> {
  const datBytes = req.dat ? await readFile(req.dat) : undefined;
  const sprBytes = req.spr ? await readFile(req.spr) : undefined;
  let p: Project;
  if (datBytes && sprBytes) {
    p = Project.open(datBytes, sprBytes, { version: req.version, features: req.features });
    if (p.ambiguous) {
      toast('The client version could not be detected with certainty; if things look wrong, reopen it with File › Open with Version.', 'warning', 9000);
    }
  } else if (datBytes) {
    const d = req.version ? undefined : detectClient(datBytes);
    const version = req.version ?? d!.version;
    const features = { ...(d?.features ?? getVersion(version).features), ...req.features };
    const dat = d?.dat && !req.features ? d.dat : readDat(datBytes, features);
    p = new Project(version, features, dat, SpriteArchive.create(0, features));
  } else if (sprBytes) {
    const extended = req.features?.extended ?? (req.version ? getVersion(req.version).features.extended : (detectSprExtended(sprBytes) ?? false));
    const transparency = req.features?.transparency ?? detectTransparency(sprBytes, extended) ?? false;
    const version = req.version ?? (extended ? 1098 : 860);
    const features = { ...getVersion(version).features, extended, transparency };
    p = new Project(version, features, { signature: 0, items: [], outfits: [], effects: [], missiles: [] }, SpriteArchive.load(sprBytes, features));
  } else {
    throw new Error('Select a Tibia.dat and/or Tibia.spr file (or a data pack .zip)');
  }
  if (req.cwm) {
    const n = p.loadCwm(await readFile(req.cwm));
    log(`Loaded ${n} high resolution sprites from ${req.cwm.name}`);
  }
  return p;
}

/** Open a client in the main editor. */
export async function openClient(req: OpenRequest): Promise<Project | undefined> {
  return withBusy('Loading client files…', async () => {
    const p = await loadClient(req);
    setProject(p, { dat: req.dat?.name, spr: req.spr?.name, cwm: req.cwm?.name });
    closeDialog();
    toast(`Opened ${describe(p)}`, 'success');
    return p;
  });
}

/**
 * Open whatever the user dropped or picked: client files, data pack zips, dat JSON dumps,
 * things bundles or a CWM for the open client.
 */
export async function openFiles(input: File[], opts: { version?: number; features?: Partial<ClientFeatures> } = {}): Promise<void> {
  if (!input.length) return;
  let list = input;
  let hint = opts.version;
  if (input.some((f) => /\.zip$/i.test(f.name))) {
    const expanded = await withBusy('Extracting zip…', () => expandZips(input));
    if (!expanded) return;
    list = expanded.files;
    hint ??= expanded.version;
  }
  const req = classifyFiles(list);
  if (req.dat || req.spr) {
    await openClient({ ...req, version: hint, features: opts.features });
    return;
  }
  if (req.json) {
    await openJson(req.json);
    return;
  }
  if (req.cwm && project.value) {
    await openCwmIntoProject(req.cwm);
    return;
  }
  toast('Nothing to open: use Tibia.dat + Tibia.spr, a data pack .zip, a .cwm, or a .json dump/bundle', 'error');
}

/** Load a JSON file: either a thing bundle (imported into the open project) or a dat JSON dump. */
export async function openJson(file: File): Promise<void> {
  await withBusy(`Reading ${file.name}…`, async () => {
    const json = JSON.parse(new TextDecoder().decode(await readFile(file)));
    if (json.format === 'opentibia-tools/things') {
      const p = project.value;
      if (!p) throw new Error('Open a client first, then import the things bundle');
      const { things, report } = importThings(p, json as ThingBundle);
      for (const t of things) commitAdd(t);
      touch(true);
      if (things.length) selectThing(things[0].category, things[0].id);
      const dropped = [...report.droppedFlags.keys()];
      toast(`Imported ${things.length} things from ${file.name}${dropped.length ? ` (dropped unsupported flags: ${dropped.join(', ')})` : ''}`, 'success');
    } else if (json.format === 'opentibia-tools/dat') {
      const { dat, clientVersion, features } = datFromJson(json);
      const p = new Project(clientVersion, features, dat, SpriteArchive.create(0, features));
      setProject(p, { dat: file.name });
      toast(`Opened ${file.name} (client ${versionLabel(clientVersion)}, no sprites)`, 'success');
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
    toast(`Loaded ${n} high resolution sprites from ${file.name}`, 'success');
  });
}
