/**
 * KrishiVishal Meta Leadgen Webhook Handler
 * Verifies Meta webhook challenge and ingests digital leads into Firestore leads collection.
 */

const { onRequest } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");

const REGION = 'asia-south1';
const DEFAULT_VERIFY_TOKEN = 'KRISHIVISHAL_LEAD_SECRET';

/**
 * Validates Meta Webhook verification handshake.
 * Pure function for testing and runtime handling.
 */
function verifyWebhookChallenge(query, expectedToken = (process.env.META_VERIFY_TOKEN || DEFAULT_VERIFY_TOKEN)) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === expectedToken) {
        return { isValid: true, challenge };
    }
    return { isValid: false, challenge: null };
}

/**
 * Parses incoming Meta leadgen webhook body and extracts lead objects.
 */
function parseLeadPayload(body) {
    const leads = [];
    if (!body || !Array.isArray(body.entry)) return leads;

    for (const entry of body.entry) {
        if (!Array.isArray(entry.changes)) continue;
        for (const change of entry.changes) {
            if (change.field === 'leadgen' && change.value) {
                const val = change.value;
                const leadgenId = val.leadgen_id || val.id;
                if (!leadgenId) continue;

                leads.push({
                    leadgenId: String(leadgenId),
                    formId: val.form_id ? String(val.form_id) : null,
                    pageId: val.page_id ? String(val.page_id) : null,
                    adId: val.ad_id ? String(val.ad_id) : null,
                    rawPayload: val
                });
            }
        }
    }
    return leads;
}

/**
 * HTTP Function: metaLeadWebhook
 * Handles Meta Webhook verification (GET) and Leadgen Events (POST)
 */
const metaLeadWebhook = onRequest({ region: REGION, timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
    try {
        // 1. GET: Webhook Verification Challenge
        if (req.method === 'GET') {
            const verification = verifyWebhookChallenge(req.query);
            if (verification.isValid) {
                console.log('[Meta Webhook] Challenge verified successfully.');
                return res.status(200).send(verification.challenge);
            } else {
                console.warn('[Meta Webhook] Challenge token verification failed.');
                return res.status(403).send('Forbidden: Invalid verification token');
            }
        }

        // 2. POST: Lead Ingestion
        if (req.method === 'POST') {
            const leads = parseLeadPayload(req.body);
            if (leads.length === 0) {
                // Return 200 so Meta doesn't retry non-leadgen payloads
                return res.status(200).json({ status: 'ignored', message: 'No leadgen records found in payload' });
            }

            const batch = db.batch();
            const timestamp = admin.firestore.FieldValue.serverTimestamp();

            for (const lead of leads) {
                const leadRef = db.collection('leads').doc(lead.leadgenId);
                batch.set(leadRef, {
                    leadSource: 'META_ADS',
                    leadgenId: lead.leadgenId,
                    formId: lead.formId,
                    pageId: lead.pageId,
                    adId: lead.adId,
                    status: 'NEW', // NEW -> CONTACTED -> CONVERTED -> DROPPED
                    assignedHubId: 'hub_central_samastipur',
                    telecallerDisposition: null,
                    rawPayload: lead.rawPayload,
                    createdAt: timestamp,
                    updatedAt: timestamp
                }, { merge: true });
            }

            await batch.commit();
            console.log(`[Meta Webhook] Successfully ingested ${leads.length} digital lead(s).`);
            return res.status(200).json({ status: 'success', ingestedCount: leads.length });
        }

        // Method not allowed
        return res.status(405).send('Method Not Allowed');
    } catch (error) {
        console.error('[Meta Webhook] Unexpected error processing request:', error);
        // Return 200 to Meta to prevent endless redelivery loops on application error
        return res.status(200).json({ status: 'error_handled', error: error.message });
    }
});

module.exports = {
    verifyWebhookChallenge,
    parseLeadPayload,
    metaLeadWebhook
};
