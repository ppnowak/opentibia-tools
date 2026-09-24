import { unzip, type Unzipped } from 'fflate';
import { parseVersion } from '../../../src/core/versions.ts';

/**
 * Client data packs published at downloads.ots.me.
 *
 * OpenTibia Tools does not host, mirror or proxy any client files: a pack is always
 * downloaded by the user's own browser straight from downloads.ots.me to their computer
 * and only extracted locally by the app.
 */
export const PACKS_BASE_URL = 'https://downloads.ots.me/data/tibia-clients/dat_and_spr/';

export interface DataPack {
  /** File name without .zip, e.g. "860", "860_old", "15.10.2daede". */
  name: string;
  version: number;
  /** Approximate download size as listed by the server. */
  size: string;
}

const LISTING =
  '710 2.4M 713 2.5M 721 2.6M 723 2.6M 724 2.6M 726 2.6M 727 2.6M 730 3.0M 740 4.1M 741 4.1M 750 6.1M 760 7.7M 770 7.7M 772 7.7M ' +
  '780 10M 781 10M 790 11M 792 11M 800 13M 811 14M 820 15M 821 15M 822 15M 830 15M 831 15M 840 16M 841 17M 842 17M 850 17M ' +
  '852 17M 853 17M 854 18M 855 18M 856 18M 857 18M 860 20M 860_old 19M 861 20M 862 20M 870 21M 871 21M 900 21M 910 22M 920 22M ' +
  '931 22M 940 23M 941 23M 942 23M 943 23M 944 24M 946 23M 952 23M 954 23M 960 25M 970 25M 971 25M 980 25M 981 25M 1000 44M ' +
  '1010 27M 1020 27M 1035 29M 1036 29M 1037 29M 1038 29M 1041 29M 1050 30M 1055 33M 1057 33M 1059 33M 1061 34M 1063 35M ' +
  '1064 35M 1070 35M 1071 35M 1073 35M 1075 36M 1076 37M 1077 37M 1078 38M 1079 38M 1080 38M 1081 38M 1082 39M 1090 40M ' +
  '1091 40M 1092 41M 1093 41M 1094 42M 1095 42M 1096 42M 1097 42M 1098 42M 1099 44M 1287 71M 1310 81M 1340 91M 1411 91M ' +
  '1501 93M 15.10.2daede 95M';

export const DATA_PACKS: readonly DataPack[] = (() => {
  const parts = LISTING.split(' ');
  const out: DataPack[] = [];
  for (let i = 0; i < parts.length; i += 2) out.push({ name: parts[i], version: packVersion(parts[i]), size: parts[i + 1] });
  return out;
})();

/** "860_old" -> 860, "15.10.2daede" -> 1510, "1098" -> 1098. */
export function packVersion(name: string): number {
  return parseVersion(name.replace(/_.*$/, ''));
}

export function packUrl(pack: DataPack): string {
  return `${PACKS_BASE_URL}${encodeURIComponent(pack.name)}.zip`;
}

/** Version hint from a zip or folder name such as "860.zip" or "15.10.2daede.zip". */
export function versionFromName(name: string): number | undefined {
  const m = /(\d+(?:\.\d+)?)(?:[._][^/\\]*)?\.zip$/i.exec(name.split(/[\\/]/).pop() ?? '');
  if (!m) return undefined;
  const v = parseVersion(m[1]);
  return v >= 700 && v < 3000 ? v : undefined;
}

const CLIENT_FILE = /(^|\/)tibia\.(dat|spr|cwm)$/i;

/** Extract Tibia.dat / Tibia.spr / Tibia.cwm from a zip (other entries are skipped). */
export function extractClientZip(bytes: Uint8Array, zipName: string): Promise<File[]> {
  return new Promise((resolve, reject) => {
    unzip(bytes, { filter: (f) => CLIENT_FILE.test(f.name) }, (err, entries: Unzipped) => {
      if (err) return reject(new Error(`${zipName}: ${err.message}`));
      const files = Object.entries(entries).map(([path, data]) => {
        const base = path.split('/').pop()!;
        return new File([data as BlobPart], base, { type: 'application/octet-stream' });
      });
      if (!files.some((f) => /\.dat$/i.test(f.name)) && !files.some((f) => /\.spr$/i.test(f.name))) {
        return reject(new Error(`${zipName} does not contain Tibia.dat or Tibia.spr`));
      }
      resolve(files);
    });
  });
}

/** Replace dropped/picked zip files by the client files inside them. */
export async function expandZips(list: File[]): Promise<{ files: File[]; version?: number }> {
  const out: File[] = [];
  let version: number | undefined;
  for (const f of list) {
    if (/\.zip$/i.test(f.name)) {
      out.push(...(await extractClientZip(new Uint8Array(await f.arrayBuffer()), f.name)));
      version ??= versionFromName(f.name);
    } else out.push(f);
  }
  return { files: out, version };
}

const DIRECT_KEY = 'ot-tools:direct-pack-download';

function directFetchKnownBlocked(): boolean {
  try {
    return localStorage.getItem(DIRECT_KEY) === 'blocked';
  } catch {
    return false;
  }
}

function rememberDirectFetchBlocked(): void {
  try {
    localStorage.setItem(DIRECT_KEY, 'blocked');
  } catch {
    /* ignore */
  }
}

/** Let the browser download the pack to the user's computer (regular file download). */
export function downloadPackToComputer(pack: DataPack): void {
  const a = document.createElement('a');
  a.href = packUrl(pack);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.download = `${pack.name}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export type PreloadResult = { kind: 'files'; files: File[] } | { kind: 'manual' };

/**
 * Get a pack onto the user's machine. If the server allows the browser to read the
 * download directly (CORS), it is fetched and extracted in memory; otherwise the browser
 * saves the zip as a normal download and the user opens it in the app afterwards.
 */
export async function preloadPack(pack: DataPack, onProgress?: (done: number, total: number) => void | Promise<void>): Promise<PreloadResult> {
  if (!directFetchKnownBlocked()) {
    let res: Response | undefined;
    try {
      res = await fetch(packUrl(pack), { mode: 'cors', credentials: 'omit' });
    } catch {
      // Network error or CORS refusal: the server does not allow scripted downloads.
      rememberDirectFetchBlocked();
    }
    if (res) {
      if (!res.ok) throw new Error(`downloads.ots.me answered ${res.status} for ${pack.name}.zip`);
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body!.getReader();
      const chunks: Uint8Array[] = [];
      let done = 0;
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        chunks.push(value);
        done += value.length;
        await onProgress?.(done, total || done);
      }
      const bytes = new Uint8Array(done);
      let o = 0;
      for (const c of chunks) {
        bytes.set(c, o);
        o += c.length;
      }
      return { kind: 'files', files: await extractClientZip(bytes, `${pack.name}.zip`) };
    }
  }
  downloadPackToComputer(pack);
  return { kind: 'manual' };
}
