/**
 * Rule 53 CGST Compliant Credit Note Engine (RTO & Sales Returns)
 * Conforming to Section 34 of the CGST Act, 2017 & Rule 53.
 * 
 * Part of CA-Ready Financial Architecture (Sprint 2).
 */

const crypto = require("crypto");
const { db, admin } = require("../core/admin");
const { getCurrentFinancialYear } = require("./sequentialInvoiceEngine");
const { postJournalEntry } = require("../finance/generalLedger");
const { calculateTaxForOrder, roundCurrency } = require("../tax/gstEngine");

const LOCK_STALE_TIMEOUT_MS = 60 * 1000; // 60 seconds

/**
 * Normalizes an idempotency key to a safe Firestore document ID:
 * - Sanitizes invalid characters
 * - Appends a deterministic SHA-256 hash of the original key to guarantee uniqueness and prevent collision
 * - Truncates to <= 60 characters
 */
function deriveLockDocId(key) {
    if (!key || typeof key !== "string") {
        throw new Error("INVALID_LOCK_KEY: Key must be a non-empty string.");
    }
    const hash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
    const sanitized = key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 36);
    return `LK_${sanitized}_${hash}`;
}

/**
 * Derives a deterministic journal entry ID from the stable return key and periodId.
 */
function deriveDeterministicJournalId(key, periodId) {
    const hash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
    const sanitized = key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24);
    const periodStr = (periodId || "").replace("-", "");
    return `JE_CN_${periodStr}_${sanitized}_${hash}`;
}

function getTimestampMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.toDate === "function") return ts.toDate().getTime();
    if (typeof ts.seconds === "number") return ts.seconds * 1000;
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === "number") return ts;
    // Sentinel FieldValue or recent in-memory timestamp
    return Date.now();
}

/**
 * Concurrency-safe consecutive credit note number generator.
 * Format: KVCN/{FY}/{SEQUENCE_5_DIGITS} (e.g. KVCN/26-27/00001)
 * Statutory limit: <= 16 characters.
 * 
 * @param {string} [financialYear] e.g. "26-27"
 * @param {string} [prefix] defaults to "KVCN"
 * @returns {Promise<{ creditNoteNumber: string, sequence: number, financialYear: string }>}
 */
async function getNextCreditNoteNumber(financialYear = null, prefix = "KVCN") {
    const fy = financialYear || getCurrentFinancialYear();
    const counterRef = db.collection("credit_note_counters").doc(fy);

    const result = await db.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);

        let currentSequence = 0;
        if (counterDoc.exists) {
            currentSequence = Number(counterDoc.data()?.currentSequence) || 0;
        }

        const nextSequence = currentSequence + 1;
        const paddedSequence = String(nextSequence).padStart(5, "0");
        const creditNoteNumber = `${prefix}/${fy}/${paddedSequence}`;

        if (creditNoteNumber.length > 16) {
            throw new Error(`GST_RULE_53_VIOLATION: Credit note number '${creditNoteNumber}' exceeds maximum statutory limit of 16 characters.`);
        }

        transaction.set(counterRef, {
            financialYear: fy,
            prefix,
            currentSequence: nextSequence,
            lastGeneratedCreditNoteNumber: creditNoteNumber,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return {
            creditNoteNumber,
            sequence: nextSequence,
            financialYear: fy
        };
    });

    return result;
}

/**
 * Atomically reserves a sequential credit note number for an operation lock
 * in a SINGLE indivisible Firestore transaction.
 *
 * Guarantees:
 * 1. Reads lockRef and counterRef first.
 * 2. If lock already has creditNoteNumber, reuses it idempotently without incrementing the counter.
 * 3. If lock does not have a number, increments counter and updates lockRef to NUMBER_RESERVED atomically.
 * 4. Eliminates any micro-window where a counter could increment without the lock recording it.
 *
 * @param {FirebaseFirestore.DocumentReference} lockRef
 * @param {string} [financialYear]
 * @param {string} [prefix]
 * @returns {Promise<{ creditNoteNumber: string, creditNoteId: string, sequence: number, alreadyReserved: boolean }>}
 */
async function reserveNextCreditNoteNumberForLock(lockRef, financialYear = null, prefix = "KVCN") {
    if (!lockRef) {
        throw new Error("INVALID_LOCK_REF: lockRef is required for atomic reservation.");
    }
    const fy = financialYear || getCurrentFinancialYear();
    const counterRef = db.collection("credit_note_counters").doc(fy);

    const result = await db.runTransaction(async (transaction) => {
        // Read 1: Inspect current lock state
        const lockDoc = await transaction.get(lockRef);
        if (lockDoc.exists) {
            const data = lockDoc.data() || {};
            if (data.creditNoteNumber) {
                return {
                    creditNoteNumber: data.creditNoteNumber,
                    creditNoteId: data.creditNoteId || data.creditNoteNumber.replace(/\//g, "_"),
                    sequence: data.sequence || null,
                    financialYear: fy,
                    alreadyReserved: true
                };
            }
        }

        // Read 2: Read current sequence counter
        const counterDoc = await transaction.get(counterRef);
        let currentSequence = 0;
        if (counterDoc.exists) {
            currentSequence = Number(counterDoc.data()?.currentSequence) || 0;
        }

        const nextSequence = currentSequence + 1;
        const paddedSequence = String(nextSequence).padStart(5, "0");
        const creditNoteNumber = `${prefix}/${fy}/${paddedSequence}`;

        if (creditNoteNumber.length > 16) {
            throw new Error(`GST_RULE_53_VIOLATION: Credit note number '${creditNoteNumber}' exceeds maximum statutory limit of 16 characters.`);
        }

        const creditNoteId = creditNoteNumber.replace(/\//g, "_");

        // Write 1: Update counter atomically
        transaction.set(counterRef, {
            financialYear: fy,
            prefix,
            currentSequence: nextSequence,
            lastGeneratedCreditNoteNumber: creditNoteNumber,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Write 2: Atomically persist reservation in the lock document
        transaction.set(lockRef, {
            status: "NUMBER_RESERVED",
            creditNoteNumber,
            creditNoteId,
            sequence: nextSequence,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAtMs: Date.now()
        }, { merge: true });

        return {
            creditNoteNumber,
            creditNoteId,
            sequence: nextSequence,
            financialYear: fy,
            alreadyReserved: false
        };
    });

    return result;
}

/**
 * Derives current fiscal period in 'YYYY-MM' format.
 */
function getFiscalPeriodId(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
}

/**
 * Generates a Rule 53 statutory Credit Note for an RTO or customer sales return,
 * writing to `credit_notes/{creditNoteId}` and posting a double-entry reversal journal entry.
 * 
 * @param {object} param0
 * @param {string} param0.orderId
 * @param {string} param0.originalInvoiceNo
 * @param {string} param0.returnReason "RTO_FAILED_DELIVERY" | "CUSTOMER_REJECTED" | "DAMAGED_TRANSIT" etc.
 * @param {Array<object>} param0.returnedItems [{ skuId, name, quantity, unitPrice, taxablePrice, hsn, costPrice }]
 * @param {boolean} [param0.restockable] If true, restocks to saleable inventory (Dr Inventory | Cr COGS)
 * @param {string} [param0.shippingState] e.g. "Bihar"
 * @param {string} [param0.createdBy]
 * @param {string} [param0.idempotencyKey] Optional secondary key for retry identification
 * @param {string} param0.returnRequestId MANDATORY canonical Return Request ID (e.g. "RET-XXXX")
 * @returns {Promise<object>} Credit note record & Journal Entry reference
 */
async function generateCreditNoteForReturn({
    orderId,
    originalInvoiceNo,
    returnReason = "CUSTOMER_RETURN",
    returnedItems = [],
    restockable = true,
    shippingState = "Bihar",
    createdBy = "SYSTEM",
    idempotencyKey = null,
    returnRequestId = null
}) {
    if (!returnRequestId || typeof returnRequestId !== "string" || !returnRequestId.trim()) {
        const err = new Error("MISSING_RETURN_REQUEST_ID: returnRequestId is strictly required as a stable business return identifier for statutory Credit Note issuance.");
        err.code = "MISSING_RETURN_REQUEST_ID";
        throw err;
    }
    const cleanReturnRequestId = returnRequestId.trim();

    if (!orderId) throw new Error("MISSING_ORDER_ID: orderId is required.");
    if (!originalInvoiceNo) throw new Error("MISSING_INVOICE_NO: originalInvoiceNo is required.");
    if (!Array.isArray(returnedItems) || returnedItems.length === 0) {
        throw new Error("EMPTY_RETURN_ITEMS: At least one returned item is required.");
    }

    // Stable business identifier anchored exclusively to the canonical Return Request ID
    const effectiveKey = `RET_${cleanReturnRequestId}`;
    const lockDocId = deriveLockDocId(effectiveKey);
    const lockRef = db.collection("credit_note_locks").doc(lockDocId);

    // Calculate dynamic tax reversal amounts based on returned items
    const taxCalculation = calculateTaxForOrder({
        shippingState,
        items: returnedItems
    });
    const { taxableAmount, cgstAmount, sgstAmount, igstAmount, totalTax, grandTotal } = taxCalculation;

    const periodId = getFiscalPeriodId();
    const deterministicJournalId = deriveDeterministicJournalId(effectiveKey, periodId);

    const financialSummary = {
        taxableAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        totalTax,
        grandTotal
    };

    let creditNoteNumber = null;
    let creditNoteId = null;
    let journalEntryId = null;
    let isLockOwner = false;

    try {
        // 1. Atomic Lock Acquisition & Durable Operation State Retrieval
        const operation = await db.runTransaction(async (transaction) => {
            const lockDoc = await transaction.get(lockRef);

            if (!lockDoc.exists) {
                const initialRecord = {
                    lockDocId,
                    idempotencyKey: effectiveKey,
                    returnRequestId: returnRequestId || null,
                    orderId,
                    returnReason,
                    periodId,
                    status: "ALLOCATING",
                    financialSummary,
                    deterministicJournalId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAtMs: Date.now()
                };
                transaction.set(lockRef, initialRecord);
                return { isNew: true, record: initialRecord };
            }

            const currentData = lockDoc.data() || {};
            return { isNew: false, record: currentData };
        });

        isLockOwner = operation.isNew;

        // 2. State Inspection & Consistency Validation
        if (!operation.isNew) {
            const record = operation.record;

            // Invariant 5: A failed or retried request does not silently change previously recorded financial amounts
            if (record.financialSummary) {
                const amountDiff = Math.abs((Number(record.financialSummary.grandTotal) || 0) - grandTotal);
                if (amountDiff > 0.001) {
                    await lockRef.set({
                        status: "NEEDS_RECONCILIATION",
                        reconciliationReason: `Financial amounts mismatch on retry. Saved: ₹${record.financialSummary.grandTotal}, Requested: ₹${grandTotal}`,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAtMs: Date.now()
                    }, { merge: true }).catch(() => {});

                    const err = new Error(`FINANCIAL_AMOUNTS_MISMATCH: Retried credit note request has grand total ₹${grandTotal} differing from previously registered ₹${record.financialSummary.grandTotal}. Marked for reconciliation.`);
                    err.code = "FINANCIAL_AMOUNTS_MISMATCH";
                    throw err;
                }
            }

            // Flagged for manual audit
            if (record.status === "NEEDS_RECONCILIATION") {
                const err = new Error(`OPERATION_NEEDS_RECONCILIATION: Credit note operation requires manual reconciliation (Ref: ${lockDocId}, Reason: ${record.reconciliationReason || 'Unresolved conflict'}).`);
                err.code = "OPERATION_NEEDS_RECONCILIATION";
                throw err;
            }

            // Completed Operation: Safely return existing Credit Note
            if (record.status === "COMPLETED") {
                let cnDoc = null;
                if (record.creditNoteId) {
                    const cnSnap = await db.collection("credit_notes").doc(record.creditNoteId).get();
                    if (cnSnap.exists) cnDoc = cnSnap.data();
                }
                if (!cnDoc) {
                    const cnCol = db.collection("credit_notes");
                    if (typeof cnCol.where === "function") {
                        const snap = await cnCol.where("idempotencyKey", "==", effectiveKey).limit(1).get();
                        if (!snap.empty) cnDoc = snap.docs[0].data();
                    }
                }
                if (cnDoc) {
                    return {
                        success: true,
                        alreadyIssued: true,
                        creditNoteNumber: cnDoc.creditNoteNo || record.creditNoteNumber,
                        creditNoteId: cnDoc.creditNoteId || record.creditNoteId,
                        totalRefundAmount: cnDoc.totalRefundAmount,
                        journalEntryId: cnDoc.journalEntryId || record.journalEntryId,
                        creditNote: cnDoc
                    };
                }
            }

            // Active or Stale ALLOCATING operation
            if (record.status === "ALLOCATING") {
                const nowMs = Date.now();
                const updatedTime = record.updatedAtMs || getTimestampMillis(record.updatedAt);
                const elapsedMs = (nowMs - updatedTime);

                if (elapsedMs < LOCK_STALE_TIMEOUT_MS) {
                    const err = new Error("CONCURRENT_ALLOCATION_IN_PROGRESS: A credit note for this return is currently being generated. Please retry shortly.");
                    err.code = "CONCURRENT_ALLOCATION_IN_PROGRESS";
                    throw err;
                }

                // Crash recovery for stale ALLOCATING operation:
                // Check if a credit note or journal was created before the crash
                const cnCol = db.collection("credit_notes");
                if (typeof cnCol.where === "function") {
                    const existingCnSnap = await cnCol.where("idempotencyKey", "==", effectiveKey).limit(1).get();
                    if (!existingCnSnap.empty) {
                        const existingCN = existingCnSnap.docs[0].data();
                        await lockRef.set({
                            status: "COMPLETED",
                            creditNoteNumber: existingCN.creditNoteNo,
                            creditNoteId: existingCN.creditNoteId,
                            journalEntryId: existingCN.journalEntryId,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true }).catch(() => {});

                        return {
                            success: true,
                            alreadyIssued: true,
                            creditNoteNumber: existingCN.creditNoteNo,
                            creditNoteId: existingCN.creditNoteId,
                            totalRefundAmount: existingCN.totalRefundAmount,
                            journalEntryId: existingCN.journalEntryId,
                            creditNote: existingCN
                        };
                    }
                }

                const existingJeSnap = await db.collection("journal_entries").doc(deterministicJournalId).get().catch(() => ({ exists: false }));
                if (existingJeSnap.exists) {
                    const existingJe = existingJeSnap.data();
                    journalEntryId = existingJe.entryId;
                    if (existingJe.refId && existingJe.refId.startsWith("KVCN/")) {
                        creditNoteNumber = existingJe.refId;
                        creditNoteId = creditNoteNumber.replace(/\//g, "_");
                    }
                }

                await lockRef.set({
                    status: creditNoteNumber && journalEntryId ? "JOURNAL_POSTED" : (creditNoteNumber ? "NUMBER_RESERVED" : "ALLOCATING"),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true }).catch(() => {});
            }

            // Reuse existing reserved number if crash happened after step 3
            if (record.creditNoteNumber) {
                creditNoteNumber = record.creditNoteNumber;
                creditNoteId = record.creditNoteId || creditNoteNumber.replace(/\//g, "_");
            }
            if (record.journalEntryId) {
                journalEntryId = record.journalEntryId;
            }
        }

        // 3. Legacy Credit Note Check (Prior to Lock System)
        if (!creditNoteNumber) {
            const cnCol = db.collection("credit_notes");
            if (typeof cnCol.where === "function") {
                const legacySnap = await cnCol.where("idempotencyKey", "==", effectiveKey).limit(1).get();
                if (!legacySnap.empty) {
                    const existingCN = legacySnap.docs[0].data();
                    await lockRef.set({
                        status: "COMPLETED",
                        creditNoteNumber: existingCN.creditNoteNo,
                        creditNoteId: existingCN.creditNoteId,
                        journalEntryId: existingCN.journalEntryId,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true }).catch(() => {});

                    return {
                        success: true,
                        alreadyIssued: true,
                        creditNoteNumber: existingCN.creditNoteNo,
                        creditNoteId: existingCN.creditNoteId,
                        totalRefundAmount: existingCN.totalRefundAmount,
                        journalEntryId: existingCN.journalEntryId,
                        creditNote: existingCN
                    };
                }
            }
        }

        // 4. Atomically Reserve Sequential Credit Note Number in one indivisible transaction
        if (!creditNoteNumber) {
            const alloc = await reserveNextCreditNoteNumberForLock(lockRef);
            creditNoteNumber = alloc.creditNoteNumber;
            creditNoteId = alloc.creditNoteId;
        }

        // 5. Post Reversal Journal Entry (if not already posted)
        let totalCostOfReturnedGoods = 0;
        if (!journalEntryId) {
            const journalLines = [
                { accountCode: "4010_SALES_AGRI_INPUTS", debit: taxableAmount, credit: 0, description: `Sales Return: ${originalInvoiceNo}` }
            ];

            if (cgstAmount > 0) {
                journalLines.push({ accountCode: "2020_OUTPUT_CGST_PAYABLE", debit: cgstAmount, credit: 0, description: `CGST Reversal CN ${creditNoteNumber}` });
            }
            if (sgstAmount > 0) {
                journalLines.push({ accountCode: "2030_OUTPUT_SGST_PAYABLE", debit: sgstAmount, credit: 0, description: `SGST Reversal CN ${creditNoteNumber}` });
            }
            if (igstAmount > 0) {
                journalLines.push({ accountCode: "2040_OUTPUT_IGST_PAYABLE", debit: igstAmount, credit: 0, description: `IGST Reversal CN ${creditNoteNumber}` });
            }

            journalLines.push({
                accountCode: "2060_CUSTOMER_REFUNDS_PAYABLE",
                debit: 0,
                credit: grandTotal,
                description: `Refund Payable to Customer CN ${creditNoteNumber}`
            });

            if (restockable) {
                returnedItems.forEach(item => {
                    const cost = Number(item.costPrice || (item.taxablePrice || item.price || 0) * 0.7);
                    const qty = Number(item.quantity || 1);
                    totalCostOfReturnedGoods += roundCurrency(cost * qty);
                });
                totalCostOfReturnedGoods = roundCurrency(totalCostOfReturnedGoods);

                if (totalCostOfReturnedGoods > 0) {
                    journalLines.push({
                        accountCode: "1040_INVENTORY_MAIN_HUB",
                        debit: totalCostOfReturnedGoods,
                        credit: 0,
                        description: `Restock returned inventory CN ${creditNoteNumber}`
                    });
                    journalLines.push({
                        accountCode: "5010_COGS_AGRI_INPUTS",
                        debit: 0,
                        credit: totalCostOfReturnedGoods,
                        description: `COGS reversal on return restock CN ${creditNoteNumber}`
                    });
                }
            }

            const journalResult = await postJournalEntry({
                entryId: deterministicJournalId,
                refType: "SALES_RETURN",
                refId: creditNoteNumber,
                periodId,
                date: new Date(),
                memo: `Credit Note ${creditNoteNumber} for Invoice ${originalInvoiceNo} (${returnReason})`,
                lines: journalLines,
                createdBy
            });

            journalEntryId = journalResult.entryId;

            await lockRef.set({
                status: "JOURNAL_POSTED",
                journalEntryId,
                restockedCostAmount: totalCostOfReturnedGoods,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAtMs: Date.now()
            }, { merge: true });
        }

        // 6. Persist Credit Note Document
        const creditNoteDoc = {
            creditNoteId,
            creditNoteNo: creditNoteNumber,
            originalInvoiceNo,
            orderId,
            returnReason,
            shippingState,
            taxableAmount,
            cgstReversal: cgstAmount,
            sgstReversal: sgstAmount,
            igstReversal: igstAmount,
            totalTaxReversal: totalTax,
            totalRefundAmount: grandTotal,
            restockable: !!restockable,
            restockedCostAmount: operation.record.restockedCostAmount || totalCostOfReturnedGoods || 0,
            journalEntryId,
            items: taxCalculation.items,
            status: "ISSUED",
            periodId,
            financialPeriodId: periodId,
            idempotencyKey: effectiveKey,
            returnRequestId: returnRequestId || null,
            lockDocId,
            issuedAt: admin.firestore.FieldValue.serverTimestamp(),
            issuedBy: createdBy
        };

        await db.collection("credit_notes").doc(creditNoteId).set(creditNoteDoc);

        // 7. Complete Operation Lock
        await lockRef.set({
            status: "COMPLETED",
            creditNoteId,
            creditNoteNumber,
            journalEntryId,
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAtMs: Date.now()
        }, { merge: true });

        return {
            success: true,
            creditNoteNumber,
            creditNoteId,
            totalRefundAmount: grandTotal,
            journalEntryId,
            creditNote: creditNoteDoc
        };

    } catch (err) {
        // Do not delete lock if operation was flagged for manual reconciliation,
        // or if a concurrent allocation is in progress, or if this caller does not own the lock
        const isNonDeletableError = (
            err.code === "FINANCIAL_AMOUNTS_MISMATCH" ||
            err.code === "OPERATION_NEEDS_RECONCILIATION" ||
            err.code === "CONCURRENT_ALLOCATION_IN_PROGRESS" ||
            (err.message && err.message.includes("CONCURRENT_ALLOCATION_IN_PROGRESS"))
        );

        if (!isNonDeletableError && isLockOwner) {
            // Only the owner who created this lock in the current execution should clean up on pre-allocation failure
            if (!creditNoteNumber && !journalEntryId) {
                await lockRef.delete().catch(() => {});
            }
        }
        throw err;
    }
}

module.exports = {
    getNextCreditNoteNumber,
    reserveNextCreditNoteNumberForLock,
    getFiscalPeriodId,
    generateCreditNoteForReturn,
    deriveLockDocId,
    deriveDeterministicJournalId,
    LOCK_STALE_TIMEOUT_MS
};
