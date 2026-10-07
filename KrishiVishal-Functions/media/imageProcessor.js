/**
 * KrishiVishal Cloud Storage WebP Image Resizing Pipeline
 * Automatically generates 200x200 and 600x600 WebP variants on upload.
 * Enforces strict recursion guards and syncs URLs to Firestore products/skus.
 */

const { randomUUID } = require('crypto');
const { admin, db, storage } = require('../core/admin');

// Allowed image MIME types
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Core image processing handler.
 * Can be invoked by Cloud Storage trigger or directly in tests.
 *
 * @param {Object} input Cloud Storage object metadata or mock object
 * @returns {Promise<Object>} Execution result with status and variant URLs
 */
async function handleImageUpload(input) {
    const object = input?.data ? input.data : input;
    const filePath = object?.name || '';

    // 1. Critical Infinite Recursion Guard:
    // If the file is already an image variant (_thumb_200.webp or _med_600.webp), skip immediately.
    if (filePath.includes('_thumb_200.webp') || filePath.includes('_med_600.webp')) {
        console.log(`[imageProcessor] Recursion guard: Skipping generated variant ${filePath}`);
        return { status: 'SKIPPED_THUMBNAIL' };
    }

    // 2. Non-Image File Guard:
    // Only process image/jpeg, image/png, and image/webp files.
    const rawContentType = object?.contentType || '';
    const contentType = rawContentType.split(';')[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        console.log(`[imageProcessor] Non-image guard: Skipping contentType '${rawContentType}' for ${filePath}`);
        return { status: 'SKIPPED_NON_IMAGE' };
    }

    if (!filePath) {
        console.warn('[imageProcessor] Missing file name in storage object');
        return { status: 'SKIPPED_NO_FILE' };
    }

    // 3. Resolve Target Bucket
    const bucketName = (typeof object.bucket === 'string' && object.bucket)
        ? object.bucket
        : (storage.bucket().name || process.env.STORAGE_BUCKET || 'krishivishal-a9ed7.firebasestorage.app');

    let bucket;
    if (object.bucket && typeof object.bucket === 'object' && typeof object.bucket.file === 'function') {
        bucket = object.bucket;
    } else {
        bucket = storage.bucket(bucketName);
    }

    // 4. Obtain Image Buffer (Download from bucket if not provided in mock)
    let buffer = object.buffer;
    if (!buffer) {
        const file = bucket.file(filePath);
        const downloadRes = await file.download();
        buffer = Array.isArray(downloadRes) ? downloadRes[0] : downloadRes;
    }

    // 5. Generate WebP Variants using Sharp (Lazy required to preserve cold start)
    const sharp = require('sharp');

    const thumbBuffer = await sharp(buffer)
        .resize(200, 200, { fit: 'inside' })
        .webp({ quality: 80 })
        .toBuffer();

    const mediumBuffer = await sharp(buffer)
        .resize(600, 600, { fit: 'inside' })
        .webp({ quality: 85 })
        .toBuffer();

    // 6. Build Target Variant Paths (saving in the same bucket at the same path)
    // Strip original extension (e.g. products/urea.png -> products/urea)
    const extIndex = filePath.lastIndexOf('.');
    const basePath = extIndex !== -1 ? filePath.substring(0, extIndex) : filePath;

    const thumbPath = `${basePath}_thumb_200.webp`;
    const medPath = `${basePath}_med_600.webp`;

    const thumbToken = randomUUID();
    const medToken = randomUUID();

    // 7. Upload Both Variants to Cloud Storage
    const thumbFile = bucket.file(thumbPath);
    await thumbFile.save(thumbBuffer, {
        contentType: 'image/webp',
        metadata: {
            contentType: 'image/webp',
            metadata: {
                firebaseStorageDownloadTokens: thumbToken
            }
        },
        resumable: false
    });

    const medFile = bucket.file(medPath);
    await medFile.save(mediumBuffer, {
        contentType: 'image/webp',
        metadata: {
            contentType: 'image/webp',
            metadata: {
                firebaseStorageDownloadTokens: medToken
            }
        },
        resumable: false
    });

    const resolvedBucketName = bucket.name || bucketName;
    const thumbUrl = `https://firebasestorage.googleapis.com/v0/b/${resolvedBucketName}/o/${encodeURIComponent(thumbPath)}?alt=media&token=${thumbToken}`;
    const mediumUrl = `https://firebasestorage.googleapis.com/v0/b/${resolvedBucketName}/o/${encodeURIComponent(medPath)}?alt=media&token=${medToken}`;

    // 8. Firestore Sync:
    // If the upload path matches products/{productId}/ or skus/{skuId}/, atomically update doc
    let targetCollection = null;
    let targetDocId = null;

    const productSubMatch = filePath.match(/^products\/([^/]+)\//);
    const skuSubMatch = filePath.match(/^skus\/([^/]+)\//);

    if (productSubMatch) {
        targetCollection = 'products';
        targetDocId = productSubMatch[1];
    } else if (skuSubMatch) {
        targetCollection = 'skus';
        targetDocId = skuSubMatch[1];
    } else if (filePath.startsWith('products/')) {
        const parts = filePath.split('/');
        if (parts.length === 2) {
            targetCollection = 'products';
            targetDocId = parts[1].replace(/\.[^/.]+$/, '');
        }
    } else if (filePath.startsWith('skus/')) {
        const parts = filePath.split('/');
        if (parts.length === 2) {
            targetCollection = 'skus';
            targetDocId = parts[1].replace(/\.[^/.]+$/, '');
        }
    }

    if (targetCollection && targetDocId && db) {
        const docRef = db.collection(targetCollection).doc(targetDocId);
        const serverTimestamp = admin?.firestore?.FieldValue?.serverTimestamp
            ? admin.firestore.FieldValue.serverTimestamp()
            : new Date().toISOString();

        const updateData = {
            thumbnailUrl: thumbUrl,
            mediumImageUrl: mediumUrl,
            updatedAt: serverTimestamp
        };

        try {
            await docRef.update(updateData);
        } catch (err) {
            await docRef.set(updateData, { merge: true });
        }
        console.log(`[imageProcessor] Synced WebP URLs to ${targetCollection}/${targetDocId}`);
    }

    return {
        status: 'SUCCESS',
        thumbnailUrl: thumbUrl,
        mediumImageUrl: mediumUrl,
        thumbPath,
        mediumPath: medPath,
        thumbBuffer,
        mediumBuffer,
        collection: targetCollection,
        docId: targetDocId
    };
}

let _trigger;
function getStorageTrigger() {
    if (!_trigger) {
        if (!process.env.FIREBASE_CONFIG && !process.env.GCLOUD_PROJECT) {
            process.env.GCLOUD_PROJECT = 'krishivishal-a9ed7';
            process.env.FIREBASE_CONFIG = JSON.stringify({
                projectId: 'krishivishal-a9ed7',
                storageBucket: 'krishivishal-a9ed7.firebasestorage.app'
            });
        }
        const functions = require('firebase-functions/v1');
        _trigger = functions.storage.object().onFinalize(async (object) => {
            return handleImageUpload(object);
        });
    }
    return _trigger;
}

module.exports = {
    handleImageUpload,
    get generateWebPThumbnails() {
        return getStorageTrigger();
    }
};
