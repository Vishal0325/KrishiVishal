const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// Note: To use the automated export feature, the Firebase project must be on the Blaze plan, 
// and the service account must have 'Cloud Datastore Import Export Admin' IAM role.
const firestore = require('@google-cloud/firestore');
const client = new firestore.v1.FirestoreAdminClient();

/**
 * Scheduled job to run every night at 2:00 AM IST.
 * Checks settings.enableAutoBackup. If true, triggers a Firestore export to a Cloud Storage bucket.
 */
exports.automatedDatabaseBackup = functions.pubsub.schedule('every day 02:00')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    const db = admin.firestore();
    
    // [FIXED] Point #47: Control backup toggle via Environment Variables / Secret Manager for enhanced security
    const isBackupEnabled = process.env.ENABLE_AUTO_BACKUP === 'true';
    if (!isBackupEnabled) {
      console.log('Automated backups are disabled via environment variable. Skipping.');
      return null;
    }

    // 2. Define Backup Bucket
    // Note: You must create a bucket named `krishivishal-firestore-backups` in your Google Cloud Console.
    const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT || 'krishivishal-a9ed7';
    const bucketName = `gs://${projectId}-firestore-backups`;

    console.log(`Starting automated backup for project ${projectId} to bucket ${bucketName}`);

    try {
      const databaseName = client.databasePath(projectId, '(default)');
      
      const [response] = await client.exportDocuments({
        name: databaseName,
        outputUriPrefix: bucketName,
        // Leave collectionIds empty to export all collections
        collectionIds: [] 
      });

      console.log(`Backup initiated successfully. Operation Name: ${response.name}`);
      
      // Log Audit Event
      await db.collection('audit_logs').add({
        action: 'AUTOMATED_DATABASE_BACKUP',
        resource: 'Firestore',
        resourceId: response.name,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: {
          bucket: bucketName,
          status: 'INITIATED'
        }
      });

      return { success: true, operation: response.name };
    } catch (error) {
      console.error('Error initiating database backup:', error);
      
      // Log Failure
      await db.collection('audit_logs').add({
        action: 'AUTOMATED_DATABASE_BACKUP_FAILED',
        resource: 'Firestore',
        resourceId: 'ERROR',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: {
          error: error.message
        }
      });

      return null;
    }
  });
