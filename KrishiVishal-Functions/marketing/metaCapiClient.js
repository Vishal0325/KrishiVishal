/**
 * KrishiVishal Meta Conversions API (CAPI) Client
 * Enterprise-grade server-side event tracking with SHA-256 PII hashing.
 */

const crypto = require('crypto');
const axios = require('axios');

/**
 * Normalizes input (trims, lowercases) and computes hex SHA-256 hash.
 */
function hashData(value) {
    if (value === null || value === undefined) return null;
    const cleanStr = String(value).trim().toLowerCase();
    if (cleanStr.length === 0) return null;
    return crypto.createHash('sha256').update(cleanStr, 'utf8').digest('hex');
}

/**
 * Normalizes phone numbers for Meta CAPI specifications:
 * Strips symbols/spaces, prepends country code 91 if missing for 10-digit Indian numbers.
 */
function normalizePhone(phone) {
    if (!phone) return null;
    let digits = String(phone).replace(/\D/g, '');
    if (!digits) return null;

    // Handle leading zero: 09876543210 -> 9876543210
    if (digits.length === 11 && digits.startsWith('0')) {
        digits = digits.slice(1);
    }

    // Standard 10-digit Indian mobile number -> prepend country code 91
    if (digits.length === 10) {
        digits = '91' + digits;
    }

    return digits;
}

/**
 * Hashes phone number following Meta specifications.
 */
function hashPhone(phone) {
    const normalized = normalizePhone(phone);
    return normalized ? hashData(normalized) : null;
}

/**
 * Sends a server-side event to Meta Conversions API.
 * Resilient Guard: If credentials are not configured, logs a warning and resolves gracefully.
 *
 * @param {Object} params
 * @param {string} params.eventName - e.g. 'Purchase', 'Lead', 'AddToCart'
 * @param {string} params.eventId - Unique deduplication key e.g. 'PURCHASE_ORD_123'
 * @param {Object} params.userData - { phone, firstName, city, email }
 * @param {Object} params.customData - { value, currency, content_type, ... }
 * @param {string} [params.actionSource='app'] - 'app', 'website', 'system_generated'
 * @returns {Promise<Object>}
 */
async function sendCapiEvent({
    eventName,
    eventId,
    userData = {},
    customData = {},
    actionSource = 'app'
}) {
    const accessToken = process.env.META_ACCESS_TOKEN;
    const pixelId = process.env.META_PIXEL_ID;

    if (!accessToken || !pixelId) {
        console.warn('[Meta CAPI] Missing META_ACCESS_TOKEN or META_PIXEL_ID. Gracefully skipping event dispatch.');
        return {
            success: false,
            skipped: true,
            reason: 'MISSING_CREDENTIALS'
        };
    }

    try {
        const userPayload = {};

        if (userData.phone) {
            const hPh = hashPhone(userData.phone);
            if (hPh) userPayload.ph = [hPh];
        }

        if (userData.firstName) {
            const hFn = hashData(userData.firstName);
            if (hFn) userPayload.fn = [hFn];
        }

        if (userData.city) {
            const hCt = hashData(userData.city);
            if (hCt) userPayload.ct = [hCt];
        }

        if (userData.email) {
            const hEm = hashData(userData.email);
            if (hEm) userPayload.em = [hEm];
        }

        const payload = {
            data: [
                {
                    event_name: eventName,
                    event_time: Math.floor(Date.now() / 1000),
                    event_id: eventId,
                    action_source: actionSource,
                    user_data: userPayload,
                    custom_data: customData
                }
            ]
        };

        const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 8000
        });

        return {
            success: true,
            data: response.data,
            eventId
        };
    } catch (error) {
        console.error(`[Meta CAPI] Error sending event ${eventName} (${eventId}):`, error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data || error.message,
            eventId
        };
    }
}

module.exports = {
    hashData,
    normalizePhone,
    hashPhone,
    sendCapiEvent
};
