/**
 * updateFeatureFlag: the ONLY write path to system_configs.
 *
 * Request:  { flagPath, newValue, reason, expectedVersion, hubId?: string | null }
 *   - hubId omitted/null  -> system_configs/global   (SuperAdmin only)
 *   - hubId = "<id>"      -> system_configs/hubs_<id> (SuperAdmin, or HubManager of that hub)
 *
 * Atomicity: a Firestore transaction (reads + optimistic version check + one
 * atomic commit of config write AND audit append). A plain batch cannot do the
 * expectedVersion check because it cannot read.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Firestore, getFirestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { getDefaultCache } from './configCache';
import {
  FlagValue,
  HUB_ID_RE,
  ResolvedFlag,
  defaultsFor,
  docPathFor,
  readCurrentValue,
  resolveFlag,
  validateValue,
} from './flagRegistry';

const REGION = 'asia-south1';
const MIN_CRITICAL_REASON = 10;
const MAX_REASON = 500;
const MAX_FLAG_PATH = 100;

export interface UpdateFeatureFlagInput {
  flagPath: string;
  newValue: unknown;
  reason: string;
  expectedVersion: number;
  hubId?: string | null;
}

export interface UpdateFeatureFlagResult {
  success: true;
  changed: boolean;
  configDoc: string;
  flagPath: string;
  oldValue: FlagValue;
  newValue: FlagValue;
  /** Version after this call (unchanged when `changed` is false). */
  version: number;
}

export interface Caller {
  uid: string;
  email: string | null;
  /** Authoritative claims (read from the user record, not the possibly stale ID token). */
  claims: Record<string, unknown>;
  ip: string | null;
}

export type CallerRole = 'super_admin' | 'hub_manager';

// ---------------------------------------------------------------- authorization

export function isSuperAdminClaims(claims: Record<string, unknown>): boolean {
  return claims['role'] === 'SuperAdmin' || claims['role'] === 'SUPER_ADMIN';
}

/**
 * RBAC. Throws permission-denied unless the caller may modify the target scope.
 * `hubId === null` means the global document.
 */
export function authorize(claims: Record<string, unknown>, hubId: string | null): CallerRole {
  if (claims['isActive'] === false) {
    throw new HttpsError('permission-denied', 'Your account is inactive.');
  }
  if (isSuperAdminClaims(claims)) return 'super_admin';

  if (hubId === null) {
    throw new HttpsError('permission-denied', 'Only a SuperAdmin can change global kill switches.');
  }
  const ownHub = claims['hubId'];
  if (claims['role'] === 'HubManager' && typeof ownHub === 'string' && ownHub.length > 0 && ownHub === hubId) {
    return 'hub_manager';
  }
  throw new HttpsError('permission-denied', 'You can only change flags for your own hub.');
}

// ------------------------------------------------------------------ validation

export interface ValidatedInput {
  hubId: string | null;
  flag: ResolvedFlag;
  newValue: FlagValue;
  reason: string;
  expectedVersion: number;
}

export function validateInput(data: unknown): ValidatedInput {
  if (typeof data !== 'object' || data === null) {
    throw new HttpsError('invalid-argument', 'Request body is required.');
  }
  const d = data as Record<string, unknown>;

  let hubId: string | null = null;
  if (d['hubId'] !== undefined && d['hubId'] !== null) {
    if (typeof d['hubId'] !== 'string' || !HUB_ID_RE.test(d['hubId'])) {
      throw new HttpsError('invalid-argument', 'hubId is invalid.');
    }
    hubId = d['hubId'];
  }

  const flagPath = d['flagPath'];
  if (typeof flagPath !== 'string' || flagPath.length === 0 || flagPath.length > MAX_FLAG_PATH) {
    throw new HttpsError('invalid-argument', 'flagPath is required.');
  }
  const resolved = resolveFlag(hubId, flagPath);
  if (!resolved.ok) throw new HttpsError('invalid-argument', resolved.error);

  if (!('newValue' in d)) throw new HttpsError('invalid-argument', 'newValue is required.');
  const value = validateValue(resolved.value, d['newValue']);
  if (!value.ok) throw new HttpsError('invalid-argument', value.error);

  const rawReason = d['reason'];
  if (rawReason !== undefined && typeof rawReason !== 'string') {
    throw new HttpsError('invalid-argument', 'reason must be a string.');
  }
  const reason = (rawReason ?? '').trim();
  if (reason.length > MAX_REASON) {
    throw new HttpsError('invalid-argument', `reason must be at most ${MAX_REASON} characters.`);
  }
  if (resolved.value.spec.critical && reason.length < MIN_CRITICAL_REASON) {
    throw new HttpsError(
      'invalid-argument',
      `A reason of at least ${MIN_CRITICAL_REASON} characters is mandatory for critical switches.`,
    );
  }

  const expectedVersion = d['expectedVersion'];
  if (typeof expectedVersion !== 'number' || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new HttpsError('invalid-argument', 'expectedVersion (integer >= 0) is required.');
  }

  return { hubId, flag: resolved.value, newValue: value.value, reason, expectedVersion };
}

// ----------------------------------------------------------------- transaction

function readVersion(data: Record<string, unknown> | undefined): number {
  const v = data?.['version'];
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0;
}

function metaRole(data: Record<string, unknown> | undefined, key: string): unknown {
  const fm = data?.['flagMeta'];
  if (typeof fm !== 'object' || fm === null) return undefined;
  const m = (fm as Record<string, unknown>)[key];
  return typeof m === 'object' && m !== null ? (m as Record<string, unknown>)['updatedByRole'] : undefined;
}

export async function applyFlagUpdate(
  db: Firestore,
  caller: Caller,
  input: ValidatedInput,
  role: CallerRole,
): Promise<UpdateFeatureFlagResult> {
  const { hubId, flag, newValue, reason, expectedVersion } = input;
  const configDoc = docPathFor(hubId);
  const configRef = db.doc(configDoc);
  const globalRef = db.doc(docPathFor(null));
  const auditRef = db.collection('system_config_audit').doc();

  const result = await db.runTransaction(async (tx) => {
    // ---- all reads first ----
    const configSnap = await tx.get(configRef);
    const globalSnap = hubId === null ? configSnap : await tx.get(globalRef);
    if (hubId !== null) {
      const hubSnap = await tx.get(db.collection('warehouses').doc(hubId));
      if (!hubSnap.exists) throw new HttpsError('not-found', `Hub "${hubId}" does not exist.`);
    }

    const data = configSnap.exists ? (configSnap.data() as Record<string, unknown>) : undefined;
    const globalData = globalSnap.exists ? (globalSnap.data() as Record<string, unknown>) : undefined;

    // ---- global write lock: only SuperAdmin may act (break-glass) ----
    if (role !== 'super_admin' && globalData?.['adminWriteLock'] === true) {
      throw new HttpsError('failed-precondition', 'Admin writes are locked by a SuperAdmin.');
    }

    // ---- optimistic concurrency ----
    const currentVersion = readVersion(data);
    if (currentVersion !== expectedVersion) {
      throw new HttpsError('aborted', 'These controls were changed by someone else. Review the latest state and retry.', {
        currentVersion,
        expectedVersion,
      });
    }

    const oldValue = readCurrentValue(flag, data);

    // A HubManager must not lift a lockdown imposed by a SuperAdmin.
    if (
      role === 'hub_manager' &&
      flag.flagPath === 'lockdown' &&
      oldValue === true &&
      newValue === false &&
      metaRole(data, 'lockdown') === 'super_admin'
    ) {
      throw new HttpsError('permission-denied', 'This lockdown was set by a SuperAdmin and can only be lifted by one.');
    }

    if (oldValue === newValue) {
      return { changed: false, oldValue, version: currentVersion };
    }

    const nextVersion = currentVersion + 1;
    const meta = {
      flagPath: flag.flagPath,
      updatedBy: caller.uid,
      updatedByEmail: caller.email,
      updatedByRole: role,
      updatedAt: FieldValue.serverTimestamp(),
      reason,
    };

    // set(..., {merge:true}) deep-merges maps: only the touched leaf and flagMeta.<key> change.
    const leaf: Record<string, unknown> =
      flag.slotId !== undefined ? { [flag.topKey]: { [flag.slotId]: newValue } } : { [flag.topKey]: newValue };

    const patch: Record<string, unknown> = {
      ...(configSnap.exists ? {} : { ...defaultsFor(hubId === null ? 'global' : 'hub'), ...(hubId ? { hubId } : {}) }),
      ...leaf,
      flagMeta: { [flag.topKey]: meta },
      version: nextVersion,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: caller.uid,
      reason,
    };

    tx.set(configRef, patch, { merge: true });
    tx.set(auditRef, {
      configDoc,
      flagPath: flag.flagPath,
      oldValue,
      newValue,
      updatedBy: caller.uid,
      updatedByEmail: caller.email,
      role,
      reason,
      hubId,
      severity: flag.spec.critical ? 'critical' : 'operational',
      version: nextVersion,
      at: FieldValue.serverTimestamp(),
      ip: caller.ip,
    });

    return { changed: true, oldValue, version: nextVersion };
  });

  if (result.changed) getDefaultCache().invalidate(configDoc);

  return {
    success: true,
    changed: result.changed,
    configDoc,
    flagPath: flag.flagPath,
    oldValue: result.oldValue,
    newValue,
    version: result.version,
  };
}

// --------------------------------------------------------------------- callable

function clientIp(request: CallableRequest<unknown>): string | null {
  const xff = request.rawRequest?.headers?.['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  const ip = first || request.rawRequest?.ip || null;
  return ip ? ip.slice(0, 64) : null;
}

export const updateFeatureFlag = onCall(
  { region: REGION, cors: true },
  async (request: CallableRequest<unknown>): Promise<UpdateFeatureFlagResult> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Login required.');
    }
    if (getApps().length === 0) initializeApp();

    // Validate the shape first (no I/O), so malformed calls are cheap.
    const input = validateInput(request.data);

    // Authoritative claims: a demoted/disabled admin loses access immediately,
    // not after the ID token expires.
    const record = await getAuth().getUser(request.auth.uid);
    if (record.disabled) throw new HttpsError('permission-denied', 'Account disabled.');
    const claims = (record.customClaims ?? {}) as Record<string, unknown>;

    const role = authorize(claims, input.hubId);

    const caller: Caller = {
      uid: request.auth.uid,
      email: record.email ?? (typeof request.auth.token?.email === 'string' ? request.auth.token.email : null),
      claims,
      ip: clientIp(request),
    };

    try {
      return await applyFlagUpdate(getFirestore(), caller, input, role);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('[updateFeatureFlag] Unexpected failure', err);
      throw new HttpsError('internal', 'Failed to update the flag.');
    }
  },
);
