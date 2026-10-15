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
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.signature === payloadSignature && parsed.requestId) {
        if (!parsed.timestamp || Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          return { requestId: parsed.requestId, storageKey };
        }
      }
    }
  } catch (err) {
    console.warn('localStorage read error:', err);
  }

  const newRequestId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify({
        requestId: newRequestId,
        signature: payloadSignature,
        timestamp: Date.now()
      }));
    }
  } catch (err) {
    console.warn('localStorage write error:', err);
  }
  return { requestId: newRequestId, storageKey };
}

/**
 * Clears durable requestId from localStorage upon successful completion.
 *
 * @param {string} entityId - Identifier for the item
 * @param {string} prefix - Optional storage prefix
 */
export function clearDurableRequestId(entityId, prefix = PENDING_RESOLUTION_STORAGE_PREFIX) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${prefix}${entityId}`);
    }
  } catch (err) {
    console.warn('localStorage clear error:', err);
  }
}
