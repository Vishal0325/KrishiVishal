const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { isAdminRequest } = require("../core/utils");

const REGION = 'asia-south1';

/**
 * addSecureAuditLog: Server-side audit logging for Admin actions
 */
exports.addSecureAuditLog = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated to create an audit log.");
    }

    const { action, module, entityId, details } = request.data || {};
    if (!action || !module || !entityId) {
        throw new HttpsError("invalid-argument", "Missing required fields (action, module, entityId).");
    }

    const actorId = request.auth.uid;
    const ipAddress = request.rawRequest ? (request.rawRequest.ip || request.rawRequest.headers?.['x-forwarded-for'] || "Unknown IP") : "Unknown IP";

    try {
        await db.collection("audit_logs").add({
            action,
            module,
            entityId,
            details: details || {},
            actorId,
            ipAddress,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            userRole: request.auth.token?.role || (request.auth.token?.admin ? "SuperAdmin" : "Admin"),
        });
        return { success: true };
    } catch (error) {
        console.error("Error creating audit log:", error);
        throw new HttpsError("internal", error.message);
    }
});

/**
 * getSecureProductCost: Securely fetches product cost price for SuperAdmin
 */
exports.getSecureProductCost = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    const isAuthorized = await isAdminRequest(request);
    if (!isAuthorized) {
        throw new HttpsError("permission-denied", "Only Authorized Admins can view cost data.");
    }

    const { productId } = request.data || {};
    if (!productId) {
        throw new HttpsError("invalid-argument", "Missing productId.");
    }

    try {
        const costSnap = await db.collection("product_costs").doc(productId).get();
        if (costSnap.exists) {
            return costSnap.data();
        }
        return { costPrice: 0, variantsCost: {} };
    } catch (error) {
        console.error("Error fetching product cost:", error);
        throw new HttpsError("internal", error.message);
    }
});

/**
 * searchUsers: Server-side search to prevent leaking full user table
 */
exports.searchUsers = onCall({ region: REGION, cors: true }, async (request) => {
    const isAuthorized = await isAdminRequest(request);
    if (!isAuthorized) {
        throw new HttpsError("permission-denied", "Unauthorized.");
    }

    const { query: searchQuery, type } = request.data || {};
    if (!searchQuery || searchQuery.length < 3) return { users: [] };

    try {
        let q;
        if (/^\d+$/.test(searchQuery)) {
            q = db.collection('users').where('phone', '==', searchQuery).limit(10);
        } else {
            q = db.collection('users')
                .where('name', '>=', searchQuery)
                .where('name', '<=', searchQuery + '\uf8ff')
                .limit(10);
        }

        if (type === 'RIDER') {
            q = q.where('role', '==', 'Rider');
        } else if (type === 'STAFF') {
            q = q.where('isAdmin', '==', true);
        } else if (type === 'CUSTOMER') {
            q = q.where('isAdmin', '==', false);
        }

        const snap = await q.get();
        const users = snap.docs.map(d => {
            const u = d.data();
            return {
                id: d.id,
                name: u.name,
                phone: u.phone,
                email: u.email,
                district: u.district,
                state: u.state
            };
        });

        return { users };
    } catch (error) {
        console.error("Error searching users:", error);
        throw new HttpsError("internal", "Search failed");
    }
});

/**
 * createStaffMember: Admin creates internal staff with custom claims
 */
exports.createStaffMember = onCall({ region: REGION, cors: true }, async (request) => {
    const isAuthorized = await isAdminRequest(request);
    if (!isAuthorized) {
        throw new HttpsError('permission-denied', 'Only admins can create staff members.');
    }

    const { email, password, name, role } = request.data || {};
    if (!email || !password || !name || !role) {
        throw new HttpsError('invalid-argument', 'Missing required fields (email, password, name, role).');
    }

    try {
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name,
        });

        await admin.auth().setCustomUserClaims(userRecord.uid, {
            role: role,
            isAdmin: true,
            admin: true,
            isActive: true
        });

        await db.collection('users').doc(userRecord.uid).set({
            uid: userRecord.uid,
            email: email,
            name: name,
            role: role,
            isAdmin: true,
            admin: true,
            isActive: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { success: true, uid: userRecord.uid };
    } catch (error) {
        console.error("Error creating staff member:", error);
        throw new HttpsError("internal", error.message);
    }
});

/**
 * generateWorkforceId: Atomic ID generator for workforce
 */
exports.generateWorkforceId = onCall({ region: REGION, cors: true }, async (request) => {
    const isAuthorized = await isAdminRequest(request);
    if (!isAuthorized) {
        throw new HttpsError('permission-denied', 'Unauthorized.');
    }

    const { type = 'EMP' } = request.data || {};
    const counterRef = db.collection('system_counters').doc(`workforce_${type}`);

    try {
        const result = await db.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let currentSeq = 0;
            if (counterDoc.exists) {
                currentSeq = counterDoc.data().seq || 0;
            }
            const nextSeq = currentSeq + 1;
            transaction.set(counterRef, { seq: nextSeq }, { merge: true });

            const formattedSeq = String(nextSeq).padStart(6, '0');
            return `KV-${type}-${formattedSeq}`;
        });

        return { workforceId: result };
    } catch (error) {
        console.error("Error generating workforce ID:", error);
        throw new HttpsError('internal', 'ID generation failed');
    }
});

/**
 * getFinanceSummary: Computes finance dashboard metrics
 */
exports.getFinanceSummary = onCall({ region: REGION, cors: true }, async (request) => {
    const isAuthorized = await isAdminRequest(request);
    if (!isAuthorized) {
        throw new HttpsError('permission-denied', 'Unauthorized. Only Authorized Admins can view finance summary.');
    }

    const { startDate, endDate } = request.data || {};

    try {
        let q = db.collection("orders");
        if (startDate) q = q.where("createdAt", ">=", new Date(startDate));
        if (endDate) q = q.where("createdAt", "<=", new Date(endDate));

        const ordersSnap = await q.get();

        let totalRevenue = 0;
        let grossProfit = 0;
        let gstCollected = 0;
        let orderCount = 0;

        ordersSnap.forEach(doc => {
            const o = doc.data();
            if (o.status !== 'CANCELLED') {
                totalRevenue += Number(o.totalAmount || 0);
                grossProfit += Number(o.grossProfit || 0);
                gstCollected += (Number(o.cgst || 0) + Number(o.sgst || 0) + Number(o.igst || 0));
                orderCount++;
            }
        });

        return {
            totalRevenue,
            grossProfit,
            gstCollected,
            orderCount
        };
    } catch (error) {
        console.error("Error computing finance summary:", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * saveExpense: Validated expense creation
 */
exports.saveExpense = onCall({ region: REGION, cors: true }, async (request) => {
    const isAuthorized = await isAdminRequest(request);
    if (!isAuthorized) {
        throw new HttpsError('permission-denied', 'Unauthorized. Only Finance Admin or SuperAdmin can save expenses.');
    }

    const { id, formData } = request.data || {};
    if (!formData || !formData.categoryId || !formData.subtotal) {
        throw new HttpsError('invalid-argument', 'Missing required fields.');
    }

    const sub = parseFloat(formData.subtotal) || 0;
    const disc = parseFloat(formData.discount) || 0;
    const taxable = Math.max(0, sub - disc);

    let cgst = 0; let sgst = 0; let igst = 0;
    if (formData.taxType === 'GST') {
        cgst = (taxable * (parseFloat(formData.cgstRate) || 0)) / 100;
        sgst = (taxable * (parseFloat(formData.sgstRate) || 0)) / 100;
    } else if (formData.taxType === 'IGST') {
        igst = (taxable * (parseFloat(formData.igstRate) || 0)) / 100;
    }

    const other = parseFloat(formData.otherCharges) || 0;
    const off = parseFloat(formData.roundOff) || 0;
    const total = taxable + cgst + sgst + igst + other + off;

    const payload = {
        ...formData,
        subtotalMinor: Math.round(sub * 100),
        discountMinor: Math.round(disc * 100),
        taxableAmountMinor: Math.round(taxable * 100),
        cgstMinor: Math.round(cgst * 100),
        sgstMinor: Math.round(sgst * 100),
        igstMinor: Math.round(igst * 100),
        otherChargesMinor: Math.round(other * 100),
        roundOffMinor: Math.round(off * 100),
        totalAmountMinor: Math.round(total * 100),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid
    };

    try {
        if (id) {
            await db.collection("expenses").doc(id).update(payload);
            return { success: true, id };
        } else {
            payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
            payload.createdBy = request.auth.uid;
            const docRef = await db.collection("expenses").add(payload);
            return { success: true, id: docRef.id };
        }
    } catch (error) {
        console.error("Error saving expense:", error);
        throw new HttpsError('internal', error.message);
    }
});
