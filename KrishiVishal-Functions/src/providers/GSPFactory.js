const ClearTaxProvider = require('./ClearTaxProvider');
const MockProvider = require('./MockProvider');
const { db } = require('../../core/admin');

/**
 * Factory to get the configured GSP provider
 */
async function getGSPProvider() {
    // 1. Fetch config from Firestore
    const configSnap = await db.collection("settings").doc("config").get();
    const config = configSnap.data()?.gsp || { activeProvider: 'MOCK', mode: 'SANDBOX' };

    const { activeProvider, mode } = config;

    // 2. Production Guard: Forbid MOCK in PRODUCTION
    if (mode === 'PRODUCTION' && activeProvider === 'MOCK') {
        console.error("CRITICAL SECURITY VIOLATION: MOCK GSP Provider requested in PRODUCTION mode.");
        throw new Error("MOCK provider is strictly prohibited in PRODUCTION environment.");
    }

    // 3. Instantiate requested provider
    switch (activeProvider) {
        case 'CLEARTAX':
            return new ClearTaxProvider(mode);
        case 'MOCK':
            return new MockProvider(mode);
        default:
            console.warn(`Unknown GSP Provider: ${activeProvider}. Falling back to MOCK (Sandbox).`);
            return new MockProvider('SANDBOX');
    }
}

module.exports = { getGSPProvider };
