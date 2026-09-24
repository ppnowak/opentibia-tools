/**
 * Canonical (version independent) thing flags and the per-format byte codes used
 * in Tibia.dat files.
 *
 * Every client version maps to one of the {@link DatFormat}s below. Reading a dat file
 * turns format specific codes into canonical flag names; writing does the reverse, which
 * is also what makes converting between protocol versions possible.
 */

export type FlagKind = 'bool' | 'u16' | 'light' | 'offset' | 'market';

export interface FlagInfo {
  name: FlagName;
  kind: FlagKind;
  label: string;
  /** For u16 flags: what the value means. */
  valueLabel?: string;
}

export interface LightInfo {
  level: number;
  color: number;
}

export interface OffsetInfo {
  x: number;
  y: number;
}

export interface MarketInfo {
  category: number;
  tradeAs: number;
  showAs: number;
  name: string;
  restrictVocation: number;
  requiredLevel: number;
}

export const FLAG_INFO = {
  ground: { kind: 'u16', label: 'Ground', valueLabel: 'Speed' },
  groundBorder: { kind: 'bool', label: 'Ground border' },
  onBottom: { kind: 'bool', label: 'On bottom' },
  onTop: { kind: 'bool', label: 'On top' },
  container: { kind: 'bool', label: 'Container' },
  stackable: { kind: 'bool', label: 'Stackable' },
  forceUse: { kind: 'bool', label: 'Force use' },
  multiUse: { kind: 'bool', label: 'Multi use' },
  chargeable: { kind: 'bool', label: 'Chargeable' },
  writable: { kind: 'u16', label: 'Writable', valueLabel: 'Max text length' },
  writableOnce: { kind: 'u16', label: 'Writable once', valueLabel: 'Max text length' },
  fluidContainer: { kind: 'bool', label: 'Fluid container' },
  fluid: { kind: 'bool', label: 'Fluid (splash)' },
  unpassable: { kind: 'bool', label: 'Unpassable' },
  unmoveable: { kind: 'bool', label: 'Unmoveable' },
  blockMissile: { kind: 'bool', label: 'Block missile' },
  blockPathfind: { kind: 'bool', label: 'Block pathfind' },
  noMoveAnimation: { kind: 'bool', label: 'No move animation' },
  pickupable: { kind: 'bool', label: 'Pickupable' },
  hangable: { kind: 'bool', label: 'Hangable' },
  hookSouth: { kind: 'bool', label: 'Hook south (vertical)' },
  hookEast: { kind: 'bool', label: 'Hook east (horizontal)' },
  rotatable: { kind: 'bool', label: 'Rotatable' },
  light: { kind: 'light', label: 'Light' },
  dontHide: { kind: 'bool', label: "Don't hide" },
  translucent: { kind: 'bool', label: 'Translucent' },
  floorChange: { kind: 'bool', label: 'Floor change' },
  offset: { kind: 'offset', label: 'Offset (displacement)' },
  elevation: { kind: 'u16', label: 'Elevation', valueLabel: 'Height' },
  lyingObject: { kind: 'bool', label: 'Lying object (corpse)' },
  animateAlways: { kind: 'bool', label: 'Animate always' },
  minimap: { kind: 'u16', label: 'Minimap', valueLabel: 'Color' },
  lensHelp: { kind: 'u16', label: 'Lens help', valueLabel: 'Help id' },
  fullGround: { kind: 'bool', label: 'Full ground' },
  ignoreLook: { kind: 'bool', label: 'Ignore look' },
  cloth: { kind: 'u16', label: 'Cloth', valueLabel: 'Slot' },
  market: { kind: 'market', label: 'Market item' },
  defaultAction: { kind: 'u16', label: 'Default action', valueLabel: 'Action' },
  wrappable: { kind: 'bool', label: 'Wrappable' },
  unwrappable: { kind: 'bool', label: 'Unwrappable' },
  topEffect: { kind: 'bool', label: 'Top effect' },
  usable: { kind: 'bool', label: 'Usable' },
} as const satisfies Record<string, Omit<FlagInfo, 'name'>>;

export type FlagName = keyof typeof FLAG_INFO;

export const FLAG_NAMES = Object.keys(FLAG_INFO) as FlagName[];

type BoolFlagName = { [K in FlagName]: (typeof FLAG_INFO)[K]['kind'] extends 'bool' ? K : never }[FlagName];
type U16FlagName = { [K in FlagName]: (typeof FLAG_INFO)[K]['kind'] extends 'u16' ? K : never }[FlagName];

/** Canonical flag values of a thing. Absent key = flag not set. */
export type ThingFlags = { [K in BoolFlagName]?: true } & { [K in U16FlagName]?: number } & {
  light?: LightInfo;
  offset?: OffsetInfo;
  market?: MarketInfo;
};

export function flagInfo(name: FlagName): FlagInfo {
  return { name, ...FLAG_INFO[name] } as FlagInfo;
}

/** Dat file layout generations. */
export type DatFormat = 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6';

export interface DatFormatInfo {
  format: DatFormat;
  label: string;
  /** Flag code -> canonical flag. */
  codes: ReadonlyArray<readonly [number, FlagName]>;
  /** Frame groups carry a pattern Z byte. */
  patternZ: boolean;
  /** The offset flag carries x/y (u16 each); older formats imply 8/8. */
  offsetHasData: boolean;
}

const V1_CODES: Array<[number, FlagName]> = [
  [0x00, 'ground'],
  [0x01, 'onBottom'],
  [0x02, 'onTop'],
  [0x03, 'container'],
  [0x04, 'stackable'],
  [0x05, 'multiUse'],
  [0x06, 'forceUse'],
  [0x07, 'writable'],
  [0x08, 'writableOnce'],
  [0x09, 'fluidContainer'],
  [0x0a, 'fluid'],
  [0x0b, 'unpassable'],
  [0x0c, 'unmoveable'],
  [0x0d, 'blockMissile'],
  [0x0e, 'blockPathfind'],
  [0x0f, 'pickupable'],
  [0x10, 'light'],
  [0x11, 'floorChange'],
  [0x12, 'fullGround'],
  [0x13, 'elevation'],
  [0x14, 'offset'],
  [0x16, 'minimap'],
  [0x17, 'rotatable'],
  [0x18, 'lyingObject'],
  [0x19, 'animateAlways'],
  [0x1a, 'lensHelp'],
];

const V2_CODES: Array<[number, FlagName]> = [
  [0x00, 'ground'],
  [0x01, 'onBottom'],
  [0x02, 'onTop'],
  [0x03, 'container'],
  [0x04, 'stackable'],
  [0x05, 'multiUse'],
  [0x06, 'forceUse'],
  [0x07, 'writable'],
  [0x08, 'writableOnce'],
  [0x09, 'fluidContainer'],
  [0x0a, 'fluid'],
  [0x0b, 'unpassable'],
  [0x0c, 'unmoveable'],
  [0x0d, 'blockMissile'],
  [0x0e, 'blockPathfind'],
  [0x0f, 'pickupable'],
  [0x10, 'light'],
  [0x11, 'floorChange'],
  [0x12, 'fullGround'],
  [0x13, 'elevation'],
  [0x14, 'offset'],
  [0x16, 'minimap'],
  [0x17, 'rotatable'],
  [0x18, 'lyingObject'],
  [0x19, 'hangable'],
  [0x1a, 'hookSouth'],
  [0x1b, 'hookEast'],
  [0x1c, 'animateAlways'],
  [0x1d, 'lensHelp'],
];

const V3_CODES: Array<[number, FlagName]> = [
  [0x00, 'ground'],
  [0x01, 'groundBorder'],
  [0x02, 'onBottom'],
  [0x03, 'onTop'],
  [0x04, 'container'],
  [0x05, 'stackable'],
  [0x06, 'forceUse'],
  [0x07, 'multiUse'],
  [0x08, 'writable'],
  [0x09, 'writableOnce'],
  [0x0a, 'fluidContainer'],
  [0x0b, 'fluid'],
  [0x0c, 'unpassable'],
  [0x0d, 'unmoveable'],
  [0x0e, 'blockMissile'],
  [0x0f, 'blockPathfind'],
  [0x10, 'pickupable'],
  [0x11, 'hangable'],
  [0x12, 'hookSouth'],
  [0x13, 'hookEast'],
  [0x14, 'rotatable'],
  [0x15, 'light'],
  [0x16, 'dontHide'],
  [0x17, 'floorChange'],
  [0x18, 'offset'],
  [0x19, 'elevation'],
  [0x1a, 'lyingObject'],
  [0x1b, 'animateAlways'],
  [0x1c, 'minimap'],
  [0x1d, 'lensHelp'],
  [0x1e, 'fullGround'],
];

const V4_CODES: Array<[number, FlagName]> = [
  [0x00, 'ground'],
  [0x01, 'groundBorder'],
  [0x02, 'onBottom'],
  [0x03, 'onTop'],
  [0x04, 'container'],
  [0x05, 'stackable'],
  [0x06, 'forceUse'],
  [0x07, 'multiUse'],
  [0x08, 'chargeable'],
  [0x09, 'writable'],
  [0x0a, 'writableOnce'],
  [0x0b, 'fluidContainer'],
  [0x0c, 'fluid'],
  [0x0d, 'unpassable'],
  [0x0e, 'unmoveable'],
  [0x0f, 'blockMissile'],
  [0x10, 'blockPathfind'],
  [0x11, 'pickupable'],
  [0x12, 'hangable'],
  [0x13, 'hookSouth'],
  [0x14, 'hookEast'],
  [0x15, 'rotatable'],
  [0x16, 'light'],
  [0x17, 'dontHide'],
  [0x18, 'translucent'],
  [0x19, 'offset'],
  [0x1a, 'elevation'],
  [0x1b, 'lyingObject'],
  [0x1c, 'animateAlways'],
  [0x1d, 'minimap'],
  [0x1e, 'lensHelp'],
  [0x1f, 'fullGround'],
  [0x20, 'ignoreLook'], // 8.50+
];

const V5_CODES: Array<[number, FlagName]> = [
  [0x00, 'ground'],
  [0x01, 'groundBorder'],
  [0x02, 'onBottom'],
  [0x03, 'onTop'],
  [0x04, 'container'],
  [0x05, 'stackable'],
  [0x06, 'forceUse'],
  [0x07, 'multiUse'],
  [0x08, 'writable'],
  [0x09, 'writableOnce'],
  [0x0a, 'fluidContainer'],
  [0x0b, 'fluid'],
  [0x0c, 'unpassable'],
  [0x0d, 'unmoveable'],
  [0x0e, 'blockMissile'],
  [0x0f, 'blockPathfind'],
  [0x10, 'pickupable'],
  [0x11, 'hangable'],
  [0x12, 'hookSouth'],
  [0x13, 'hookEast'],
  [0x14, 'rotatable'],
  [0x15, 'light'],
  [0x16, 'dontHide'],
  [0x17, 'translucent'],
  [0x18, 'offset'],
  [0x19, 'elevation'],
  [0x1a, 'lyingObject'],
  [0x1b, 'animateAlways'],
  [0x1c, 'minimap'],
  [0x1d, 'lensHelp'],
  [0x1e, 'fullGround'],
  [0x1f, 'ignoreLook'],
  [0x20, 'cloth'],
  [0x21, 'market'],
];

const V6_CODES: Array<[number, FlagName]> = [
  [0x00, 'ground'],
  [0x01, 'groundBorder'],
  [0x02, 'onBottom'],
  [0x03, 'onTop'],
  [0x04, 'container'],
  [0x05, 'stackable'],
  [0x06, 'forceUse'],
  [0x07, 'multiUse'],
  [0x08, 'writable'],
  [0x09, 'writableOnce'],
  [0x0a, 'fluidContainer'],
  [0x0b, 'fluid'],
  [0x0c, 'unpassable'],
  [0x0d, 'unmoveable'],
  [0x0e, 'blockMissile'],
  [0x0f, 'blockPathfind'],
  [0x10, 'noMoveAnimation'],
  [0x11, 'pickupable'],
  [0x12, 'hangable'],
  [0x13, 'hookSouth'],
  [0x14, 'hookEast'],
  [0x15, 'rotatable'],
  [0x16, 'light'],
  [0x17, 'dontHide'],
  [0x18, 'translucent'],
  [0x19, 'offset'],
  [0x1a, 'elevation'],
  [0x1b, 'lyingObject'],
  [0x1c, 'animateAlways'],
  [0x1d, 'minimap'],
  [0x1e, 'lensHelp'],
  [0x1f, 'fullGround'],
  [0x20, 'ignoreLook'],
  [0x21, 'cloth'],
  [0x22, 'market'],
  [0x23, 'defaultAction'],
  [0x24, 'wrappable'],
  [0x25, 'unwrappable'],
  [0x26, 'topEffect'],
  [0xfe, 'usable'],
];

export const DAT_FORMATS: Record<DatFormat, DatFormatInfo> = {
  v1: { format: 'v1', label: '7.10 - 7.30', codes: V1_CODES, patternZ: false, offsetHasData: false },
  v2: { format: 'v2', label: '7.40 - 7.50', codes: V2_CODES, patternZ: false, offsetHasData: false },
  v3: { format: 'v3', label: '7.55 - 7.72', codes: V3_CODES, patternZ: true, offsetHasData: true },
  v4: { format: 'v4', label: '7.80 - 8.54', codes: V4_CODES, patternZ: true, offsetHasData: true },
  v5: { format: 'v5', label: '8.55 - 9.86', codes: V5_CODES, patternZ: true, offsetHasData: true },
  v6: { format: 'v6', label: '10.00+', codes: V6_CODES, patternZ: true, offsetHasData: true },
};

export interface FlagCodec {
  byCode: Map<number, FlagName>;
  byName: Map<FlagName, number>;
}

const codecCache = new Map<DatFormat, FlagCodec>();

export function flagCodec(format: DatFormat): FlagCodec {
  let c = codecCache.get(format);
  if (!c) {
    const byCode = new Map<number, FlagName>();
    const byName = new Map<FlagName, number>();
    for (const [code, name] of DAT_FORMATS[format].codes) {
      byCode.set(code, name);
      byName.set(name, code);
    }
    c = { byCode, byName };
    codecCache.set(format, c);
  }
  return c;
}

/** Canonical flags supported by a dat format (for editors and conversion reports). */
export function supportedFlags(format: DatFormat): FlagName[] {
  return DAT_FORMATS[format].codes.map(([, n]) => n);
}
