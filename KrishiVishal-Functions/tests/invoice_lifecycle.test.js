const assert = require('assert');
const QRCode = require('qrcode');
const adminModule = require('../core/admin');
const { generateAndUploadInvoice, buildInvoicePdfBuffer } = require('../invoices/invoiceService');
const { generateInvoicePdf } = require('../index');

console.log("=== RUNNING INVOICE LIFECYCLE & PDF GENERATION TESTS ===\n");

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`FAIL: ${name} - ${err.message || err}`);
    failed++;
}

async function runTests() {
    // ─────────────────────────────────────────────────────────────
    // TEST SUITE 1: PDFKit Buffer Generation Unit Tests
    // ─────────────────────────────────────────────────────────────
    console.log("--- 1. PDFKit In-Memory Buffer Generation ---");

    // Test 1.1: Standard PDF generation
    try {
        const hub = {
            brand: 'KRISHI VISHAL',
            subtitle: 'Bihar Fast Rural Agri Logistics & Dispatch',
            name: 'Samastipur Central Hub',
            code: 'HUB-SAM-001',
            address: 'Station Road, Near Block Chowk, Samastipur, Bihar - 848101',
            gstin: '10AAACK9821M1Z5',
            stateCode: '10 (Bihar)',
            helpline: '1800-890-AGRICONNECT'
        };
        const orderMeta = {
            invoiceNumber: 'KV/SAM/2026/TEST0001',
            orderId: 'ORDER_12345678',
            dateStr: '01/10/2026',
            paymentMethod: 'COD',
            paymentStatus: 'Pending'
        };
        const buyer = {
            name: 'Ramesh Kumar',
            phone: '9876543210',
            address: 'Village Rampur, Samastipur, Bihar - 848101'
        };
        const items = [
            {
                productName: 'Organic Urea Fertilizer 50kg',
                variantLabel: '50kg Bag',
                hsnCode: '3102',
                quantity: 2,
                price: 450,
                lineTotal: 900
            },
            {
                productName: 'Neem Oil Pest Spray 500ml',
                variantLabel: '500ml Bottle',
                hsnCode: '3808',
                quantity: 1,
                price: 250,
                lineTotal: 250
            }
        ];
        const financials = {
            subtotal: 1150,
            totalDiscount: 50,
            taxableTotal: 1100,
            totalTax: 55,
            deliveryCharges: 0,
            totalAmount: 1155
        };

        const buffer = await buildInvoicePdfBuffer({
            hub,
            orderMeta,
            buyer,
            items,
            financials,
            clearTax: null,
            qrBuffer: null
        });

        assert(Buffer.isBuffer(buffer), 'Output must be a Node.js Buffer');
        assert(buffer.length > 500, `Buffer length (${buffer.length}) should be non-trivial PDF`);
        assert.strictEqual(buffer.slice(0, 4).toString(), '%PDF', 'Buffer must start with %PDF header');
        pass("1.1 Standard PDF invoice buffer renders cleanly without runtime errors");
    } catch (err) {
        fail("1.1 Standard PDF invoice buffer renders cleanly without runtime errors", err);
    }

    // Test 1.2: PDF with ClearTax IRN, Ack details & QR code
    try {
        const hub = {
            brand: 'KRISHI VISHAL',
            subtitle: 'Bihar Fast Rural Agri Logistics & Dispatch',
            name: 'Samastipur Central Hub',
            code: 'HUB-SAM-001',
            address: 'Station Road, Near Block Chowk, Samastipur, Bihar - 848101',
            gstin: '10AAACK9821M1Z5',
            stateCode: '10 (Bihar)',
            helpline: '1800-890-AGRICONNECT'
        };
        const orderMeta = {
            invoiceNumber: 'KV/SAM/2026/TEST0002',
            orderId: 'ORDER_87654321',
            dateStr: '01/10/2026',
            paymentMethod: 'PREPAID',
            paymentStatus: 'PAID'
        };
        const buyer = {
            name: 'Kisan FPO Ltd.',
            phone: '9123456780',
            address: 'Purnea Mandi, Purnea, Bihar - 854301'
        };
        const items = [
            {
                productName: 'Hybrid Wheat Seeds 10kg',
                variantLabel: '10kg',
                hsnCode: '1209',
                quantity: 5,
                price: 600,
                lineTotal: 3000
            }
        ];
        const financials = {
            subtotal: 3000,
            totalDiscount: 0,
            taxableTotal: 3000,
            totalTax: 150,
            deliveryCharges: 50,
            totalAmount: 3200
        };

        const testIrn = '72c3d189bb48c6f1406847cbb6509f6b92f98e09f58f7004fdb88d744b58e7a0';
        const qrBuffer = await QRCode.toBuffer(JSON.stringify({ Irn: testIrn, TotInvVal: 3200 }));

        const buffer = await buildInvoicePdfBuffer({
            hub,
            orderMeta,
            buyer,
            items,
            financials,
            clearTax: {
                irn: testIrn,
                ackNo: '122610012345678',
                ackDate: '2026-10-01 14:30:00'
            },
            qrBuffer
        });

        assert(Buffer.isBuffer(buffer), 'Output must be a Node.js Buffer');
        assert(buffer.length > 1000, 'Buffer with embedded QR must be valid');
        assert.strictEqual(buffer.slice(0, 4).toString(), '%PDF', 'Buffer must start with %PDF header');
        pass("1.2 ClearTax GST E-Invoice with IRN, Ack metadata and QR code renders cleanly");
    } catch (err) {
        fail("1.2 ClearTax GST E-Invoice with IRN, Ack metadata and QR code renders cleanly", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST SUITE 2: Storage Upload & Firestore Lifecycle Tests
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 2. Storage Upload and Firestore Lifecycle ---");

    // Test 2.1: Missing orderId throws error
    try {
        await generateAndUploadInvoice(null);
        fail("2.1 Missing orderId check", new Error("Should have thrown error for missing orderId"));
    } catch (err) {
        if (err.message.includes('Missing orderId')) {
            pass("2.1 generateAndUploadInvoice rejects null/empty orderId");
        } else {
            fail("2.1 generateAndUploadInvoice rejects null/empty orderId", err);
        }
    }

    // Setup mocks for Firestore and Storage
    const originalCollection = adminModule.db.collection;
    const originalBucket = adminModule.storage.bucket;

    const mockOrdersStore = new Map();
    let savedStorageFiles = [];

    // Mock Firestore collection & doc
    adminModule.db.collection = function (collName) {
        if (collName === 'orders') {
            return {
                doc: function (docId) {
                    return {
                        get: async function () {
                            const exists = mockOrdersStore.has(docId);
                            return {
                                exists,
                                id: docId,
                                data: () => exists ? mockOrdersStore.get(docId) : null
                            };
                        },
                        update: async function (updates) {
                            if (!mockOrdersStore.has(docId)) {
                                throw new Error(`Document ${docId} does not exist`);
                            }
                            const current = mockOrdersStore.get(docId);
                            const merged = { ...current, ...updates };
                            mockOrdersStore.set(docId, merged);
                            return merged;
                        }
                    };
                }
            };
        }
        return originalCollection.call(adminModule.db, collName);
    };

    // Mock Cloud Storage bucket & file
    const mockBucketInstance = {
        name: 'krishivishal-test.appspot.com',
        file: function (storagePath) {
            return {
                save: async function (buffer, options) {
                    savedStorageFiles.push({
                        path: storagePath,
                        bufferSize: buffer.length,
                        options
                    });
                    return true;
                }
            };
        }
    };
    adminModule.storage.bucket = function () {
        return mockBucketInstance;
    };

    // Test 2.2: Non-existent order in Firestore throws error
    try {
        await generateAndUploadInvoice('ORDER_NON_EXISTENT');
        fail("2.2 Non-existent order check", new Error("Should have thrown not found error"));
    } catch (err) {
        if (err.message.includes('Order not found')) {
            pass("2.2 generateAndUploadInvoice throws when order does not exist");
        } else {
            fail("2.2 generateAndUploadInvoice throws when order does not exist", err);
        }
    }

    // Test 2.3: End-to-end generateAndUploadInvoice with Storage and Firestore updates
    try {
        savedStorageFiles = [];
        const testOrderId = 'ORD_998877';
        mockOrdersStore.set(testOrderId, {
            id: testOrderId,
            userName: 'Suresh Patel',
            userPhone: '9876501234',
            address: {
                village: 'Kalyanpur',
                district: 'Samastipur',
                state: 'Bihar',
                pincode: '848102'
            },
            items: [
                { productName: 'DAP Fertilizer 50kg', variantLabel: '50kg', hsnCode: '3105', quantity: 2, price: 1350 },
                { productName: 'Bio Fungicide 250g', variantLabel: '250g', hsnCode: '3808', quantity: 1, price: 320 }
            ],
            subtotal: 3020,
            totalDiscount: 100,
            taxableTotal: 2920,
            totalTax: 146,
            deliveryCharges: 0,
            totalAmount: 3066,
            paymentMethod: 'COD',
            paymentStatus: 'Pending',
            createdAt: { toDate: () => new Date('2026-10-01T10:00:00Z') }
        });

        const clearTaxMockData = {
            status: 'SUCCESS',
            provider: 'CLEARTAX',
            operation: 'E_INVOICE_GEN',
            providerReferenceId: 'IRN-CLEARTAX-TEST-001',
            data: {
                irn: 'IRN-CLEARTAX-TEST-001',
                AckNo: 'ACK99887711',
                AckDt: '2026-10-01 10:05:00',
                SignedQRCode: 'QR_MOCK_SIGNED_STRING_KRISHI_VISHAL'
            }
        };

        const result = await generateAndUploadInvoice(testOrderId, clearTaxMockData);

        // Verify function return payload
        assert.strictEqual(result.success, true, 'Result success must be true');
        assert(result.invoiceNumber.includes(testOrderId.slice(-8).toUpperCase()), 'Invoice number should incorporate orderId');
        assert(result.downloadUrl.includes('firebasestorage.googleapis.com'), 'Download URL should be standard Firebase Storage URL');
        assert(result.downloadUrl.includes('token='), 'Download URL must have security download token');

        // Verify storage file save
        assert.strictEqual(savedStorageFiles.length, 1, 'Exactly one PDF file should be uploaded to storage');
        const uploadedFile = savedStorageFiles[0];
        assert(uploadedFile.path.startsWith(`invoices/${testOrderId}/INV_`), `Storage path must match schema: invoices/${testOrderId}/INV_...`);
        assert(uploadedFile.path.endsWith('.pdf'), 'Storage file path must end with .pdf');
        assert.strictEqual(uploadedFile.options.contentType, 'application/pdf');
        assert(uploadedFile.bufferSize > 500, 'Uploaded buffer size must be valid');

        // Verify Firestore order document was updated
        const updatedOrder = mockOrdersStore.get(testOrderId);
        assert.strictEqual(updatedOrder.invoiceUrl, result.downloadUrl, 'order.invoiceUrl must match generated downloadUrl');
        assert.strictEqual(updatedOrder.invoice.status, 'GENERATED', 'invoice status must be GENERATED');
        assert.strictEqual(updatedOrder.invoice.pdfUrl, result.downloadUrl, 'invoice.pdfUrl must match downloadUrl');
        assert.strictEqual(updatedOrder.invoice.storagePath, uploadedFile.path, 'invoice.storagePath must match uploaded file path');
        assert.strictEqual(updatedOrder.invoice.irn, 'IRN-CLEARTAX-TEST-001', 'invoice.irn must match clearTax irn');

        pass("2.3 generateAndUploadInvoice successfully uploads PDF to Storage and updates Firestore order doc");
    } catch (err) {
        fail("2.3 generateAndUploadInvoice successfully uploads PDF to Storage and updates Firestore order doc", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST SUITE 3: Gen 2 Callable Function Verification
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 3. Gen 2 Callable generateInvoicePdf Function ---");

    // Test 3.1: Reject unauthenticated caller
    try {
        await generateInvoicePdf.run({ auth: null, data: { orderId: 'ORD_123' } });
        fail("3.1 Unauthenticated caller check", new Error("Should reject unauthenticated caller"));
    } catch (err) {
        if (err.code === 'unauthenticated' || err.message.includes('unauthenticated')) {
            pass("3.1 generateInvoicePdf denies unauthenticated request with 'unauthenticated'");
        } else {
            fail("3.1 generateInvoicePdf denies unauthenticated request with 'unauthenticated'", err);
        }
    }

    // Test 3.2: Reject missing orderId
    try {
        await generateInvoicePdf.run({ auth: { uid: 'user_123' }, data: {} });
        fail("3.2 Missing orderId check", new Error("Should reject request without orderId"));
    } catch (err) {
        if (err.code === 'invalid-argument' || err.message.includes('Missing orderId')) {
            pass("3.2 generateInvoicePdf denies request without orderId with 'invalid-argument'");
        } else {
            fail("3.2 generateInvoicePdf denies request without orderId with 'invalid-argument'", err);
        }
    }

    // Test 3.3: Authenticated caller with valid order generates invoice
    try {
        const testOrderId = 'ORD_CALLABLE_TEST';
        mockOrdersStore.set(testOrderId, {
            id: testOrderId,
            userName: 'Mahesh Sharma',
            userPhone: '9811223344',
            address: 'Samastipur',
            items: [{ productName: 'Mustard Seeds 5kg', quantity: 1, price: 400 }],
            totalAmount: 400
        });

        const res = await generateInvoicePdf.run({
            auth: { uid: 'admin_test' },
            data: { orderId: testOrderId }
        });

        assert.strictEqual(res.success, true);
        assert(res.downloadUrl.includes('firebasestorage.googleapis.com'));
        pass("3.3 generateInvoicePdf succeeds for authenticated caller with valid order");
    } catch (err) {
        fail("3.3 generateInvoicePdf succeeds for authenticated caller with valid order", err);
    }

    // Restore original methods
    adminModule.db.collection = originalCollection;
    adminModule.storage.bucket = originalBucket;

    // ─────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────
    console.log("\n==========================================");
    console.log(`INVOICE LIFECYCLE TESTS: ${passed} PASSED, ${failed} FAILED.`);
    console.log("==========================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error("FATAL ERROR IN TEST RUNNER:", err);
    process.exit(1);
});
