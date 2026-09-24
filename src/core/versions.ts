import type { DatFormat } from './dat/flags.ts';
import { KNOWN_SIGNATURES } from './signatures.ts';

/**
 * Options that control how dat/spr files are laid out. They are derived from the client
 * version, but can be overridden (custom clients such as OTClient/OTCv8 builds often
 * enable extended sprites or alpha channel on older protocols).
 */
export interface ClientFeatures {
  datFormat: DatFormat;
  /** u32 sprite ids in dat and u32 sprite count in spr (official clients 9.60+). */
  extended: boolean;
  /** Per-frame durations / loop info for animations (10.50+). */
  enhancedAnimations: boolean;
  /** Outfits carry idle/moving frame groups (10.57+). */
  frameGroups: boolean;
  /** Sprites store an alpha byte per pixel (OTClient custom feature). */
  transparency: boolean;
}

export interface ClientVersion {
  /** Numeric protocol version, e.g. 860 for 8.60, 1510 for 15.10. */
  value: number;
  /** Human label, e.g. "8.60". */
  label: string;
  features: ClientFeatures;
}

export function versionLabel(value: number): string {
  const major = Math.floor(value / 100);
  const minor = value % 100;
  return `${major}.${String(minor).padStart(2, '0')}`;
}

/** Parse "8.60", "860", "15.10", "1510" or "15.10.2daede" into a numeric version. */
export function parseVersion(input: string | number): number {
  if (typeof input === 'number') return input;
  const s = input.trim();
  const m = /^(\d+)\.(\d{1,2})/.exec(s);
  if (m) return Number(m[1]) * 100 + Number(m[2].padEnd(2, '0'));
  const n = Number.parseInt(s, 10);
  if (Number.isNaN(n)) throw new Error(`Invalid client version: ${input}`);
  return n;
}

export function datFormatFor(version: number): DatFormat {
  if (version < 740) return 'v1';
  if (version < 755) return 'v2';
  if (version < 780) return 'v3';
  if (version < 860) return 'v4';
  if (version < 1000) return 'v5';
  return 'v6';
}

export function featuresFor(version: number): ClientFeatures {
  return {
    datFormat: datFormatFor(version),
    extended: version >= 960,
    enhancedAnimations: version >= 1050,
    frameGroups: version >= 1057,
    transparency: false,
  };
}

/** Every protocol version published at downloads.ots.me/data/tibia-clients/dat_and_spr. */
export const KNOWN_VERSIONS: readonly number[] = [
  710, 713, 721, 723, 724, 726, 727, 730, 740, 741, 750, 760, 770, 772, 780, 781, 790, 792, 800, 811, 820, 821,
  822, 830, 831, 840, 841, 842, 850, 852, 853, 854, 855, 856, 857, 860, 861, 862, 870, 871, 900, 910, 920, 931,
  940, 941, 942, 943, 944, 946, 952, 954, 960, 970, 971, 980, 981, 1000, 1010, 1020, 1035, 1036, 1037, 1038, 1041,
  1050, 1055, 1057, 1059, 1061, 1063, 1064, 1070, 1071, 1073, 1075, 1076, 1077, 1078, 1079, 1080, 1081, 1082, 1090,
  1091, 1092, 1093, 1094, 1095, 1096, 1097, 1098, 1099, 1287, 1310, 1340, 1411, 1501, 1510,
];

export function getVersion(value: number | string, overrides?: Partial<ClientFeatures>): ClientVersion {
  const v = parseVersion(value);
  return { value: v, label: versionLabel(v), features: { ...featuresFor(v), ...overrides } };
}

export const ALL_VERSIONS: readonly ClientVersion[] = KNOWN_VERSIONS.map((v) => getVersion(v));

/** Look up client versions by dat or spr signature. */
export function versionsBySignature(signature: number, file: 'dat' | 'spr'): number[] {
  const out = new Set<number>();
  for (const sig of KNOWN_SIGNATURES) {
    if ((file === 'dat' ? sig.dat : sig.spr) === signature >>> 0) out.add(sig.version);
  }
  return [...out].sort((a, b) => a - b);
}
