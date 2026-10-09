const assert = require('assert');
const adminModule = require('../core/admin');
const {
    escapeXml,
    formatTallyDate,
    mapToTallyVoucherType,
    renderLedgerMastersXml,
    renderVoucherXml,
    generateTallyPrimeEnvelope,
    exportTallyXml,
    COMPANY_NAME
} = require('../finance/tallyExportEngine');

console.log("=======================================================================");
console.log("=== RUNNING SPRINT 11: TALLYPRIME / ERP XML EXPORT ENGINE TEST SUITE ===");
console.log("=======================================================================\n");

let passed = 0;
let failed = 0;

function pass(testName) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
}

function fail(testName, err) {
    console.error(`❌ FAIL: ${testName} - ${err.message || err}`);
    failed++;
}

async function runTallyExportTestSuite() {
    try {
        // --- 1. XML CHARACTER SANITIZATION ---
        console.log("--- PART 1: XML Character Sanitization ---");
        const raw = `Krishi & Vishal <Agro> "Pvt" 'Ltd'`;
        const sanitized = escapeXml(raw);
        assert.strictEqual(sanitized, "Krishi &amp; Vishal &lt;Agro&gt; &quot;Pvt&quot; &apos;Ltd&apos;");
        pass("1.1 XML Entities escaped properly (&, <, >, \", ')");

        // --- 2. TALLY DATE FORMATTING ---
        console.log("\n--- PART 2: Date Formatting (YYYYMMDD) ---");
        const testDate = new Date(2026, 9, 9); // Oct 9, 2026
        const formatted = formatTallyDate(testDate);
        assert.strictEqual(formatted, "20261009");
        pass("2.1 Tally date formatted to strict YYYYMMDD (20261009)");

        // --- 3. VOUCHER TYPE MAPPING ---
        console.log("\n--- PART 3: Voucher Type Mappings ---");
        assert.strictEqual(mapToTallyVoucherType("ORDER_DELIVERY"), "Sales");
        assert.strictEqual(mapToTallyVoucherType("PURCHASE_GRN"), "Purchase");
        assert.strictEqual(mapToTallyVoucherType("RIDER_SETTLEMENT"), "Receipt");
        assert.strictEqual(mapToTallyVoucherType("SUPPLIER_PAYMENT"), "Payment");
        assert.strictEqual(mapToTallyVoucherType("COGS_MATCHING"), "Journal");
        pass("3.1 Canonical refTypes correctly map to Sales, Purchase, Receipt, Payment, Journal");

        // --- 4. LEDGER MASTERS RENDERING ---
        console.log("\n--- PART 4: Ledger Masters Generation ---");
        const mastersXml = renderLedgerMastersXml();
        assert.ok(mastersXml.includes(`<LEDGER NAME="HDFC Current Account (Main Op)" ACTION="Create">`));
        assert.ok(mastersXml.includes(`<PARENT>Bank Accounts</PARENT>`));
        assert.ok(mastersXml.includes(`<LEDGER NAME="Output CGST Payable" ACTION="Create">`));
        assert.ok(mastersXml.includes(`<PARENT>Duties &amp; Taxes</PARENT>`));
        pass("4.1 Chart of Accounts rendered as Tally Master Ledgers with standard parent groups");

        // --- 5. VOUCHER RENDERING & DEBIT/CREDIT CONVENTIONS ---
        console.log("\n--- PART 5: Debit/Credit Sign Conventions & Balance Guarantee ---");
        const entry = {
            id: "JE_001",
            invoiceNumber: "KV/26-27/00001",
            refType: "ORDER_DELIVERY",
            date: new Date(2026, 9, 9),
            description: "Delivery of Order KVR123"
        };
        const balancedLines = [
            { accountCode: "1010_CASH_IN_HAND_RIDERS", debit: 1180, credit: 0 },
            { accountCode: "4010_SALES_AGRI_INPUTS", debit: 0, credit: 1000 },
            { accountCode: "2020_OUTPUT_CGST_PAYABLE", debit: 0, credit: 90 },
            { accountCode: "2030_OUTPUT_SGST_PAYABLE", debit: 0, credit: 90 }
        ];

        const voucherRes = renderVoucherXml(entry, balancedLines);
        assert.strictEqual(voucherRes.isBalanced, true);
        assert.strictEqual(voucherRes.totalDebit, 1180);
        assert.strictEqual(voucherRes.totalCredit, 1180);
        // Debit must have ISDEEMEDPOSITIVE=Yes and -1180.00
        assert.ok(voucherRes.xml.includes(`<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n              <AMOUNT>-1180.00</AMOUNT>`));
        // Credit must have ISDEEMEDPOSITIVE=No and 1000.00
        assert.ok(voucherRes.xml.includes(`<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n              <AMOUNT>1000.00</AMOUNT>`));
        pass("5.1 Mathematical balance and ISDEEMEDPOSITIVE sign conventions verified");

        // Imbalance check
        const unbalancedLines = [
            { accountCode: "1010_CASH_IN_HAND_RIDERS", debit: 1180, credit: 0 },
            { accountCode: "4010_SALES_AGRI_INPUTS", debit: 0, credit: 1000 } // missing tax -> 180 imbalance
        ];
        const unbalRes = renderVoucherXml(entry, unbalancedLines);
        assert.strictEqual(unbalRes.isBalanced, false);
        assert.strictEqual(unbalRes.xml, "");
        pass("5.2 Imbalanced voucher rejected from export");

        // --- 6. ROOT ENVELOPE STRUCTURE ---
        console.log("\n--- PART 6: Full Envelope & Company Tag Compliance ---");
        const envelope = generateTallyPrimeEnvelope({
            records: [{ entry, lines: balancedLines }]
        });
        assert.strictEqual(envelope.exportedVouchersCount, 1);
        assert.strictEqual(envelope.skippedVouchersCount, 0);
        assert.strictEqual(envelope.totalDebit, 1180);
        assert.strictEqual(envelope.totalCredit, 1180);
        assert.ok(envelope.xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>`));
        assert.ok(envelope.xml.includes(`<TALLYREQUEST>Import Data</TALLYREQUEST>`));
        assert.ok(envelope.xml.includes(`<REPORTNAME>All Masters and Vouchers</REPORTNAME>`));
        assert.ok(envelope.xml.includes(`<SVCURRENTCOMPANY>${COMPANY_NAME}</SVCURRENTCOMPANY>`));
        assert.ok(envelope.xml.endsWith(`</ENVELOPE>\n`));
        pass("6.1 Complete XML Envelope strictly conforms to TallyPrime import format");

        // --- 7. EXPORT TALLY XML SERVICE WITH FIRESTORE MOCK ---
        console.log("\n--- PART 7: exportTallyXml Firestore Integration ---");
        const originalCollection = adminModule.db.collection;
        try {
            const store = {
                journal_entries: new Map(),
                lines: new Map()
            };

            const eId = "JE_202610_001";
            store.journal_entries.set(eId, {
                entryId: eId,
                periodId: "2026-10",
                refType: "ORDER_DELIVERY",
                invoiceNumber: "KV/26-27/00001",
                description: "Sales to farmer",
                date: new Date(2026, 9, 9)
            });
            store.lines.set(eId, balancedLines);

            adminModule.db.collection = function (colName) {
                if (colName === "journal_entries") {
                    return {
                        where: () => ({
                            get: async () => ({
                                docs: Array.from(store.journal_entries.entries()).map(([id, data]) => ({
                                    id,
                                    data: () => data,
                                    ref: {
                                        collection: (subCol) => ({
                                            get: async () => ({
                                                docs: (store.lines.get(id) || []).map(line => ({
                                                    data: () => line
                                                }))
                                            })
                                        })
                                    }
                                }))
                            })
                        }),
                        get: async () => ({
                            docs: Array.from(store.journal_entries.entries()).map(([id, data]) => ({
                                id,
                                data: () => data,
                                ref: {
                                    collection: (subCol) => ({
                                        get: async () => ({
                                            docs: (store.lines.get(id) || []).map(line => ({
                                                data: () => line
                                            }))
                                        })
                                    })
                                }
                            }))
                        })
                    };
                }
                return originalCollection.call(adminModule.db, colName);
            };

            const exportRes = await exportTallyXml({ periodId: "2026-10", voucherTypeFilter: "ALL" });
            assert.strictEqual(exportRes.success, true);
            assert.strictEqual(exportRes.exportedVouchersCount, 1);
            assert.strictEqual(exportRes.totalDebit, 1180);
            assert.strictEqual(exportRes.totalCredit, 1180);
            assert.ok(exportRes.byteLength > 100);
            assert.ok(exportRes.xmlContent.includes("<ENVELOPE>"));
            pass("7.1 exportTallyXml successfully generates payload with byteLength and vouchers");

        } finally {
            adminModule.db.collection = originalCollection;
        }

        // --- 8. INDEX.JS LAZY EXPORT VERIFICATION ---
        console.log("\n--- PART 8: Index.js Module Integration ---");
        const indexExports = require('../index');
        assert.strictEqual(typeof indexExports.exportTallyXml, 'function', 'exportTallyXml must be exported from index.js');
        pass("8.1 exportTallyXml exported cleanly on index.js with on-demand lazy loading");

    } catch (err) {
        fail("Tally Export Suite Exception", err);
    }

    console.log("\n=======================================================================");
    console.log(`SPRINT 11 TALLY EXPORT TESTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("=======================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTallyExportTestSuite().catch(err => {
    console.error("Unhandled test suite failure:", err);
    process.exit(1);
});
