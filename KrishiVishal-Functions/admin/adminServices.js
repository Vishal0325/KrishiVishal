const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { isAdminRequest } = require("../core/utils");

const REGION = 'asia-south1';

/**
 * addSecureAuditLog: Server-side audit logging for Admin actions
 */
exports.addSecureAuditLog = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth || !request.auth.token) {
        throw new HttpsError("unauthenticated", "User must be authenticated to create an audit log.");
    }

    const token = request.auth.token;
    const isAuthorized = (await isAdminRequest(request)) || token.isStaff === true;
    if (!isAuthorized) {
        throw new HttpsError("permission-denied", "Unauthorized. Only authorized staff and admins can create audit logs.");
    }

    const { action, module, entityId, details } = request.data || {};
    if (!action || !module || !entityId) {
        throw new HttpsError("invalid-argument", "Missing required fields (action, module, entityId).");
    }

    const actorId = request.auth.uid;
    const ipAddress = request.rawRequest ? (request.rawRequest.ip || request.rawRequest.headers?.['x-forwarded-for'] || "Unknown IP") : "Unknown IP";

    const callerRole = token.role || (token.isSuperAdmin ? "SuperAdmin" : (token.isAdmin || token.admin ? "Admin" : "Staff"));

    try {
        await db.collection("audit_logs").add({
            action,
            module,
            entityId,
            details: details || {},
            actorId,
            ipAddress,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            userRole: callerRole,
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
    if (!request.auth || !request.auth.token) {
        throw new HttpsError('unauthenticated', 'User must be authenticated to create staff members.');
    }

    const callerToken = request.auth.token;
    const callerRole = callerToken.role;
    const isCallerSuperAdmin = callerRole === 'SuperAdmin' || callerRole === 'SUPER_ADMIN' || callerToken.isSuperAdmin === true;
    const isCallerAdmin = isCallerSuperAdmin || callerRole === 'Admin' || callerRole === 'ADMIN' || callerToken.admin === true || callerToken.isAdmin === true;

    // Strict role hierarchy: Departmental managers (CatalogManager, OrderManager, FinanceAdmin, etc.) are strictly blocked
    if (!isCallerAdmin) {
        throw new HttpsError('permission-denied', 'Only SuperAdmin or Admin can create staff members.');
    }

    const { email, password, name, role } = request.data || {};
    if (!email || !password || !name || !role) {
        throw new HttpsError('invalid-argument', 'Missing required fields (email, password, name, role).');
    }

    // Strict whitelist of permitted staff roles
    const ALLOWED_STAFF_ROLES = [
        'SuperAdmin', 'Admin', 'CatalogManager', 'OrderManager',
        'FinanceAdmin', 'DepartmentManager', 'HubManager', 'Viewer'
    ];
    if (!ALLOWED_STAFF_ROLES.includes(role)) {
        throw new HttpsError('invalid-argument', `Invalid role '${role}'. Allowed roles: ${ALLOWED_STAFF_ROLES.join(', ')}`);
    }

    // Role Hierarchy: ONLY SuperAdmin can create new SuperAdmin or Admin accounts
    const privilegedRoles = ['SuperAdmin', 'SUPER_ADMIN', 'Admin', 'ADMIN'];
    if (privilegedRoles.includes(role) && !isCallerSuperAdmin) {
        throw new HttpsError('permission-denied', 'Only SuperAdmin can create SuperAdmin or Admin accounts.');
    }

    try {
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name,
        });

        // Role-to-Claims Matrix (Zero Blanket Admin Claims)
        const isFullAdmin = privilegedRoles.includes(role);
        const isSuper = role === 'SuperAdmin' || role === 'SUPER_ADMIN';

        const customClaims = {
            role: role,
            isAdmin: isFullAdmin,       // TRUE sirf SuperAdmin / Admin ke liye
            admin: isFullAdmin,         // Legacy backward-compatibility
            isSuperAdmin: isSuper,
            isStaff: true,              // Portal entry gatekeeper
            isActive: true,
        };

        if (isSuper) {
            customClaims.hubAccess = 'ALL';
        } else if (['FinanceAdmin', 'DepartmentManager', 'Viewer'].includes(role)) {
            customClaims.hubAccess = request.data.hubAccess || 'ALL';
        } else if (request.data.hubId) {
            customClaims.hubId = request.data.hubId;
        }

        await admin.auth().setCustomUserClaims(userRecord.uid, customClaims);

        await db.collection('users').doc(userRecord.uid).set({
            uid: userRecord.uid,
            email: email,
            name: name,
            role: role,
            isAdmin: isFullAdmin,       // Firestore doc matches Auth claim
            isSuperAdmin: isSuper,
            isStaff: true,
            isActive: true,
            hubAccess: customClaims.hubAccess || null,
            hubId: customClaims.hubId || null,
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

    const { startDate, endDate, warehouseId } = request.data || {};

    try {
        let q = db.collection("orders");
        if (startDate) q = q.where("createdAt", ">=", new Date(startDate));
        if (endDate) q = q.where("createdAt", "<=", new Date(endDate));

        const ordersSnap = await q.get();

        let totalRevenue = 0;
        let grossProfit = 0;
        let gstCollected = 0;
        let orderCount = 0;
        let refunds = 0;
        let returnsCount = 0;
        const matchedOrderIds = new Set();
        const isAllHubs = !warehouseId || warehouseId.toUpperCase() === 'ALL';

        ordersSnap.forEach(doc => {
            const o = doc.data();
            const orderWh = (o.fulfillmentWarehouseId || o.warehouseId || o.hubId || o.hubCode || '').toString().trim().toUpperCase();
            const targetWh = (warehouseId || '').toString().trim().toUpperCase();
            const matchesHub = isAllHubs || (orderWh && (orderWh === targetWh));

            if (matchesHub) {
                matchedOrderIds.add(doc.id);
                if (o.status !== 'CANCELLED') {
                    const amt = Number(o.totalAmount || 0);
                    totalRevenue += amt;

                    // Gross profit: Use explicitly recorded profit; do NOT fake 18% on missing or 0 profit
                    const profitVal = (o.grossProfit !== undefined && o.grossProfit !== null && !isNaN(o.grossProfit))
                        ? Number(o.grossProfit)
                        : 0;
                    grossProfit += profitVal;

                    // GST collected: Sum actual CGST + SGST + IGST; do NOT fake 5% on 0% exempt farm produce
                    const cgst = (o.cgst !== undefined && o.cgst !== null && !isNaN(o.cgst)) ? Number(o.cgst) : 0;
                    const sgst = (o.sgst !== undefined && o.sgst !== null && !isNaN(o.sgst)) ? Number(o.sgst) : 0;
                    const igst = (o.igst !== undefined && o.igst !== null && !isNaN(o.igst)) ? Number(o.igst) : 0;
                    gstCollected += (cgst + sgst + igst);

                    orderCount++;
                } else {
                    refunds += Number(o.totalAmount || 0);
                    returnsCount++;
                }
            }
        });

        // Compute expenses from ledger
        let totalExpenses = 0;
        let ledgerQ = db.collection("ledger").where("type", "==", "DEBIT");
        if (startDate) ledgerQ = ledgerQ.where("timestamp", ">=", new Date(startDate));
        if (endDate) ledgerQ = ledgerQ.where("timestamp", "<=", new Date(endDate));

        try {
            const ledgerSnap = await ledgerQ.get();
            ledgerSnap.forEach(doc => {
                const d = doc.data();
                const docWh = (d.warehouseId || d.hubId || d.metadata?.warehouseId || d.metadata?.hubId || '').toString().trim().toUpperCase();
                const targetWh = (warehouseId || '').toString().trim().toUpperCase();
                const matchesHub = isAllHubs || (docWh && docWh === targetWh) || (d.referenceId && matchedOrderIds.has(d.referenceId));
                if (matchesHub) {
                    totalExpenses += Number(d.amount || 0);
                }
            });
        } catch (e) {
            // If composite index is pending, fallback to reading expenses collection
            const expSnap = await db.collection("expenses").limit(100).get();
            expSnap.forEach(doc => {
                const d = doc.data();
                const docWh = (d.warehouseId || d.hubId || '').toString().trim().toUpperCase();
                const targetWh = (warehouseId || '').toString().trim().toUpperCase();
                const matchesHub = isAllHubs || (docWh && docWh === targetWh);
                if (matchesHub) {
                    totalExpenses += Number(d.amount || 0);
                }
            });
        }

        const summaryData = {
            totalRevenue: Math.round(totalRevenue),
            grossProfit: Math.round(grossProfit),
            netProfit: Math.round(grossProfit - totalExpenses),
            expenses: Math.round(totalExpenses),
            gstCollected: Math.round(gstCollected),
            orders: orderCount,
            refunds: Math.round(refunds),
            returnsCount: returnsCount,
            margin: totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(2) : '0.00',
            warehouseId: warehouseId || 'ALL',
            period: {
                startDate: startDate || 'ALL',
                endDate: endDate || 'ALL'
            },
            generatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        return summaryData;
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
    if (!formData || !formData.categoryId || formData.subtotal === undefined || formData.subtotal === null) {
        throw new HttpsError('invalid-argument', 'Missing required fields.');
    }

    const sub = parseFloat(formData.subtotal);
    const disc = parseFloat(formData.discount || 0);
    const other = parseFloat(formData.otherCharges || 0);
    const off = parseFloat(formData.roundOff || 0);

    // Validate numeric values and reject negative amounts / NaN
    if (isNaN(sub) || sub < 0) {
        throw new HttpsError('invalid-argument', 'Subtotal must be a non-negative number.');
    }
    if (isNaN(disc) || disc < 0) {
        throw new HttpsError('invalid-argument', 'Discount cannot be negative.');
    }
    if (isNaN(other) || other < 0) {
        throw new HttpsError('invalid-argument', 'Other charges cannot be negative.');
    }
    if (isNaN(off)) {
        throw new HttpsError('invalid-argument', 'Round off must be a valid number.');
    }

    const taxable = Math.max(0, sub - disc);

    let cgst = 0; let sgst = 0; let igst = 0;
    if (formData.taxType === 'GST') {
        const cgstRate = parseFloat(formData.cgstRate || 0);
        const sgstRate = parseFloat(formData.sgstRate || 0);
        if (isNaN(cgstRate) || cgstRate < 0 || cgstRate > 28) {
            throw new HttpsError('invalid-argument', 'Invalid CGST rate. Rate must be between 0 and 28%.');
        }
        if (isNaN(sgstRate) || sgstRate < 0 || sgstRate > 28) {
            throw new HttpsError('invalid-argument', 'Invalid SGST rate. Rate must be between 0 and 28%.');
        }
        cgst = (taxable * cgstRate) / 100;
        sgst = (taxable * sgstRate) / 100;
    } else if (formData.taxType === 'IGST') {
        const igstRate = parseFloat(formData.igstRate || 0);
        if (isNaN(igstRate) || igstRate < 0 || igstRate > 28) {
            throw new HttpsError('invalid-argument', 'Invalid IGST rate. Rate must be between 0 and 28%.');
        }
        igst = (taxable * igstRate) / 100;
    }

    const total = taxable + cgst + sgst + igst + other + off;
    if (isNaN(total) || total < 0) {
        throw new HttpsError('invalid-argument', 'Calculated total expense amount is invalid.');
    }

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
