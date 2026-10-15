const PENDING_RESOLUTION_STORAGE_PREFIX = 'kv_pending_quarantine_res_';

/**
 * Gets an existing durable requestId for a given quarantine resolution or creates and persists a new one.
 * Ensures retry safety even across browser reloads or network drops.
 *
 * @param {string} entityId - Identifier for the item (e.g. quarantineId)
 * @param {object} payload - Action payload to sign/fingerprint
 * @param {string} prefix - Optional storage prefix
 * @returns {{ requestId: string, storageKey: string }}
 */
export function getOrCreateDurableRequestId(entityId, payload, prefix = PENDING_RESOLUTION_STORAGE_PREFIX) {
  const storageKey = `${prefix}${entityId}`;
  const payloadSignature = JSON.stringify(payload);
  const storage = getStorage();
  const existing = readPendingResolution(storage, storageKey);

  if (existing) {
    if (existing.signature !== payloadSignature) {
      throw new Error('A quarantine resolution is already pending. Retry the saved operation before starting another one.');
    }
    return { requestId: existing.requestId, storageKey };
  }

  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Secure request IDs are unavailable in this browser. Use a supported browser over HTTPS.');
  }
  const newRequestId = globalThis.crypto.randomUUID();
  storage.setItem(storageKey, JSON.stringify({
    requestId: newRequestId,
    signature: payloadSignature,
    payload,
    timestamp: Date.now()
  }));
  return { requestId: newRequestId, storageKey };
}

export function getPendingDurableRequest(entityId, prefix = PENDING_RESOLUTION_STORAGE_PREFIX) {
  const storageKey = `${prefix}${entityId}`;
  return readPendingResolution(getStorage(), storageKey);
}

/**
 * Clears durable requestId from localStorage upon successful completion.
 *
 * @param {string} entityId - Identifier for the item
 * @param {string} prefix - Optional storage prefix
 */
export function clearDurableRequestId(entityId, prefix = PENDING_RESOLUTION_STORAGE_PREFIX) {
  getStorage().removeItem(`${prefix}${entityId}`);
}

function getStorage() {
  if (typeof localStorage === 'undefined') {
    throw new Error('Persistent browser storage is unavailable. Quarantine resolution was not submitted.');
  }
  return localStorage;
}

function readPendingResolution(storage, storageKey) {
  const raw = storage.getItem(storageKey);
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error('The saved quarantine request is unreadable. Do not submit a new resolution until it is reviewed.');
  }

  if (!parsed || typeof parsed.requestId !== 'string' || typeof parsed.signature !== 'string') {
    throw new Error('The saved quarantine request is incomplete. Do not submit a new resolution until it is reviewed.');
  }
  return parsed;
}
