const assert = require('assert');
const sharp = require('sharp');
const adminModule = require('../core/admin');
const { handleImageUpload } = require('../media/imageProcessor');

console.log("=================================================================");
console.log("=== RUNNING CLOUD STORAGE WEBP IMAGE PROCESSOR TEST SUITE ===");
console.log("=================================================================\n");

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

async function runAllTests() {
    const originalCollection = adminModule.db.collection;
    const originalStorage = adminModule.storage.bucket;

    try {
        // Storage mock state
        const storageBuckets = new Map();
        function getOrCreateBucket(bucketName) {
            if (!storageBuckets.has(bucketName)) {
                storageBuckets.set(bucketName, new Map());
            }
            return storageBuckets.get(bucketName);
        }

        const mockBucket = {
            name: 'krishivishal-a9ed7.firebasestorage.app',
            file: function (filePath) {
                const bucketFiles = getOrCreateBucket(mockBucket.name);
                return {
                    save: async function (buffer, options) {
                        bucketFiles.set(filePath, { buffer, options });
                        return true;
                    },
                    download: async function () {
                        if (bucketFiles.has(filePath)) {
                            return [bucketFiles.get(filePath).buffer];
                        }
                        throw new Error(`Storage file not found: ${filePath}`);
                    }
                };
            }
        };

        adminModule.storage.bucket = function () {
            return mockBucket;
        };

        // Firestore mock state
        const firestoreStore = {
            products: new Map(),
            skus: new Map()
        };

        adminModule.db.collection = function (collName) {
            if (!firestoreStore[collName]) {
                firestoreStore[collName] = new Map();
            }
            const collectionMap = firestoreStore[collName];

            return {
                doc: function (docId) {
                    return {
                        id: docId,
                        get: async function () {
                            const exists = collectionMap.has(docId);
                            return {
                                exists,
                                data: () => collectionMap.get(docId)
                            };
                        },
                        set: async function (data, opts) {
                            const existing = (opts?.merge && collectionMap.get(docId)) || {};
                            collectionMap.set(docId, { ...existing, ...data });
                            return { id: docId };
                        },
                        update: async function (data) {
                            const existing = collectionMap.get(docId) || {};
                            collectionMap.set(docId, { ...existing, ...data });
                            return { id: docId };
                        }
                    };
                }
            };
        };

        // =================================================================
        // TEST CASE 1: Infinite Loop Prevention (Critical Recursion Guard)
        // =================================================================
        console.log("--- TEST CASE 1: Infinite Loop Prevention ---");
        try {
            const mockThumbObject = {
                name: 'products/urea_thumb_200.webp',
                contentType: 'image/webp',
                bucket: 'krishivishal-a9ed7.firebasestorage.app'
            };
            const resultThumb = await handleImageUpload(mockThumbObject);
            assert.strictEqual(resultThumb.status, 'SKIPPED_THUMBNAIL', 'Should return SKIPPED_THUMBNAIL for _thumb_200.webp');
            pass("1.1 Upload with name products/urea_thumb_200.webp returns early with status SKIPPED_THUMBNAIL");
        } catch (err) {
            fail("1.1 Infinite recursion guard for thumb_200 failed", err);
        }

        try {
            const mockMedObject = {
                name: 'products/urea_med_600.webp',
                contentType: 'image/webp',
                bucket: 'krishivishal-a9ed7.firebasestorage.app'
            };
            const resultMed = await handleImageUpload(mockMedObject);
            assert.strictEqual(resultMed.status, 'SKIPPED_THUMBNAIL', 'Should return SKIPPED_THUMBNAIL for _med_600.webp');
            pass("1.2 Upload with name products/urea_med_600.webp returns early with status SKIPPED_THUMBNAIL");
        } catch (err) {
            fail("1.2 Infinite recursion guard for med_600 failed", err);
        }

        // =================================================================
        // TEST CASE 2: Non-Image File Guard
        // =================================================================
        console.log("\n--- TEST CASE 2: Non-Image File Guard ---");
        try {
            const mockPdfObject = {
                name: 'invoices/order_123/invoice.pdf',
                contentType: 'application/pdf',
                bucket: 'krishivishal-a9ed7.firebasestorage.app'
            };
            const resultPdf = await handleImageUpload(mockPdfObject);
            assert.strictEqual(resultPdf.status, 'SKIPPED_NON_IMAGE', 'Should return SKIPPED_NON_IMAGE for application/pdf');
            pass("2.1 Upload with contentType application/pdf returns early with status SKIPPED_NON_IMAGE");
        } catch (err) {
            fail("2.1 Non-image guard for PDF failed", err);
        }

        try {
            const mockTextObject = {
                name: 'documents/report.txt',
                contentType: 'text/plain',
                bucket: 'krishivishal-a9ed7.firebasestorage.app'
            };
            const resultText = await handleImageUpload(mockTextObject);
            assert.strictEqual(resultText.status, 'SKIPPED_NON_IMAGE', 'Should return SKIPPED_NON_IMAGE for text/plain');
            pass("2.2 Upload with non-image text/plain returns early with status SKIPPED_NON_IMAGE");
        } catch (err) {
            fail("2.2 Non-image guard for text/plain failed", err);
        }

        // =================================================================
        // TEST CASE 3: WebP Variant Generation & Dimensions
        // =================================================================
        console.log("\n--- TEST CASE 3: WebP Variant Generation & Dimensions ---");
        try {
            // Generate a valid 1000x1000 PNG buffer using Sharp
            const original1000Buffer = await sharp({
                create: {
                    width: 1000,
                    height: 1000,
                    channels: 4,
                    background: { r: 52, g: 168, b: 83, alpha: 1 } // Agricultural Green
                }
            }).png().toBuffer();

            // Seed mock bucket with original image
            const originalPath = 'products/urea/main.png';
            getOrCreateBucket(mockBucket.name).set(originalPath, { buffer: original1000Buffer });

            // Seed firestore products doc
            firestoreStore.products.set('urea', { name: 'Neem Coated Urea', price: 266 });

            const mockImageObject = {
                name: originalPath,
                contentType: 'image/png',
                bucket: mockBucket.name
            };

            const uploadResult = await handleImageUpload(mockImageObject);
            assert.strictEqual(uploadResult.status, 'SUCCESS', 'Processing should complete with status SUCCESS');

            const bucketFiles = getOrCreateBucket(mockBucket.name);
            const expectedThumbPath = 'products/urea/main_thumb_200.webp';
            const expectedMedPath = 'products/urea/main_med_600.webp';

            // Assert: Both 200x200 and 600x600 WebP buffers are uploaded to target storage bucket
            assert(bucketFiles.has(expectedThumbPath), `Target bucket must contain ${expectedThumbPath}`);
            assert(bucketFiles.has(expectedMedPath), `Target bucket must contain ${expectedMedPath}`);

            const uploadedThumb = bucketFiles.get(expectedThumbPath);
            const uploadedMed = bucketFiles.get(expectedMedPath);

            assert.strictEqual(uploadedThumb.options?.contentType, 'image/webp', 'Thumb contentType must be image/webp');
            assert.strictEqual(uploadedMed.options?.contentType, 'image/webp', 'Med contentType must be image/webp');

            // Assert dimensions using Sharp
            const thumbMeta = await sharp(uploadedThumb.buffer).metadata();
            assert.strictEqual(thumbMeta.format, 'webp', 'Thumbnail format must be WebP');
            assert(thumbMeta.width <= 200 && thumbMeta.height <= 200, `Thumbnail dimensions must be <= 200x200, got ${thumbMeta.width}x${thumbMeta.height}`);

            const medMeta = await sharp(uploadedMed.buffer).metadata();
            assert.strictEqual(medMeta.format, 'webp', 'Medium format must be WebP');
            assert(medMeta.width <= 600 && medMeta.height <= 600, `Medium dimensions must be <= 600x600, got ${medMeta.width}x${medMeta.height}`);

            // Assert Firestore sync
            const updatedProductDoc = firestoreStore.products.get('urea');
            assert(updatedProductDoc.thumbnailUrl && updatedProductDoc.thumbnailUrl.includes('_thumb_200.webp'), 'thumbnailUrl must be updated in Firestore');
            assert(updatedProductDoc.mediumImageUrl && updatedProductDoc.mediumImageUrl.includes('_med_600.webp'), 'mediumImageUrl must be updated in Firestore');

            pass("3.1 Valid 1000x1000 PNG generates 200x200 and 600x600 WebP variants, uploads to bucket, and syncs Firestore");
        } catch (err) {
            fail("3.1 WebP variant generation and dimensions test failed", err);
        }

        // =================================================================
        // TEST CASE 4: SKU Upload & Firestore Sync
        // =================================================================
        console.log("\n--- TEST CASE 4: SKU Variant Upload & Firestore Sync ---");
        try {
            const originalSkuBuffer = await sharp({
                create: {
                    width: 800,
                    height: 800,
                    channels: 4,
                    background: { r: 251, g: 188, b: 5, alpha: 1 }
                }
            }).jpeg().toBuffer();

            const skuPath = 'skus/SKU_DAP_50KG/pack.jpeg';
            getOrCreateBucket(mockBucket.name).set(skuPath, { buffer: originalSkuBuffer });
            firestoreStore.skus.set('SKU_DAP_50KG', { title: 'DAP 50kg Bag' });

            const mockSkuObject = {
                name: skuPath,
                contentType: 'image/jpeg',
                bucket: mockBucket.name
            };

            const skuResult = await handleImageUpload(mockSkuObject);
            assert.strictEqual(skuResult.status, 'SUCCESS');

            const bucketFiles = getOrCreateBucket(mockBucket.name);
            assert(bucketFiles.has('skus/SKU_DAP_50KG/pack_thumb_200.webp'));
            assert(bucketFiles.has('skus/SKU_DAP_50KG/pack_med_600.webp'));

            const updatedSkuDoc = firestoreStore.skus.get('SKU_DAP_50KG');
            assert(updatedSkuDoc.thumbnailUrl && updatedSkuDoc.thumbnailUrl.includes('pack_thumb_200.webp'));
            assert(updatedSkuDoc.mediumImageUrl && updatedSkuDoc.mediumImageUrl.includes('pack_med_600.webp'));

            pass("4.1 SKU upload accurately generates WebP variants and updates skus Firestore document");
        } catch (err) {
            fail("4.1 SKU upload test failed", err);
        }

        // =================================================================
        // TEST CASE 5: Lazy Loading in index.js
        // =================================================================
        console.log("\n--- TEST CASE 5: Index.js Integration & Export ---");
        try {
            const indexExports = require('../index');
            assert.strictEqual(typeof indexExports.generateWebPThumbnails, 'function', 'generateWebPThumbnails must be exported as a function');
            assert(indexExports.generateWebPThumbnails.__trigger, 'generateWebPThumbnails must be a Cloud Function trigger');
            pass("5.1 generateWebPThumbnails is properly exported on index.js with lazy loading");
        } catch (err) {
            fail("5.1 Lazy loading export verification failed", err);
        }

    } finally {
        adminModule.db.collection = originalCollection;
        adminModule.storage.bucket = originalStorage;
    }

    console.log("\n=================================================================");
    console.log(`IMAGE PROCESSOR TESTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runAllTests().catch((err) => {
    console.error("Unhandled rejection in tests:", err);
    process.exit(1);
});
