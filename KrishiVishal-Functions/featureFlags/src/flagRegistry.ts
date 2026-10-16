/**
 * Feature-flag registry: the single source of truth for which flags exist,
 * their types, defaults, and whether they are "critical" (reason mandatory).
 * Pure module: no Firebase imports, so it is trivially unit-testable.
 */

export type FlagValue = boolean | number;

export type FlagSpec =
  | { kind: 'boolean'; critical: boolean; default: boolean }
  | { kind: 'int'; critical: boolean; default: number; min: number; max: number };

/** Global kill switches (system_configs/global). SuperAdmin only. */
export const GLOBAL_FLAGS = {
  checkoutFrozen: { kind: 'boolean', critical: true, default: false },
  paymentsOnlineEnabled: { kind: 'boolean', critical: true, default: true },
  codEnabled: { kind: 'boolean', critical: true, default: true },
  maintenanceMode: { kind: 'boolean', critical: true, default: false },
  minVersionCode: { kind: 'int', critical: true, default: 0, min: 0, max: 100_000_000 },
  adminWriteLock: { kind: 'boolean', critical: true, default: false },
} as const satisfies Record<string, FlagSpec>;

/** Hub overrides (system_configs/hubs_{hubId}). */
export const HUB_FLAGS = {
  lockdown: { kind: 'boolean', critical: true, default: false },
  acceptingOrders: { kind: 'boolean', critical: false, default: true },
  codEnabled: { kind: 'boolean', critical: false, default: true },
} as const satisfies Record<string, FlagSpec>;

/** Per-slot visibility lives in the map `slotVisibility`, addressed as `slotVisibility.<slotId>`. */
export const SLOT_MAP_KEY = 'slotVisibility';
export const SLOT_DEFAULT = true;
const SLOT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Valid Firestore document-id segment: no '/', not '.'/'..', not '__x__', <=128 chars.
 * Deliberately permissive otherwise so existing warehouse ids are never rejected.
 */
export const HUB_ID_RE = /^(?!\.\.?$)(?!__.*__$)[^/]{1,128}$/;

export type GlobalFlagName = keyof typeof GLOBAL_FLAGS;
export type HubFlagName = keyof typeof HUB_FLAGS;

export interface ResolvedFlag {
  scope: 'global' | 'hub';
  /** Full path as supplied by the client, e.g. "slotVisibility.slot_0900". */
  flagPath: string;
  /** Top-level field name; also the key under `flagMeta`. */
  topKey: string;
  slotId?: string;
  spec: FlagSpec;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function docPathFor(hubId: string | null): string {
  return hubId === null ? 'system_configs/global' : `system_configs/hubs_${hubId}`;
}

export function resolveFlag(hubId: string | null, flagPath: string): Result<ResolvedFlag> {
  if (hubId === null) {
    if (Object.prototype.hasOwnProperty.call(GLOBAL_FLAGS, flagPath)) {
      return {
        ok: true,
        value: { scope: 'global', flagPath, topKey: flagPath, spec: GLOBAL_FLAGS[flagPath as GlobalFlagName] },
      };
    }
    return { ok: false, error: `Unknown global flag "${flagPath}".` };
  }

  if (Object.prototype.hasOwnProperty.call(HUB_FLAGS, flagPath)) {
    return {
      ok: true,
      value: { scope: 'hub', flagPath, topKey: flagPath, spec: HUB_FLAGS[flagPath as HubFlagName] },
    };
  }

  const parts = flagPath.split('.');
  if (parts.length === 2 && parts[0] === SLOT_MAP_KEY && SLOT_ID_RE.test(parts[1] ?? '')) {
    return {
      ok: true,
      value: {
        scope: 'hub',
        flagPath,
        topKey: SLOT_MAP_KEY,
        slotId: parts[1] as string,
        spec: { kind: 'boolean', critical: false, default: SLOT_DEFAULT },
      },
    };
  }
  return { ok: false, error: `Unknown hub flag "${flagPath}".` };
}

/** Strictly validates the type and range of a proposed value. No coercion. */
export function validateValue(flag: ResolvedFlag, value: unknown): Result<FlagValue> {
  const { spec } = flag;
  if (spec.kind === 'boolean') {
    return typeof value === 'boolean'
      ? { ok: true, value }
      : { ok: false, error: `"${flag.flagPath}" must be a boolean.` };
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < spec.min || value > spec.max) {
    return { ok: false, error: `"${flag.flagPath}" must be an integer between ${spec.min} and ${spec.max}.` };
  }
  return { ok: true, value };
}

type Doc = Record<string, unknown> | null | undefined;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Effective stored value of a flag in a config doc (falls back to the registry default). */
export function readCurrentValue(flag: ResolvedFlag, data: Doc): FlagValue {
  const container = data ?? {};
  if (flag.slotId !== undefined) {
    const map = container[SLOT_MAP_KEY];
    const v = isRecord(map) ? map[flag.slotId] : undefined;
    return typeof v === 'boolean' ? v : SLOT_DEFAULT;
  }
  const v = container[flag.topKey];
  if (flag.spec.kind === 'boolean') return typeof v === 'boolean' ? v : flag.spec.default;
  return typeof v === 'number' && Number.isSafeInteger(v) ? v : flag.spec.default;
}

/** Defaults used to seed a brand-new config document. */
export function defaultsFor(scope: 'global' | 'hub'): Record<string, FlagValue | Record<string, never>> {
  const out: Record<string, FlagValue | Record<string, never>> = {};
  const src: Record<string, FlagSpec> = scope === 'global' ? GLOBAL_FLAGS : HUB_FLAGS;
  for (const [k, spec] of Object.entries(src)) out[k] = spec.default;
  if (scope === 'hub') out[SLOT_MAP_KEY] = {};
  return out;
}
