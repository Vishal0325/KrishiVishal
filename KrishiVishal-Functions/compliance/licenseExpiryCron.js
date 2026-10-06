const { onSchedule } = require("firebase-functions/v2/scheduler");
const { db, admin } = require("../core/admin");

const REGION = 'asia-south1';

/**
 * Core business logic for auditing active agricultural and statutory licenses.
 * Can be called with a custom reference date (now) for deterministic unit testing.
 *
 * @param {Date} [referenceDate=new Date()]
 * @param {string[]} [collectionsToScan=['agri_licenses', 'statutory_licenses']]
 */
async function checkLicenseExpiries(referenceDate = new Date(), collectionsToScan = ['agri_licenses', 'statutory_licenses']) {
    const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
    const results = {
        scanned: 0,
        expired: 0,
        warningAlertsCreated: 0,
        dedupedWarnings: 0,
        errors: []
    };

    const sevenDaysAgoMs = now.getTime() - (7 * 24 * 60 * 60 * 1000);

    for (const collName of collectionsToScan) {
        try {
            const snap = await db.collection(collName).where("status", "==", "ACTIVE").get();
            if (snap.empty) continue;

            for (const doc of snap.docs) {
                results.scanned++;
                const license = doc.data();
                const expiryDateRaw = license.expiryDate;
                if (!expiryDateRaw) continue;

                let expiryDate;
                if (typeof expiryDateRaw.toDate === 'function') {
                    expiryDate = expiryDateRaw.toDate();
                } else if (expiryDateRaw._seconds !== undefined) {
                    expiryDate = new Date(expiryDateRaw._seconds * 1000);
                } else {
                    expiryDate = new Date(expiryDateRaw);
                }

                if (isNaN(expiryDate.getTime())) {
                    console.warn(`[License Cron] Invalid expiryDate for license ${doc.id} in ${collName}`);
                    continue;
                }

                // Calculate days remaining (ceiling of difference in full 24h days)
                const diffMs = expiryDate.getTime() - now.getTime();
                const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                const licenseType = license.licenseType || license.type || "Statutory Agri License";
                const hubId = license.hubId || "ALL_HUBS";
                const hubName = license.hubName || "Unknown Hub";

                // Case A: Expired (daysRemaining <= 0)
                if (daysRemaining <= 0) {
                    await doc.ref.set({
                        status: "EXPIRED",
                        expiredAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });

                    await db.collection("admin_alerts").add({
                        type: "LICENSE_EXPIRED",
                        licenseId: doc.id,
                        collection: collName,
                        licenseType: licenseType,
                        hubId: hubId,
                        hubName: hubName,
                        severity: "CRITICAL",
                        message: `Statutory license ${licenseType} for hub ${hubName} has expired. Trading and dispatch must be halted immediately.`,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    results.expired++;
                }
                // Case B: Warning (daysRemaining <= 30)
                else if (daysRemaining <= 30) {
                    const threshold = daysRemaining <= 15 ? "FIFTEEN_DAYS" : "THIRTY_DAYS";

                    // Deduplication: check if alert for this licenseId and threshold was created in the last 7 days
                    const recentAlertsSnap = await db.collection("admin_alerts")
                        .where("licenseId", "==", doc.id)
                        .get();

                    let alreadyAlerted = false;
                    for (const alertDoc of recentAlertsSnap.docs) {
                        const alertData = alertDoc.data();
                        if (alertData.threshold === threshold && alertData.type === "LICENSE_EXPIRING_SOON") {
                            let alertCreatedAtMs = 0;
                            if (typeof alertData.createdAt?.toMillis === 'function') {
                                alertCreatedAtMs = alertData.createdAt.toMillis();
                            } else if (typeof alertData.createdAt?.toDate === 'function') {
                                alertCreatedAtMs = alertData.createdAt.toDate().getTime();
                            } else if (alertData.createdAt instanceof Date) {
                                alertCreatedAtMs = alertData.createdAt.getTime();
                            } else if (typeof alertData.createdAt === 'number') {
                                alertCreatedAtMs = alertData.createdAt;
                            } else if (typeof alertData.createdAt === 'string') {
                                alertCreatedAtMs = new Date(alertData.createdAt).getTime();
                            } else {
                                // Fallback for serverTimestamp sentinel objects in emulator/unit tests
                                alertCreatedAtMs = Date.now();
                            }

                            if (!isNaN(alertCreatedAtMs) && alertCreatedAtMs >= sevenDaysAgoMs) {
                                alreadyAlerted = true;
                                break;
                            }
                        }
                    }

                    if (alreadyAlerted) {
                        results.dedupedWarnings++;
                    } else {
                        await db.collection("admin_alerts").add({
                            type: "LICENSE_EXPIRING_SOON",
                            licenseId: doc.id,
                            collection: collName,
                            licenseType: licenseType,
                            hubId: hubId,
                            hubName: hubName,
                            daysRemaining: daysRemaining,
                            threshold: threshold,
                            severity: "HIGH",
                            message: `Statutory license ${licenseType} for hub ${hubName} will expire in ${daysRemaining} days. Renewal required immediately.`,
                            recipientRoles: ["ComplianceOfficer", "SuperAdmin"],
                            notificationMetadata: {
                                push: true,
                                email: true,
                                topic: "compliance_alerts"
                            },
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        results.warningAlertsCreated++;
                    }
                }
            }
        } catch (err) {
            console.error(`[License Cron] Error scanning collection ${collName}:`, err);
            results.errors.push({ collection: collName, error: err.message });
        }
    }

    return results;
}

/**
 * Cloud Function Scheduled Trigger: licenseExpiryCron
 * Runs daily at 01:00 AM IST (Asia/Kolkata)
 */
const licenseExpiryCron = onSchedule({
    schedule: "0 1 * * *",
    timeZone: "Asia/Kolkata",
    region: REGION
}, async (event) => {
    console.log("[License Cron] Starting daily statutory license expiry audit...");
    const summary = await checkLicenseExpiries();
    console.log("[License Cron] Audit finished with summary:", summary);
    return summary;
});

module.exports = {
    licenseExpiryCron,
    checkLicenseExpiries
};
