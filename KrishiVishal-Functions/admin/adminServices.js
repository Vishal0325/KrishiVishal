const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { AggregateField, FieldPath } = require("firebase-admin/firestore");
const { db, admin } = require("../core/admin");
const { isAdminRequest, isFinanceRequest } = require("../core/utils");

const REGION = 'asia-south1';
const PAGE_SIZE = 500;

async function forEachQueryPage(query, callback) {
    let cursor = null;
    while (true) {
        let pageQuery = query.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
        if (cursor) pageQuery = pageQuery.startAfter(cursor);

        const snapshot = await pageQuery.get();
        if (snapshot.empty) return;
        await callback(snapshot.docs);
        if (snapshot.size < PAGE_SIZE) return;
        cursor = snapshot.docs[snapshot.docs.length - 1];
    }
}

async function aggregateSum(query, fieldName) {
    const result = await query.aggregate({ value: AggregateField.sum(fieldName) }).get();
    return Number(result.data().value || 0);
}

async function aggregateCount(query) {
    const result = await query.count().get();
    return Number(result.data().count || 0);
}

/**
 * addSecureAuditLog: Server-side audit logging for Admin actions
 * Authoritative logging: writes to audit_logs (immutable system audit)
 * and mirrors to admin_logs (mobile/client consumption) with server-verified actor and timestamp.
 */
exports.addSecureAuditLog = onCall({ region: REGION, cors: true }, async (request) => {
    if (!request.auth || !request.auth.token) {
        throw new HttpsError("unauthenticated", "User must be authenticated to create an audit log.");
    }

    const token = request.auth.token;
    const isAuthorized = await isAdminRequest(request);
    if (!isAuthorized) {
        throw new HttpsError("permission-denied", "Unauthorized. Only authorized staff and admins can create audit logs.");
    }

    const { action, module, entityId, details, eventId } = request.data || {};
    if (typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(eventId) ||
        typeof action !== 'string' || !action.trim() || action.length > 100 ||
        typeof module !== 'string' || !module.trim() || module.length > 100 ||
        typeof entityId !== 'string' || !entityId.trim() || entityId.length > 256) {
        throw new HttpsError("invalid-argument", "eventId, action, module, and entityId must be valid bounded strings.");
    }
    if (details !== undefined && details !== null && typeof details !== 'string' && (typeof details !== 'object' || Array.isArray(details))) {
        throw new HttpsError("invalid-argument", "details must be a string or object.");
    }
    let detailsJson;
    try {
        detailsJson = JSON.stringify(details || {});
    } catch (error) {
        throw new HttpsError("invalid-argument", "details must be JSON serializable.");
    }
    if (detailsJson.length > 10000) {
        throw new HttpsError("invalid-argument", "details must not exceed 10 KB.");
    }

    const actorId = request.auth.uid;
    const ipAddress = request.rawRequest ? (request.rawRequest.ip || request.rawRequest.headers?.['x-forwarded-for'] || "Unknown IP") : "Unknown IP";
    const callerRole = token.role || (token.isSuperAdmin ? "SuperAdmin" : (token.isAdmin || token.admin ? "Admin" : "Staff"));

    try {
        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        const auditRef = db.collection("audit_logs").doc(eventId);
        const adminLogRef = db.collection("admin_logs").doc(eventId);
        const auditEntry = {
            action,
            module,
            entityId,
            details: details || {},
            actorId,
            ipAddress,
            timestamp,
            userRole: callerRole,
            origin: 'client_reported',
            requestDetails: details || {}
        };
        const adminLogDetails = typeof details === 'string'
            ? details
            : (details?.details || details?.info || JSON.stringify(details || {}));
        const adminName = details?.adminName || token.name || token.email || callerRole;
        const adminLogEntry = {
            adminId: actorId,
            adminName,
            action,
            targetId: String(entityId),
            targetType: String(module),
            details: adminLogDetails,
            timestamp,
            ipAddress,
            userRole: callerRole,
            origin: 'client_reported',
            requestDetails: details || {}
        };

        await db.runTransaction(async (transaction) => {
            const [auditSnapshot, adminLogSnapshot] = await transaction.getAll(auditRef, adminLogRef);
            for (const existing of [auditSnapshot, adminLogSnapshot]) {
                if (existing.exists) {
                    const prior = existing.data();
                    if ((prior.actorId || prior.adminId) !== actorId ||
                        prior.action !== action ||
                        (prior.module !== undefined && prior.module !== module) ||
                        (prior.targetType !== undefined && prior.targetType !== module) ||
                        (prior.entityId !== undefined && prior.entityId !== entityId) ||
                        (prior.targetId !== undefined && prior.targetId !== entityId) ||
                        JSON.stringify(prior.requestDetails || {}) !== detailsJson) {
                        throw new HttpsError("already-exists", "eventId was already used for a different audit event.");
                    }
                }
            }
            if (!auditSnapshot.exists) transaction.create(auditRef, auditEntry);
            if (!adminLogSnapshot.exists) transaction.create(adminLogRef, adminLogEntry);
        });

        return { success: true, eventId };
    } catch (error) {
        console.error("Error creating audit log:", error);
        if (error instanceof HttpsError) throw error;
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

    const isAuthorized = await isFinanceRequest(request);
    if (!isAuthorized) {
        throw new HttpsError("permission-denied", "Finance role required to view cost data.");
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
    if (role === 'HubManager' && (typeof request.data.hubId !== 'string' || !request.data.hubId.trim())) {
        throw new HttpsError('invalid-argument', 'hubId is required for HubManager accounts.');
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
        } else if (role === 'HubManager') {
            customClaims.hubAccess = 'SINGLE';
            customClaims.hubId = request.data.hubId.trim();
        } else if (['FinanceAdmin', 'DepartmentManager', 'Viewer'].includes(role)) {
            customClaims.hubAccess = request.data.hubAccess || 'ALL';
        } else if (request.data.hubId) {
            customClaims.hubId = String(request.data.hubId).trim();
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

exports.getAdminDashboardStats = onCall({ region: REGION }, async (request) => {
    if (!(await isFinanceRequest(request))) {
        throw new HttpsError('permission-denied', 'Finance role required to view dashboard revenue statistics.');
    }

    try {
        const orders = db.collection('orders');
        const products = db.collection('products').where('isActive', '==', true);
        const [totalOrders, totalRevenue, pendingOrders, totalProducts] = await Promise.all([
            aggregateCount(orders),
            aggregateSum(orders, 'totalAmount'),
            aggregateCount(orders.where('status', '==', 'PLACED')),
            aggregateCount(products)
        ]);

        const statusNames = [
            'PLACED', 'CONFIRMED', 'PROCUREMENT_PENDING', 'ASSIGNED', 'PICKED_UP',
            'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED',
            'READY_FOR_PICKUP', 'PACKING', 'PACKED', 'RIDER_ASSIGNED',
            'RIDER_ACCEPTED', 'IN_TRANSIT', 'DELIVERY_FAILED'
        ];
        const statusCounts = await Promise.all(statusNames.map(async (status) => [
            status,
            await aggregateCount(orders.where('status', '==', status))
        ]));

        const revenueByDay = {};
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        for (let offset = 6; offset >= 0; offset--) {
            const dayStart = new Date(today);
            dayStart.setUTCDate(today.getUTCDate() - offset);
            const nextDay = new Date(dayStart);
            nextDay.setUTCDate(dayStart.getUTCDate() + 1);
            const dayLabel = `${String(dayStart.getUTCDate()).padStart(2, '0')}/${String(dayStart.getUTCMonth() + 1).padStart(2, '0')}`;
            const dayQuery = orders.where('createdAt', '>=', dayStart).where('createdAt', '<', nextDay);
            revenueByDay[dayLabel] = await aggregateSum(dayQuery, 'totalAmount');
        }

        const topCategories = {};
        await forEachQueryPage(products, async (docs) => {
            for (const doc of docs) {
                const category = doc.data().category;
                if (typeof category === 'string' && category.trim()) {
                    topCategories[category] = (topCategories[category] || 0) + 1;
                }
            }
        });

        const topCategoryEntries = Object.entries(topCategories)
            .sort((left, right) => right[1] - left[1])
            .slice(0, 10);

        return {
            totalOrders,
            totalProducts,
            totalRevenue,
            pendingOrders,
            revenueByDay,
            ordersByStatus: Object.fromEntries(statusCounts),
            topCategories: Object.fromEntries(topCategoryEntries)
        };
    } catch (error) {
        console.error('Error computing admin dashboard statistics:', error);
        throw new HttpsError('internal', 'Unable to calculate admin dashboard statistics.');
    }
});

/**
 * getFinanceSummary: Computes finance dashboard metrics
 */
exports.getFinanceSummary = onCall({ region: REGION, cors: true }, async (request) => {
    const isAuthorized = await isFinanceRequest(request);
    if (!isAuthorized) {
        throw new HttpsError('permission-denied', 'Unauthorized. Only Authorized Admins can view finance summary.');
    }

    const { startDate, endDate, warehouseId } = request.data || {};
    const startAt = startDate ? new Date(startDate) : null;
    const endAt = endDate ? new Date(endDate) : null;
    if ((startDate && Number.isNaN(startAt.getTime())) ||
        (endDate && Number.isNaN(endAt.getTime())) ||
        (startAt && endAt && startAt > endAt) ||
        (warehouseId !== undefined && warehouseId !== null && typeof warehouseId !== 'string')) {
        throw new HttpsError('invalid-argument', 'Date range or warehouseId is invalid.');
    }

    try {
        let q = db.collection("orders");
        if (startAt) q = q.where("createdAt", ">=", startAt);
        if (endAt) q = q.where("createdAt", "<=", endAt);

        let totalRevenue = 0;
        let grossProfit = 0;
        let gstCollected = 0;
        let orderCount = 0;
        let refunds = 0;
        let returnsCount = 0;
        const matchedOrderIds = new Set();
        const isAllHubs = !warehouseId || warehouseId.toUpperCase() === 'ALL';

        await forEachQueryPage(q, async (docs) => {
            for (const doc of docs) {
                const o = doc.data();
                const orderWh = (o.fulfillmentWarehouseId || o.warehouseId || o.hubId || o.hubCode || '').toString().trim().toUpperCase();
                const targetWh = (warehouseId || '').toString().trim().toUpperCase();
                const matchesHub = isAllHubs || (orderWh && (orderWh === targetWh));
                if (!matchesHub) continue;

                matchedOrderIds.add(doc.id);
                if (o.status !== 'CANCELLED') {
                    const amt = Number(o.totalAmount || 0);
                    totalRevenue += amt;
                    const profitVal = (o.grossProfit !== undefined && o.grossProfit !== null && !isNaN(o.grossProfit))
                        ? Number(o.grossProfit)
                        : 0;
                    grossProfit += profitVal;
                    const cgst = (o.cgst !== undefined && o.cgst !== null && !isNaN(o.cgst)) ? Number(o.cgst) : 0;
                    const sgst = (o.sgst !== undefined && o.sgst !== null && !isNaN(o.sgst)) ? Number(o.sgst) : 0;
                    const igst = (o.igst !== undefined && o.igst !== null && !isNaN(o.igst)) ? Number(o.igst) : 0;
                    gstCollected += cgst + sgst + igst;
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
        if (startAt) ledgerQ = ledgerQ.where("timestamp", ">=", startAt);
        if (endAt) ledgerQ = ledgerQ.where("timestamp", "<=", endAt);

        try {
            await forEachQueryPage(ledgerQ, async (docs) => {
                for (const doc of docs) {
                    const d = doc.data();
                    const docWh = (d.warehouseId || d.hubId || d.metadata?.warehouseId || d.metadata?.hubId || '').toString().trim().toUpperCase();
                    const targetWh = (warehouseId || '').toString().trim().toUpperCase();
                    const matchesHub = isAllHubs || (docWh && docWh === targetWh) || (d.referenceId && matchedOrderIds.has(d.referenceId));
                    if (matchesHub) totalExpenses += Number(d.amount || 0);
                }
            });
        } catch (error) {
            if (!(error.code === 'failed-precondition' || error.code === 9)) throw error;
            let expQ = db.collection("expenses");
            if (startAt) expQ = expQ.where("createdAt", ">=", startAt);
            if (endAt) expQ = expQ.where("createdAt", "<=", endAt);

            await forEachQueryPage(expQ, async (docs) => {
                for (const doc of docs) {
                    const d = doc.data();
                    const docWh = (d.warehouseId || d.hubId || d.formData?.warehouseId || '').toString().trim().toUpperCase();
                    const targetWh = (warehouseId || '').toString().trim().toUpperCase();
                    const matchesHub = isAllHubs || (docWh && docWh === targetWh);
                    if (!matchesHub) continue;
                    const expAmt = (d.amount !== undefined && d.amount !== null && !isNaN(d.amount))
                        ? Number(d.amount)
                        : ((d.totalAmountMinor !== undefined && d.totalAmountMinor !== null && !isNaN(d.totalAmountMinor))
                            ? Number(d.totalAmountMinor) / 100
                            : (Number(d.totalAmount || d.subtotal || 0)));
                    totalExpenses += isNaN(expAmt) ? 0 : expAmt;
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
    const isAuthorized = await isFinanceRequest(request);
    if (!isAuthorized) {
        throw new HttpsError('permission-denied', 'Unauthorized. Only Finance Admin or SuperAdmin can save expenses.');
    }

    const { id, formData } = request.data || {};
    if (id !== undefined && (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id))) {
        throw new HttpsError('invalid-argument', 'Expense id is invalid.');
    }
    if (!formData || typeof formData.categoryId !== 'string' || !formData.categoryId.trim() ||
        formData.subtotal === undefined || formData.subtotal === null) {
        throw new HttpsError('invalid-argument', 'Missing required fields.');
    }
    if (![undefined, null, '', 'NONE', 'GST', 'IGST'].includes(formData.taxType)) {
        throw new HttpsError('invalid-argument', 'Tax type must be NONE, GST, or IGST.');
    }

    const sub = Number(formData.subtotal);
    const disc = Number(formData.discount || 0);
    const other = Number(formData.otherCharges || 0);
    const off = Number(formData.roundOff || 0);

    // Validate numeric values and reject negative amounts / NaN
    if (!Number.isFinite(sub) || sub < 0) {
        throw new HttpsError('invalid-argument', 'Subtotal must be a non-negative number.');
    }
    if (!Number.isFinite(disc) || disc < 0) {
        throw new HttpsError('invalid-argument', 'Discount cannot be negative.');
    }
    if (disc > sub) {
        throw new HttpsError('invalid-argument', `Discount (₹${disc}) cannot exceed subtotal (₹${sub}).`);
    }
    if (!Number.isFinite(other) || other < 0) {
        throw new HttpsError('invalid-argument', 'Other charges cannot be negative.');
    }
    if (!Number.isFinite(off) || Math.abs(off) > 10) {
        throw new HttpsError('invalid-argument', 'Round off must be between -₹10 and +₹10.');
    }

    const taxable = Math.max(0, sub - disc);

    let cgst = 0; let sgst = 0; let igst = 0;
    if (formData.taxType === 'GST') {
        const cgstRate = Number(formData.cgstRate || 0);
        const sgstRate = Number(formData.sgstRate || 0);
        if (!Number.isFinite(cgstRate) || cgstRate < 0) {
            throw new HttpsError('invalid-argument', 'CGST rate must be a non-negative number.');
        }
        if (!Number.isFinite(sgstRate) || sgstRate < 0) {
            throw new HttpsError('invalid-argument', 'SGST rate must be a non-negative number.');
        }
        const combinedGst = cgstRate + sgstRate;
        if (combinedGst > 28) {
            throw new HttpsError('invalid-argument', `Combined GST rate (${combinedGst}%) cannot exceed statutory maximum of 28%.`);
        }
        cgst = (taxable * cgstRate) / 100;
        sgst = (taxable * sgstRate) / 100;
    } else if (formData.taxType === 'IGST') {
        const igstRate = Number(formData.igstRate || 0);
        if (!Number.isFinite(igstRate) || igstRate < 0 || igstRate > 28) {
            throw new HttpsError('invalid-argument', 'IGST rate must be between 0% and 28%.');
        }
        igst = (taxable * igstRate) / 100;
    }

    const total = taxable + cgst + sgst + igst + other + off;
    if (!Number.isFinite(total) || total < 0) {
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
        amount: Math.round(total * 100) / 100,
        totalAmount: Math.round(total * 100) / 100,
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
