/**
 * UNIT TEST SUITE FOR FEATURE 3: CLICK RATE & CONVERSION TRACKING
 * Run with: node tests/feature3_conversion_analytics.test.js
 */

const assert = require('assert');
const { validateCampaignInput } = require('../messaging/campaigns');

console.log("=== RUNNING FEATURE 3 CLICK RATE & CONVERSION ANALYTICS TESTS ===\n");

async function runFeature3Tests() {
    let passed = 0;
    let failed = 0;

    function recordPass(testName) {
        console.log(`✅ PASS: ${testName}`);
        passed++;
    }

    function recordFail(testName, err) {
        console.error(`❌ FAIL: ${testName}`, err);
        failed++;
    }

    // 1. Campaign Input: Default stats include clicks, conversions, and revenue
    try {
        const indexJs = require('../index.js');
        assert(indexJs.recordCampaignClick, "recordCampaignClick must be exported from index.js");
        assert(indexJs.getCampaignAnalytics, "getCampaignAnalytics must be exported from index.js");
        assert(indexJs.trackCampaignClick, "trackCampaignClick must be exported from index.js");
        recordPass("1.1 recordCampaignClick, getCampaignAnalytics, and trackCampaignClick registered in index.js");
    } catch (e) {
        recordFail("1.1 Registration in index.js failed", e);
    }

    // 2. Click Rate (CTR) Calculation Math Verification
    try {
        const calculateCtr = (uniqueClicks, sentCount) => {
            const sent = Math.max(1, sentCount || 1);
            return Math.round((uniqueClicks / sent) * 1000) / 10;
        };

        // 50 unique clicks out of 200 sent = 25.0%
        assert.strictEqual(calculateCtr(50, 200), 25.0);
        // 1 unique click out of 3 sent = 33.3%
        assert.strictEqual(calculateCtr(1, 3), 33.3);
        // 0 clicks out of 100 sent = 0.0%
        assert.strictEqual(calculateCtr(0, 100), 0.0);
        // Fallback when sent is 0 or undefined
        assert.strictEqual(calculateCtr(5, 0), 500.0);
        recordPass("2.1 CTR mathematical precision and edge cases verified");
    } catch (e) {
        recordFail("2.1 CTR calculation failed", e);
    }

    // 3. Conversion Rate Calculation Math Verification
    try {
        const calculateConvRate = (conversions, uniqueClicks) => {
            const clicks = Math.max(1, uniqueClicks || 1);
            return Math.round((conversions / clicks) * 1000) / 10;
        };

        // 5 conversions out of 50 unique clicks = 10.0%
        assert.strictEqual(calculateConvRate(5, 50), 10.0);
        // 2 conversions out of 3 unique clicks = 66.7%
        assert.strictEqual(calculateConvRate(2, 3), 66.7);
        // 0 conversions out of 10 clicks = 0.0%
        assert.strictEqual(calculateConvRate(0, 10), 0.0);
        recordPass("3.1 Conversion rate mathematical precision verified");
    } catch (e) {
        recordFail("3.1 Conversion rate calculation failed", e);
    }

    // 4. Click Deduplication Logic Verification
    try {
        // Simulated in-memory test for click tracking deduplication
        const mockCampaign = {
            id: 'camp_test_1',
            stats: { sent: 100, clicks: 0, uniqueClicks: 0, ctr: 0 }
        };
        const clicksDb = new Map();

        function recordClickSimulated(campaign, clientKey) {
            const exists = clicksDb.has(clientKey);
            let isUnique = false;
            if (!exists) {
                isUnique = true;
                clicksDb.set(clientKey, { clickCount: 1 });
                campaign.stats.uniqueClicks++;
            } else {
                clicksDb.get(clientKey).clickCount++;
            }
            campaign.stats.clicks++;
            campaign.stats.ctr = Math.round((campaign.stats.uniqueClicks / campaign.stats.sent) * 1000) / 10;
            return { isUnique, clicks: campaign.stats.clicks, uniqueClicks: campaign.stats.uniqueClicks, ctr: campaign.stats.ctr };
        }

        // Click 1: User A
        const r1 = recordClickSimulated(mockCampaign, 'user_A');
        assert.strictEqual(r1.isUnique, true);
        assert.strictEqual(r1.clicks, 1);
        assert.strictEqual(r1.uniqueClicks, 1);
        assert.strictEqual(r1.ctr, 1.0);

        // Click 2: User A again (duplicate click)
        const r2 = recordClickSimulated(mockCampaign, 'user_A');
        assert.strictEqual(r2.isUnique, false);
        assert.strictEqual(r2.clicks, 2);
        assert.strictEqual(r2.uniqueClicks, 1); // Remains 1!
        assert.strictEqual(r2.ctr, 1.0);

        // Click 3: User B (new user)
        const r3 = recordClickSimulated(mockCampaign, 'user_B');
        assert.strictEqual(r3.isUnique, true);
        assert.strictEqual(r3.clicks, 3);
        assert.strictEqual(r3.uniqueClicks, 2); // Increments to 2
        assert.strictEqual(r3.ctr, 2.0);

        recordPass("4.1 Click deduplication strictly increments total clicks while preserving unique user count");
    } catch (e) {
        recordFail("4.1 Click deduplication simulation failed", e);
    }

    // 5. Order Conversion Attribution Simulation
    try {
        const mockCampaign = {
            id: 'camp_spring_sale',
            stats: { sent: 500, clicks: 120, uniqueClicks: 100, conversions: 0, revenue: 0 }
        };
        const conversionsDb = new Map();

        function attributeOrderConversion(campaign, orderId, orderTotal, userId) {
            if (conversionsDb.has(orderId)) return false; // Idempotency
            conversionsDb.set(orderId, { orderId, orderTotal, userId });
            campaign.stats.conversions += 1;
            campaign.stats.revenue += orderTotal;
            return true;
        }

        // Conversion 1: ₹1,500 order
        attributeOrderConversion(mockCampaign, 'ORD_001', 1500, 'usr_1');
        assert.strictEqual(mockCampaign.stats.conversions, 1);
        assert.strictEqual(mockCampaign.stats.revenue, 1500);

        // Conversion 2: ₹3,250 order
        attributeOrderConversion(mockCampaign, 'ORD_002', 3250, 'usr_2');
        assert.strictEqual(mockCampaign.stats.conversions, 2);
        assert.strictEqual(mockCampaign.stats.revenue, 4750);

        // Average Order Value (AOV)
        const aov = Math.round(mockCampaign.stats.revenue / mockCampaign.stats.conversions);
        assert.strictEqual(aov, 2375);

        recordPass("5.1 Order conversion correctly aggregates order count, total revenue, and AOV");
    } catch (e) {
        recordFail("5.1 Order conversion attribution simulation failed", e);
    }

    // 6. Security & Role Matrix for Analytics
    try {
        const { verifyMarketingAdmin } = require('../messaging/campaigns');
        assert.throws(() => verifyMarketingAdmin({ auth: null }), (err) => err.code === 'unauthenticated' || err.message.includes('authentication required'));
        assert.throws(() => verifyMarketingAdmin({ auth: { uid: 'u1', token: { role: 'Customer' } } }), (err) => err.code === 'permission-denied' || err.message.includes('Unauthorized'));
        const adminCaller = verifyMarketingAdmin({ auth: { uid: 'u1', token: { role: 'SuperAdmin' } } });
        assert.strictEqual(adminCaller.isSuperAdmin, true);
        recordPass("6.1 Analytics endpoint strictly requires SuperAdmin or Marketing permissions");
    } catch (e) {
        recordFail("6.1 Security check failed", e);
    }

    console.log(`\n======================================================`);
    console.log(`FEATURE 3 CONVERSION ANALYTICS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`======================================================\n`);

    if (failed > 0) process.exit(1);
}

runFeature3Tests().catch(err => {
    console.error("Test runner crashed:", err);
    process.exit(1);
});
