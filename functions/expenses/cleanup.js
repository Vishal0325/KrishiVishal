const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

/**
 * [FIXED] Point #119: Storage Orphanage Cleanup.
 * Scheduled job to find and delete expense attachments that belong to non-existent or cancelled expense forms.
 * Runs weekly to optimize storage costs.
 */
exports.cleanupOrphanedExpenseFiles = functions.pubsub.schedule('every monday 04:00')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    console.log('Starting Storage Orphanage Cleanup (Expenses)...');

    try {
      // 1. List all "folders" under /expenses/
      // Note: Cloud Storage doesn't have real folders, just prefixes.
      const [files] = await bucket.getFiles({ prefix: 'expenses/' });

      // Extract unique expense IDs from paths like "expenses/{expenseId}/{fileId}"
      const expenseIdsInStorage = new Set();
      files.forEach(file => {
        const parts = file.name.split('/');
        if (parts.length > 2) {
          expenseIdsInStorage.add(parts[1]);
        }
      });

      console.log(`Found ${expenseIdsInStorage.size} potential expense folders in storage.`);

      let deletedCount = 0;

      for (const expenseId of expenseIdsInStorage) {
        // Check if a document with this ID exists in 'expenses' collection
        const docSnap = await db.collection('expenses').doc(expenseId).get();

        if (!docSnap.exists) {
          console.log(`Expense ${expenseId} not found in DB. Deleting orphaned storage files...`);
          // Delete all files with this prefix
          await bucket.deleteFiles({ prefix: `expenses/${expenseId}/` });
          deletedCount++;
        }
      }

      console.log(`Cleanup complete. Removed files for ${deletedCount} orphaned expenses.`);
      return { success: true, foldersDeleted: deletedCount };
    } catch (error) {
      console.error('Cleanup Error:', error);
      return null;
    }
  });
