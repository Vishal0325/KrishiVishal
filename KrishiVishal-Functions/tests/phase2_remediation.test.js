/**
 * KrishiVishal ERP — Phase 2 Verification Suite
 * Tests:
 * 1. onReturnApproved trigger idempotency and payload mapping
 * 2. buildCreditNotePdfBuffer rendering valid buffer (>1000 bytes) with Rule 53 fields
 * 3. GSTR-1 Table 7 netting of credit notes for current period
 * 4. Table 13 exclusion of foreign period credit note serials
 * 5. Section 194Q penal deduction strictly 5% when PAN is missing
 * 6. Section 194H 2% commission rate deduction post October 2024
 * 7. HSN 8201 returning 0% GST rate
 */

const assert = require("assert");

// Configure test environment
process.env.NODE_ENV = "test";
process.env.GCLOUD_PROJECT = "krishivishal-test";

const adminModule = require("../core/admin");
const { handleReturnApproved } = require("../returns/returnTriggers");
const { buildCreditNotePdfBuffer } = require("../invoices/invoiceService");
const { generateGstr1Summary } = require("../tax/gstrReportEngine");
const { calculateTdsDeduction } = require("../tax/tdsEngine");
const { calculateTaxForOrder, resolveHsnRate } = require("../tax/gstEngine");

async function runPhase2TestSuite() {
    console.log("=========================================================================");
    console.log("=== RUNNING KRISHIVISHAL PHASE 2 REMEDIATION VERIFICATION SUITE ===");
    console.log("=========================================================================\n");

    let passed = 0;
    let failed = 0;

    function pass(msg) {
        console.log(`  ✅ PASS: ${msg}`);
        passed++;
    }

    function fail(msg, err) {
        console.error(`  ❌ FAIL: ${msg}`);
        if (err) console.error(err);
        failed++;
    }

    const originalCollection = adminModule.db.collection;
    const originalRunTransaction = adminModule.db.runTransaction;

    try {
        // In-memory Firestore store for mocking
        const store = {
            orders: new Map(),
            returns: new Map(),
            credit_notes: new Map(),
            credit_note_locks: new Map(),
            credit_note_counters: new Map(),
            journal_entries: new Map(),
            journal_lines: new Map()
        };

        function createMockDocRef(colName, docId) {
            return {
                id: docId,
                path: `${colName}/${docId}`,
                get: async () => {
                    const table = store[colName] || new Map();
                    const data = table.get(docId);
                    return {
                        exists: data !== undefined,
                        id: docId,
                        data: () => data
                    };
                },
                set: async (payload, options = {}) => {
                    const table = store[colName] || (store[colName] = new Map());
                    if (options.merge && table.has(docId)) {
                        table.set(docId, { ...table.get(docId), ...payload });
                    } else {
                        table.set(docId, { ...payload });
                    }
                },
                update: async (patch) => {
                    const table = store[colName] || new Map();
                    const existing = table.get(docId) || {};
                    table.set(docId, { ...existing, ...patch });
                },
                delete: async () => {
                    const table = store[colName] || new Map();
                    table.delete(docId);
                    return true;
                },
                collection: (subName) => ({
                    get: async () => ({ empty: true, size: 0, docs: [] }),
                    doc: (subId) => createMockDocRef(`${colName}/${docId}/${subName}`, subId)
                })
            };
        }

        adminModule.db.collection = function (colName) {
            return {
                doc: (id) => createMockDocRef(colName, id),
                where: function (field, op, val) {
                    const filters = [{ field, op, val }];
                    let queryLimit = null;
                    const chain = {
                        where: function (f2, op2, val2) {
                            filters.push({ field: f2, op: op2, val: val2 });
                            return chain;
                        },
                        limit: function (n) {
                            queryLimit = n;
                            return chain;
                        },
                        get: async () => {
                            const table = store[colName] || new Map();
                            let results = [];
                            for (const [id, data] of table.entries()) {
                                const matches = filters.every(filt => data[filt.field] === filt.val);
                                if (matches) {
                                    results.push({
                                        id,
                                        ref: createMockDocRef(colName, id),
                                        data: () => data
                                    });
                                }
                            }
                            if (queryLimit !== null) {
                                results = results.slice(0, queryLimit);
                            }
                            return {
                                empty: results.length === 0,
                                size: results.length,
                                docs: results
                            };
                        }
                    };
                    return chain;
                },
                get: async () => {
                    const table = store[colName] || new Map();
                    const results = [];
                    for (const [id, data] of table.entries()) {
                        results.push({
                            id,
                            ref: createMockDocRef(colName, id),
                            data: () => data
                        });
                    }
                    return {
                        empty: results.length === 0,
                        size: results.length,
                        docs: results
                    };
                }
            };
        };

        // Mutex for mock runTransaction
        let txLock = Promise.resolve();
        adminModule.db.runTransaction = async function (updateFunction) {
            const currentLock = txLock;
            let resolveLock;
            txLock = new Promise(r => resolveLock = r);

            await currentLock;
            try {
                const transaction = {
                    get: async (docRef) => docRef.get(),
                    set: (docRef, payload, options) => {
                        docRef.set(payload, options);
                    },
                    update: (docRef, patch) => {
                        docRef.update(patch);
                    }
                };
                return await updateFunction(transaction);
            } finally {
                resolveLock();
            }
        };

        // =========================================================================
        // TEST 1: onReturnApproved Trigger Idempotency & Payload Mapping
        // =========================================================================
        console.log("--- TEST 1: Return Approval Bridge Trigger ---");
        {
            const orderId = "ORD_RET_TEST_001";
            const returnId = "RET_REQ_TEST_001";

            // Seed order
            store.orders.set(orderId, {
                orderId,
                invoiceNumber: "KV/26-27/00555",
                shippingState: "Bihar",
                items: [
                    {
                        skuCode: "SKU_FERT_DAP",
                        name: "DAP Fertilizer 50kg",
                        hsn: "3105",
                        quantity: 2,
                        taxablePrice: 1350,
                        costPrice: 1100
                    }
                ]
            });

            // Seed return document
            store.returns.set(returnId, {
                returnId,
                orderId,
                status: "APPROVED",
                qcStatus: "PASSED",
                refundStatus: "PENDING",
                items: [
                    {
                        skuId: "SKU_FERT_DAP",
                        name: "DAP Fertilizer 50kg",
                        hsn: "3105",
                        quantity: 1,
                        taxablePrice: 1350,
                        costPrice: 1100
                    }
                ],
                approvedBy: "admin@krishivishal.com"
            });

            const returnRef = createMockDocRef("returns", returnId);

            // 1.1 First trigger execution: Transition from PENDING_QC to APPROVED
            const res1 = await handleReturnApproved({
                returnId,
                beforeData: { status: "PENDING_QC", qcStatus: "PENDING", refundStatus: "PENDING" },
                afterData: store.returns.get(returnId),
                returnRef
            });

            assert.ok(res1);
            assert.strictEqual(res1.success, true);
            assert.ok(res1.creditNoteNumber.startsWith("KVCN/"));

            const updatedReturn = store.returns.get(returnId);
            assert.strictEqual(updatedReturn.creditNoteNo, res1.creditNoteNumber);
            assert.strictEqual(updatedReturn.refundStatus, "CREDIT_NOTE_ISSUED");

            pass("1.1 onReturnApproved trigger successfully processed QC approval and issued Credit Note.");

            // 1.2 Second trigger execution: Same afterData already has CREDIT_NOTE_ISSUED (Idempotency guard)
            const res2 = await handleReturnApproved({
                returnId,
                beforeData: { status: "APPROVED", qcStatus: "PASSED", refundStatus: "CREDIT_NOTE_ISSUED" },
                afterData: updatedReturn,
                returnRef
            });
            assert.strictEqual(res2, null, "Already issued return must be safely skipped");
            pass("1.2 onReturnApproved idempotency guard skipped already processed return without duplicate issue.");
        }

        // =========================================================================
        // TEST 2: Statutory Credit Note PDF Generation (CGST Rule 53)
        // =========================================================================
        console.log("\n--- TEST 2: Statutory Credit Note PDF Generation ---");
        {
            const sampleCnData = {
                creditNoteNo: "KVCN/26-27/00001",
                originalInvoiceNo: "KV/26-27/00555",
                returnReason: "DAMAGED_IN_TRANSIT",
                customerName: "Rameshwar Prasad",
                customerPhone: "+919876543210",
                shippingAddress: "Village Kalyanpur, Samastipur, Bihar - 848101",
                shippingState: "Bihar",
                taxableAmount: 1350,
                cgstReversal: 33.75,
                sgstReversal: 33.75,
                totalRefundAmount: 1417.50,
                items: [
                    {
                        skuId: "SKU_FERT_DAP",
                        name: "DAP Fertilizer 50kg",
                        hsn: "3105",
                        quantity: 1,
                        unitPrice: 1350,
                        taxableAmount: 1350,
                        cgstAmount: 33.75,
                        sgstAmount: 33.75,
                        grandTotal: 1417.50
                    }
                ],
                issuedAt: new Date("2026-10-10")
            };

            const pdfBuffer = await buildCreditNotePdfBuffer(sampleCnData);
            assert.ok(Buffer.isBuffer(pdfBuffer), "PDF output must be a valid Buffer");
            assert.ok(pdfBuffer.length > 1000, `PDF buffer length (${pdfBuffer.length} bytes) must exceed 1000 bytes`);

            // Verify statutory PDF structure & decompressed stream contents
            const pdfString = pdfBuffer.toString("latin1");
            assert.ok(pdfString.startsWith("%PDF-"), "PDF must have %PDF header");

            // Decompress stream(s) to verify textual content
            const zlib = require("zlib");
            const streamMatches = pdfString.match(/stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g) || [];
            assert.ok(streamMatches.length > 0, "PDF must contain content streams");

            let fullDecompressed = "";
            for (const s of streamMatches) {
                const raw = Buffer.from(s.replace(/^stream[\r\n]+/, '').replace(/[\r\n]+endstream$/, ''), 'latin1');
                try {
                    fullDecompressed += zlib.inflateSync(raw).toString('utf-8') + " ";
                } catch (e) {}
            }

            // In PDF content streams, text is emitted as hex literals with kerning adjustments:
            // e.g. [<435245444954204e4f> 40 <5445> 0] TJ -> 'CREDIT NO' + 'TE' = 'CREDIT NOTE'
            const hexChunks = fullDecompressed.match(/<([0-9a-fA-F]+)>/g) || [];
            const decodedText = hexChunks.map(h => Buffer.from(h.replace(/[<>]/g, ''), 'hex').toString('utf-8')).join("");

            assert.ok(decodedText.includes("CREDIT NOTE"), "PDF stream must contain CREDIT NOTE header");
            assert.ok(decodedText.includes("Section 34"), "PDF stream must reference Section 34 of CGST Act");
            assert.ok(decodedText.includes("Rule 53"), "PDF stream must reference Rule 53");
            assert.ok(decodedText.includes("10AAACK9821M1Z5"), "PDF stream must include KrishiVishal GSTIN");

            pass(`2.1 buildCreditNotePdfBuffer rendered valid Rule 53 PDF buffer (${pdfBuffer.length} bytes) with required statutory headers.`);
        }

        // =========================================================================
        // TEST 3: GSTR-1 Period Filter & Table 7 Netting
        // =========================================================================
        console.log("\n--- TEST 3: GSTR-1 Period Filter & Table 7 Netting ---");
        {
            const periodId = "2026-10";

            // Clear previous test records
            store.orders.clear();
            store.credit_notes.clear();

            // Order: Gross Sales Bihar ₹10,000 @ 18% (Taxable ₹10,000, CGST ₹900, SGST ₹900)
            store.orders.set("ORD_GSTR_NET_01", {
                orderId: "ORD_GSTR_NET_01",
                invoiceNumber: "KV/26-27/00101",
                financialPeriodId: periodId,
                financialStatus: "RECOGNIZED",
                shippingState: "Bihar",
                items: [
                    {
                        name: "Crop Protection Insecticide",
                        hsn: "3808",
                        quantity: 10,
                        sellingPrice: 1000,
                        taxRate: 0.18,
                        cgstAmount: 900,
                        sgstAmount: 900,
                        igstAmount: 0
                    }
                ]
            });

            // Credit Note in current period: Return ₹2,000 @ 18% (Taxable ₹2,000, CGST ₹180, SGST ₹180)
            store.credit_notes.set("CN_GSTR_NET_01", {
                creditNoteId: "KVCN_26-27_00010",
                creditNoteNo: "KVCN/26-27/00010",
                financialPeriodId: periodId,
                shippingState: "Bihar",
                taxableAmount: 2000,
                cgstReversal: 180,
                sgstReversal: 180,
                totalRefundAmount: 2360,
                status: "ISSUED",
                items: [
                    {
                        skuId: "SKU_PEST_01",
                        name: "Crop Protection Insecticide",
                        hsn: "3808",
                        quantity: 2,
                        taxableAmount: 2000,
                        taxRate: 0.18,
                        cgstAmount: 180,
                        sgstAmount: 180,
                        grandTotal: 2360
                    }
                ]
            });

            // Foreign period Credit Note (from 2026-09) - Must NOT be netted in 2026-10
            store.credit_notes.set("CN_GSTR_FOREIGN_02", {
                creditNoteId: "KVCN_26-27_00005",
                creditNoteNo: "KVCN/26-27/00005",
                financialPeriodId: "2026-09",
                shippingState: "Bihar",
                taxableAmount: 5000,
                status: "ISSUED"
            });

            const summary = await generateGstr1Summary({ periodId, financialYear: "26-27" });

            // Table 7 Netting: Gross ₹10,000 - CN ₹2,000 = ₹8,000
            const t7Bihar = summary.table7B2C.find(r => r.placeOfSupply === "Bihar" && r.rate === 18);
            assert.ok(t7Bihar, "Must contain Table 7 Bihar 18% entry");
            assert.strictEqual(t7Bihar.taxableValue, 8000, `Netted taxable must be 8000, got ${t7Bihar.taxableValue}`);
            assert.strictEqual(t7Bihar.cgstAmount, 720, `Netted CGST must be 720, got ${t7Bihar.cgstAmount}`);
            assert.strictEqual(t7Bihar.sgstAmount, 720, `Netted SGST must be 720, got ${t7Bihar.sgstAmount}`);
            assert.strictEqual(t7Bihar.totalTax, 1440);

            // Table 12 HSN Netting: Qty 10 - 2 = 8, Taxable 10k - 2k = 8k
            const t12Hsn = summary.table12Hsn.find(r => r.hsnCode === "3808");
            assert.ok(t12Hsn, "Must contain HSN 3808 entry in Table 12");
            assert.strictEqual(t12Hsn.totalQuantity, 8, `Netted HSN quantity must be 8, got ${t12Hsn.totalQuantity}`);
            assert.strictEqual(t12Hsn.totalTaxableValue, 8000);

            // Table 13 Document serials: Only includes current period Credit Note (KVCN/26-27/00010)
            assert.strictEqual(summary.table13Documents.creditNotes.totalIssued, 1);
            assert.strictEqual(summary.table13Documents.creditNotes.fromSerial, "KVCN/26-27/00010");
            assert.strictEqual(summary.table13Documents.creditNotes.toSerial, "KVCN/26-27/00010");

            pass("3.1 GSTR-1 Table 7 and Table 12 correctly netted current period Credit Notes.");
            pass("3.2 Table 13 strictly excluded foreign period credit note serials.");
        }

        // =========================================================================
        // TEST 4: Statutory Direct Tax Rates (Section 194Q & 194H)
        // =========================================================================
        console.log("\n--- TEST 4: Statutory Direct Tax Rates (194Q & 194H) ---");
        {
            // 4.1 Section 194Q: Missing PAN penal rate capped at 5% (Proviso to Sec 206AA)
            const tds194QMissingPan = calculateTdsDeduction({
                section: "194Q",
                amount: 100000,
                pan: null // Missing PAN
            });
            assert.strictEqual(tds194QMissingPan.isPanMissingPenalty, true);
            assert.strictEqual(tds194QMissingPan.applicableRate, 0.05, "Section 194Q missing PAN penal rate must be 5% (0.05)");
            assert.strictEqual(tds194QMissingPan.tdsAmount, 5000, "5% of ₹1,00,000 = ₹5,000");
            assert.strictEqual(tds194QMissingPan.netPayable, 95000);
            pass("4.1 Section 194Q penal deduction strictly 5% (0.05) when PAN is missing pursuant to Proviso to Sec 206AA(1).");

            // 4.2 Other sections (e.g. 194C) retain standard 20% penal rate when PAN is missing
            const tds194CMissingPan = calculateTdsDeduction({
                section: "194C",
                amount: 100000,
                pan: null
            });
            assert.strictEqual(tds194CMissingPan.applicableRate, 0.20, "Section 194C retains standard 20% penal rate");
            pass("4.2 Section 194C retains standard 20% penalty under general Section 206AA.");

            // 4.3 Section 194H: Post-October 2024 Commission rate is 2% (Finance (No. 2) Act 2024)
            const tds194HPostOct = calculateTdsDeduction({
                section: "194H",
                amount: 50000,
                pan: "AABCK9821M",
                date: new Date("2024-10-15T00:00:00Z")
            });
            assert.strictEqual(tds194HPostOct.applicableRate, 0.02, "Section 194H rate post-Oct 2024 must be 2% (0.02)");
            assert.strictEqual(tds194HPostOct.tdsAmount, 1000, "2% of ₹50,000 = ₹1,000");
            assert.strictEqual(tds194HPostOct.netPayable, 49000);
            pass("4.3 Section 194H commission rate post-October 2024 is strictly 2% (0.02).");

            // 4.4 Section 194H: Pre-October 2024 historical rate was 5%
            const tds194HPreOct = calculateTdsDeduction({
                section: "194H",
                amount: 50000,
                pan: "AABCK9821M",
                date: new Date("2024-08-01T00:00:00Z")
            });
            assert.strictEqual(tds194HPreOct.applicableRate, 0.05, "Historical 194H rate before Oct 2024 was 5% (0.05)");
            pass("4.4 Section 194H historical rate before October 2024 preserved at 5% (0.05).");
        }

        // =========================================================================
        // TEST 5: HSN 8201 Agricultural Hand Tools Rate (0% Exempt)
        // =========================================================================
        console.log("\n--- TEST 5: HSN 8201 Agricultural Hand Tools Rate ---");
        {
            const hsnRate = resolveHsnRate("8201");
            assert.strictEqual(hsnRate.rate, 0.00, "HSN 8201 must resolve to 0.00 (Exempt)");
            assert.strictEqual(hsnRate.category, "FARM_TOOLS");

            // Test order calculation with HSN 8201 item
            const taxResult = calculateTaxForOrder({
                shippingState: "Bihar",
                items: [
                    {
                        skuId: "SKU_TOOL_KODALI",
                        name: "Agricultural Hand Hoe (Kodali)",
                        hsn: "8201",
                        quantity: 4,
                        taxablePrice: 250
                    }
                ]
            });
            assert.strictEqual(taxResult.taxableAmount, 1000);
            assert.strictEqual(taxResult.cgstAmount, 0);
            assert.strictEqual(taxResult.sgstAmount, 0);
            assert.strictEqual(taxResult.igstAmount, 0);
            assert.strictEqual(taxResult.totalTax, 0);
            assert.strictEqual(taxResult.grandTotal, 1000);

            pass("5.1 HSN 8201 resolves strictly to 0% (Exempt) per Notification No. 2/2017-Central Tax (Rate), Entry 113.");
        }

    } finally {
        adminModule.db.collection = originalCollection;
        adminModule.db.runTransaction = originalRunTransaction;
    }

    console.log("\n=========================================================================");
    console.log(`=== PHASE 2 VERIFICATION SUITE: ${passed} PASSED, ${failed} FAILED ===`);
    console.log("=========================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runPhase2TestSuite().catch(err => {
    console.error("FATAL SUITE ERROR:", err);
    process.exit(1);
});
