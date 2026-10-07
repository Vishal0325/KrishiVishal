/**
 * KrishiVishal Maker-Checker Workflow & Dual-Authorization Engine
 * Implements Internal Financial Controls (IFC) & Segregation of Duties (SoD) under Companies Act 2013:
 * - Four-Eyes Principle: Maker cannot be Checker
 * - High-Risk Operations:
 *    A) SUPPLIER_BANK_UPDATE: Vendor bank details changes pending CFO/Director approval
 *    B) HIGH_VALUE_PAYMENT: Supplier payments > ₹50,000 executed only upon checker authorization
 * 
 * Part of Sprint 10.
 */

const { db, admin } = require("../core/admin");
const { recordSupplierPayment } = require("./supplierLedger");

const ALLOWED_CHECKER_ROLES = ["SuperAdmin", "CFO", "Director"];
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * Submits an operational request for dual-authorization.
 * 
 * @param {object} param0
 * @param {"SUPPLIER_BANK_UPDATE" | "HIGH_VALUE_PAYMENT"} param0.requestType
 * @param {"SUPPLIERS" | "SUPPLIER_INVOICES"} param0.entityType
 * @param {string} param0.entityId
 * @param {object} param0.payload
 * @param {object} param0.maker { uid, email, role }
 * @returns {Promise<object>}
 */
async function submitApprovalRequest({ requestType, entityType, entityId, payload, maker }) {
    if (!requestType || !["SUPPLIER_BANK_UPDATE", "HIGH_VALUE_PAYMENT"].includes(requestType)) {
        throw new Error(`INVALID_REQUEST_TYPE: Supported types are SUPPLIER_BANK_UPDATE, HIGH_VALUE_PAYMENT`);
    }
    if (!entityType || !entityId) {
        throw new Error("MISSING_ENTITY_TARGET: entityType and entityId are required.");
    }
    if (!payload || typeof payload !== "object") {
        throw new Error("MISSING_PAYLOAD: Proposed operational payload is required.");
    }
    if (!maker || !maker.uid) {
        throw new Error("MISSING_MAKER_IDENTITY: maker { uid, email, role } is required for audit trail.");
    }

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const requestId = `REQ_${requestType === "SUPPLIER_BANK_UPDATE" ? "BANK" : "PAY"}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Special validation for Supplier Bank Update
    if (requestType === "SUPPLIER_BANK_UPDATE") {
        const { ifsc, accountNumber, beneficiaryName } = payload;
        if (!accountNumber || String(accountNumber).trim().length < 6) {
            throw new Error("INVALID_ACCOUNT_NUMBER: A valid bank account number is required.");
        }
        if (!ifsc || !IFSC_REGEX.test(String(ifsc).toUpperCase())) {
            throw new Error(`INVALID_IFSC_CODE: IFSC code '${ifsc}' does not conform to RBI standard (4 letters, 0, 6 alphanumeric).`);
        }
        if (!beneficiaryName) {
            throw new Error("MISSING_BENEFICIARY_NAME: Bank account beneficiary name is mandatory.");
        }

        // Flag the supplier record with pending status without altering the live bank details
        const supplierRef = db.collection("suppliers").doc(entityId);
        const supplierDoc = await supplierRef.get();
        if (supplierDoc.exists) {
            await supplierRef.update({
                bankDetailsStatus: "PENDING_APPROVAL",
                pendingBankRequestId: requestId,
                updatedAt: timestamp
            });
        }
    }

    // Special validation for High-Value Payment
    if (requestType === "HIGH_VALUE_PAYMENT") {
        const { amount, invoiceId } = payload;
        if (!amount || Number(amount) <= 0) {
            throw new Error("INVALID_PAYMENT_AMOUNT: Payment amount must be greater than zero.");
        }
    }

    const requestDoc = {
        requestId,
        requestType,
        entityType,
        entityId,
        payload,
        maker: {
            uid: maker.uid,
            email: maker.email || "accountant@krishivishal.com",
            role: maker.role || "Accountant",
            timestamp
        },
        status: "PENDING",
        checker: null,
        rejectionReason: null,
        createdAt: timestamp,
        updatedAt: timestamp
    };

    await db.collection("approval_requests").doc(requestId).set(requestDoc);

    // Immutable audit record
    await db.collection("audit_logs").add({
        action: "APPROVAL_REQUESTED",
        resourceType: "approval_requests",
        resourceId: requestId,
        actor: maker.email || maker.uid,
        details: { requestType, entityType, entityId, payload },
        createdAt: timestamp
    });

    return {
        requestId,
        status: "PENDING",
        requestType,
        entityId
    };
}

/**
 * Reviews and either approves or rejects an approval request.
 * 
 * @param {object} param0
 * @param {string} param0.requestId
 * @param {object} param0.checker { uid, email, role }
 * @param {"APPROVE" | "REJECT"} param0.action
 * @param {string} [param0.remarks]
 * @returns {Promise<object>}
 */
async function reviewApprovalRequest({ requestId, checker, action, remarks }) {
    if (!requestId) throw new Error("MISSING_REQUEST_ID: requestId is required.");
    if (!checker || !checker.uid) throw new Error("MISSING_CHECKER_IDENTITY: checker { uid, email, role } is required.");
    if (!action || !["APPROVE", "REJECT"].includes(action)) {
        throw new Error("INVALID_REVIEW_ACTION: Action must be either 'APPROVE' or 'REJECT'.");
    }

    const reqRef = db.collection("approval_requests").doc(requestId);
    const reqDoc = await reqRef.get();

    if (!reqDoc.exists) {
        throw new Error(`APPROVAL_REQUEST_NOT_FOUND: Request '${requestId}' does not exist.`);
    }

    const reqData = reqDoc.data();

    // 1. STATE GUARD: Request must be in PENDING state
    if (reqData.status !== "PENDING") {
        const err = new Error(`REQUEST_ALREADY_RESOLVED: Request '${requestId}' is already ${reqData.status}.`);
        err.code = "REQUEST_ALREADY_RESOLVED";
        throw err;
    }

    // 2. SELF-APPROVAL GUARD (Segregation of Duties)
    if (checker.uid === reqData.maker.uid) {
        const err = new Error("MAKER_CANNOT_BE_CHECKER: Segregation of Duties violation. The creator (Maker) cannot approve their own request.");
        err.code = "MAKER_CANNOT_BE_CHECKER";
        throw err;
    }

    // 3. ROLE AUTHORIZATION GUARD
    const checkerRole = checker.role || "Viewer";
    if (!ALLOWED_CHECKER_ROLES.includes(checkerRole)) {
        const err = new Error(`UNAUTHORIZED_CHECKER: Only [${ALLOWED_CHECKER_ROLES.join(", ")}] roles have authority to approve or reject high-risk requests (received: ${checkerRole}).`);
        err.code = "UNAUTHORIZED_CHECKER";
        throw err;
    }

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const checkerInfo = {
        uid: checker.uid,
        email: checker.email || "cfo@krishivishal.com",
        role: checkerRole,
        reviewedAt: timestamp,
        remarks: remarks || (action === "APPROVE" ? "Approved" : "Rejected")
    };

    // --- CASE A: REJECTION WORKFLOW ---
    if (action === "REJECT") {
        if (!remarks || String(remarks).trim().length < 3) {
            throw new Error("MANDATORY_REJECTION_REASON: A documented justification remarks is required when rejecting a request.");
        }

        await reqRef.update({
            status: "REJECTED",
            rejectionReason: remarks,
            checker: checkerInfo,
            updatedAt: timestamp
        });

        // Revert entity status if needed
        if (reqData.requestType === "SUPPLIER_BANK_UPDATE") {
            const supplierRef = db.collection("suppliers").doc(reqData.entityId);
            const supSnap = await supplierRef.get();
            if (supSnap.exists) {
                await supplierRef.update({
                    bankDetailsStatus: "REJECTED",
                    pendingBankRequestId: null,
                    updatedAt: timestamp
                });
            }
        }

        await db.collection("audit_logs").add({
            action: "APPROVAL_REJECTED",
            resourceType: "approval_requests",
            resourceId: requestId,
            actor: checker.email || checker.uid,
            reason: remarks,
            createdAt: timestamp
        });

        return {
            requestId,
            status: "REJECTED",
            checker: checkerInfo,
            rejectionReason: remarks
        };
    }

    // --- CASE B: APPROVAL WORKFLOW & ATOMIC EXECUTION ---
    let executionResult = null;

    if (reqData.requestType === "SUPPLIER_BANK_UPDATE") {
        const supplierRef = db.collection("suppliers").doc(reqData.entityId);
        const supSnap = await supplierRef.get();
        const beforeBank = supSnap.exists ? (supSnap.data().bankDetails || {}) : {};

        const newBankDetails = {
            accountNumber: reqData.payload.accountNumber,
            ifsc: String(reqData.payload.ifsc).toUpperCase(),
            beneficiaryName: reqData.payload.beneficiaryName,
            bankName: reqData.payload.bankName || "Verified Bank",
            verifiedAt: timestamp,
            verifiedBy: checker.email || checker.uid
        };

        await supplierRef.set({
            bankDetails: newBankDetails,
            bankDetailsStatus: "VERIFIED",
            pendingBankRequestId: null,
            updatedAt: timestamp
        }, { merge: true });

        executionResult = { updatedBank: newBankDetails };

        await db.collection("audit_logs").add({
            action: "APPROVAL_EXECUTED",
            resourceType: "suppliers",
            resourceId: reqData.entityId,
            actor: checker.email || checker.uid,
            before: beforeBank,
            after: newBankDetails,
            createdAt: timestamp
        });
    } else if (reqData.requestType === "HIGH_VALUE_PAYMENT") {
        // Atomic ledger settlement call
        const paymentPayload = reqData.payload;
        executionResult = await recordSupplierPayment({
            supplierId: reqData.entityId,
            invoiceId: paymentPayload.invoiceId,
            paymentAmount: paymentPayload.amount,
            bankAccountCode: paymentPayload.bankAccountCode || "1030_BANK_CURRENT_HDFC",
            utrRef: paymentPayload.utrRef,
            periodId: paymentPayload.periodId || "2026-10",
            paidBy: checker.email || checker.uid
        });

        await db.collection("audit_logs").add({
            action: "APPROVAL_EXECUTED",
            resourceType: "supplier_invoices",
            resourceId: paymentPayload.invoiceId,
            actor: checker.email || checker.uid,
            details: executionResult,
            createdAt: timestamp
        });
    }

    await reqRef.update({
        status: "APPROVED",
        checker: checkerInfo,
        executionResult: executionResult || {},
        updatedAt: timestamp
    });

    return {
        requestId,
        status: "APPROVED",
        checker: checkerInfo,
        executionResult
    };
}

/**
 * Fetches approval requests optionally filtered by status.
 * @param {string} [status="PENDING"]
 * @returns {Promise<Array<object>>}
 */
async function getApprovalRequests(status = "PENDING") {
    let q = db.collection("approval_requests");
    if (status && status !== "ALL") {
        q = q.where("status", "==", status);
    }
    const snap = await q.orderBy("createdAt", "desc").limit(50).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

module.exports = {
    ALLOWED_CHECKER_ROLES,
    IFSC_REGEX,
    submitApprovalRequest,
    reviewApprovalRequest,
    getApprovalRequests
};
