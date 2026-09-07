const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// Ensure db is available
const db = admin.firestore();

/**
 * Scheduled function to check for expiring documents every day at midnight IST.
 * Finds documents expiring within 90, 60, 30, 15, 7 days or today,
 * updates expired statuses, logs audit trail, and generates alert notifications.
 */
exports.processDocumentExpiry = functions.pubsub.schedule('every day 00:00')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    console.log('Running daily document expiry check...');
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    try {
      // 1. Fetch active documents that have an expiryDate
      const activeDocsSnap = await db.collection('workforce_documents')
        .where('isCurrentVersion', '==', true)
        .where('retentionStatus', '==', 'ACTIVE')
        .get();

      let expiredCount = 0;
      let expiringSoonCount = 0;
      const batch = db.batch();
      let batchOperations = 0;

      for (const docSnap of activeDocsSnap.docs) {
        const data = docSnap.data();
        if (!data.expiryDate) continue;

        const expiryDate = new Date(data.expiryDate);
        const diffTime = expiryDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 0 && data.verificationStatus !== 'EXPIRED') {
          // Document has expired
          batch.update(docSnap.ref, {
            verificationStatus: 'EXPIRED',
            isExpired: true,
            expiredAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Create notification alert
          const alertRef = db.collection('notifications').doc();
          batch.set(alertRef, {
            type: 'DOCUMENT_EXPIRED',
            title: `Document Expired: ${data.documentName || data.documentType}`,
            message: `Document ${data.documentName || data.documentType} for ${data.ownerType} (${data.ownerId}) expired on ${data.expiryDate}.`,
            ownerId: data.ownerId,
            ownerType: data.ownerType,
            documentId: docSnap.id,
            severity: 'HIGH',
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          expiredCount++;
          batchOperations += 2;
        } else if (diffDays > 0 && diffDays <= 30) {
          // Expiring within 30 days
          expiringSoonCount++;
          
          if ([30, 15, 7, 3, 1].includes(diffDays)) {
            const alertRef = db.collection('notifications').doc();
            batch.set(alertRef, {
              type: 'DOCUMENT_EXPIRING_SOON',
              title: `Document Expiring in ${diffDays} days`,
              message: `Document ${data.documentName || data.documentType} for ${data.ownerType} (${data.ownerId}) expires on ${data.expiryDate}.`,
              ownerId: data.ownerId,
              ownerType: data.ownerType,
              documentId: docSnap.id,
              daysRemaining: diffDays,
              severity: diffDays <= 7 ? 'HIGH' : 'MEDIUM',
              read: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            batchOperations++;
          }
        }

        // Commit batches if limit is reached
        if (batchOperations >= 400) {
          await batch.commit();
          batchOperations = 0;
        }
      }

      if (batchOperations > 0) {
        await batch.commit();
      }

      // Log Expiry Cron Audit Record
      await db.collection('audit_logs').add({
        action: 'PROCESS_DOCUMENT_EXPIRY_CRON',
        resource: 'WorkforceDocuments',
        resourceId: `CRON-${todayStr}`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: {
          scanned: activeDocsSnap.size,
          expiredCount,
          expiringSoonCount,
          executionDate: todayStr,
        },
      });

      console.log(`Document expiry check completed. Scanned: ${activeDocsSnap.size}, Expired: ${expiredCount}, Expiring Soon: ${expiringSoonCount}`);
      return { success: true, scanned: activeDocsSnap.size, expiredCount, expiringSoonCount };
    } catch (error) {
      console.error('Error in processDocumentExpiry cron:', error);
      throw error;
    }
  });

/**
 * Callable function to secure access to sensitive workforce documents.
 * Verifies caller has required role/permission before providing secure access or download URL.
 */
exports.getSecureDocumentAccess = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const { documentId } = data;
  if (!documentId) {
    throw new functions.https.HttpsError('invalid-argument', 'documentId is required');
  }

  try {
    // 1. Fetch document metadata
    const docRef = await db.collection('workforce_documents').doc(documentId).get();
    if (!docRef.exists) {
      throw new functions.https.HttpsError('not-found', 'Document not found');
    }
    
    const docData = docRef.data();
    const callerUid = context.auth.uid;
    
    // 2. Fetch caller role
    let isAdmin = context.auth.token && (context.auth.token.admin === true || ['SuperAdmin', 'HRAdmin', 'Admin'].includes(context.auth.token.role));
    
    if (!isAdmin) {
      const userRef = await db.collection('users').doc(callerUid).get();
      if (userRef.exists) {
        const userData = userRef.data();
        isAdmin = userData.isAdmin === true || ['SuperAdmin', 'HRAdmin', 'Admin'].includes(userData.role);
      }
    }

    const isOwner = docData.ownerId === callerUid;

    if (!isOwner && !isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Unauthorized access to document');
    }

    // 3. Log document access in audit logs
    await db.collection('audit_logs').add({
      action: 'VIEW_SECURE_DOCUMENT',
      resource: 'WorkforceDocument',
      resourceId: documentId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: {
        accessedBy: callerUid,
        ownerId: docData.ownerId,
        documentType: docData.documentType,
        documentName: docData.documentName
      }
    });

    return {
      success: true,
      documentId,
      documentName: docData.documentName,
      documentType: docData.documentType,
      storagePath: docData.storagePath,
      fileType: docData.fileType,
      fileSize: docData.fileSize,
      verifiedStatus: docData.verificationStatus
    };
  } catch (error) {
    console.error('Error in getSecureDocumentAccess:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Internal error generating document access');
  }
});
