/**
 * Backend enforcement of kill switches. Call `assertCheckoutAllowed` at the top
 * of every order-creating Cloud Function. Client-side hiding is UX only; this
 * is the actual control.
 *
 * Semantics: the MOST RESTRICTIVE of global and hub state wins.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { ConfigCache, ConfigData, getDefaultCache } from './configCache';
import { GLOBAL_FLAGS, HUB_FLAGS, HUB_ID_RE, docPathFor } from './flagRegistry';

export interface EffectiveConfig {
  maintenanceMode: boolean;
  checkoutFrozen: boolean;
  paymentsOnlineEnabled: boolean;
  codEnabledGlobal: boolean;
  hubLockdown: boolean;
  hubAcceptingOrders: boolean;
  codEnabledHub: boolean;
}

export type CheckoutBlockCode =
  | 'MAINTENANCE_MODE'
  | 'CHECKOUT_FROZEN'
  | 'HUB_LOCKDOWN'
  | 'HUB_NOT_ACCEPTING_ORDERS'
  | 'COD_DISABLED'
  | 'ONLINE_PAYMENTS_DISABLED';

export type CheckoutDecision = { allowed: true } | { allowed: false; code: CheckoutBlockCode; message: string };

function bool(data: ConfigData, key: string, fallback: boolean): boolean {
  const v = data?.[key];
  return typeof v === 'boolean' ? v : fallback;
}

export function toEffectiveConfig(globalDoc: ConfigData, hubDoc: ConfigData): EffectiveConfig {
  return {
    maintenanceMode: bool(globalDoc, 'maintenanceMode', GLOBAL_FLAGS.maintenanceMode.default),
    checkoutFrozen: bool(globalDoc, 'checkoutFrozen', GLOBAL_FLAGS.checkoutFrozen.default),
    paymentsOnlineEnabled: bool(globalDoc, 'paymentsOnlineEnabled', GLOBAL_FLAGS.paymentsOnlineEnabled.default),
    codEnabledGlobal: bool(globalDoc, 'codEnabled', GLOBAL_FLAGS.codEnabled.default),
    hubLockdown: bool(hubDoc, 'lockdown', HUB_FLAGS.lockdown.default),
    hubAcceptingOrders: bool(hubDoc, 'acceptingOrders', HUB_FLAGS.acceptingOrders.default),
    codEnabledHub: bool(hubDoc, 'codEnabled', HUB_FLAGS.codEnabled.default),
  };
}

/** Pure decision function (no I/O). Order = severity. */
export function evaluateCheckout(cfg: EffectiveConfig, paymentMethod?: string): CheckoutDecision {
  if (cfg.maintenanceMode) {
    return { allowed: false, code: 'MAINTENANCE_MODE', message: 'The store is under maintenance. Please try again shortly.' };
  }
  if (cfg.checkoutFrozen) {
    return { allowed: false, code: 'CHECKOUT_FROZEN', message: 'Checkout is temporarily unavailable. Please try again later.' };
  }
  if (cfg.hubLockdown) {
    return { allowed: false, code: 'HUB_LOCKDOWN', message: 'This hub is temporarily closed. Orders cannot be placed right now.' };
  }
  if (!cfg.hubAcceptingOrders) {
    return { allowed: false, code: 'HUB_NOT_ACCEPTING_ORDERS', message: 'This hub is not accepting orders at the moment.' };
  }
  if (paymentMethod === 'COD' && (!cfg.codEnabledGlobal || !cfg.codEnabledHub)) {
    return { allowed: false, code: 'COD_DISABLED', message: 'Cash on Delivery is currently unavailable. Please choose another payment method.' };
  }
  if (paymentMethod === 'RAZORPAY_ONLINE' && !cfg.paymentsOnlineEnabled) {
    return { allowed: false, code: 'ONLINE_PAYMENTS_DISABLED', message: 'Online payments are currently unavailable. Please choose another payment method.' };
  }
  return { allowed: true };
}

export interface CheckoutContext {
  /** warehouses/{id} the order is routed to. */
  hubId: string;
  /** 'COD' | 'RAZORPAY_ONLINE' | 'WALLET' (unknown values are not payment-gated). */
  paymentMethod?: string;
}

/**
 * Throws HttpsError('failed-precondition', msg, { code }) when checkout is blocked.
 * `details.code` is a stable machine code for client UI mapping.
 *
 * Cache: 10s per instance, so a flag flip takes effect within ~10s everywhere.
 * If Firestore is unreachable and no recent value exists this throws `unavailable`
 * (fail-closed): createOrder needs Firestore transactions anyway.
 */
export async function assertCheckoutAllowed(
  ctx: CheckoutContext,
  cache: ConfigCache = getDefaultCache(),
): Promise<void> {
  if (typeof ctx.hubId !== 'string' || !HUB_ID_RE.test(ctx.hubId)) {
    throw new HttpsError('invalid-argument', 'Invalid hub ID.');
  }

  let globalDoc: ConfigData;
  let hubDoc: ConfigData;
  try {
    [globalDoc, hubDoc] = await Promise.all([
      cache.getDoc(docPathFor(null)),
      cache.getDoc(docPathFor(ctx.hubId)),
    ]);
  } catch (err) {
    console.error('[featureFlags] Unable to read system_configs; failing closed.', err);
    throw new HttpsError('unavailable', 'Unable to verify store status. Please try again.');
  }

  const decision = evaluateCheckout(toEffectiveConfig(globalDoc, hubDoc), ctx.paymentMethod);
  if (!decision.allowed) {
    console.warn(`[featureFlags] Checkout blocked (${decision.code}) hub=${ctx.hubId} method=${ctx.paymentMethod ?? 'n/a'}`);
    throw new HttpsError('failed-precondition', decision.message, { code: decision.code });
  }
}
