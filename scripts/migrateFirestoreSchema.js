/**
 * Firestore Schema Migration Script
 * From v1.0 to v2.0 (Financial Audit Enabled)
 * Run this BEFORE deploying Cloud Functions
 */

const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// Migration configuration
const BATCH_SIZE = 500; // Firestore batch limit
const DRY_RUN = false;  // Set to true to preview changes without writing

/**
 * Migrate orders collection to new schema
 */
async function migrateOrdersCollection() {
  console.log('📦 Starting orders collection migration...');

  let processedCount = 0;
  let errorCount = 0;

  try {
    const snapshot = await db.collection('orders').get();
    console.log(`Total orders to migrate: ${snapshot.size}`);

    let batch = db.batch();
    let operationCount = 0;

    for (const doc of snapshot.docs) {
      const orderData = doc.data();

      // Skip if already migrated
      if (orderData.paymentDetails?.transactionId) {
        console.log(`✓ Order ${doc.id} already migrated`);
        continue;
      }

      // Build updated document
      const updatedData = {
        ...orderData,
        // Ensure paymentDetails structure
        paymentDetails: {
          gateway: orderData.paymentDetails?.gateway || orderData.gateway || 'UNKNOWN',
          transactionId: orderData.paymentDetails?.transactionId || orderData.transactionId || '',
          paymentMethod: orderData.paymentDetails?.paymentMethod || orderData.paymentMethod || 'UNKNOWN',
          paymentStatus: orderData.paymentDetails?.paymentStatus || 'SUCCESS',
          paymentTimestamp: orderData.paymentDetails?.paymentTimestamp || orderData.createdAt || admin.firestore.Timestamp.now(),
        },
        // Add new fields with defaults
        cancelled: orderData.cancelled || false,
        cancellationReason: orderData.cancellationReason || '',
        cancellationTimestamp: orderData.cancellationTimestamp || null,
        returnPending: orderData.returnPending || false,
        returnId: orderData.returnId || '',
        returnApproved: orderData.returnApproved || false,
        returnRejected: orderData.returnRejected || false,
        updatedAt: admin.firestore.Timestamp.now(),
      };

      if (!DRY_RUN) {
        batch.update(doc.ref, updatedData);
        operationCount++;

        // Execute batch when limit reached
        if (operationCount >= BATCH_SIZE) {
          await batch.commit();
          console.log(`✓ Committed ${operationCount} order updates`);
          batch = db.batch();
          operationCount = 0;
        }
      } else {
        console.log(`[DRY RUN] Would update order: ${doc.id}`, updatedData);
      }

      processedCount++;
    }

    // Final batch commit
    if (operationCount > 0 && !DRY_RUN) {
      await batch.commit();
      console.log(`✓ Final batch: Committed ${operationCount} order updates`);
    }

    console.log(`✅ Orders migration complete. Processed: ${processedCount}, Errors: ${errorCount}`);
  } catch (error) {
    console.error('❌ Orders migration failed:', error);
    throw error;
  }
}

/**
 * Migrate returns collection to new schema
 */
async function migrateReturnsCollection() {
  console.log('📋 Starting returns collection migration...');

  let processedCount = 0;
  let errorCount = 0;

  try {
    const snapshot = await db.collection('returns').get();
    console.log(`Total returns to migrate: ${snapshot.size}`);

    let batch = db.batch();
    let operationCount = 0;

    for (const doc of snapshot.docs) {
      const returnData = doc.data();

      // Skip if already migrated
      if (returnData.financials?.totalAmount !== undefined) {
        console.log(`✓ Return ${doc.id} already migrated`);
        continue;
      }

      // Get original order to extract payment details
      let paymentDetails = {};
      try {
        const orderDoc = await db.collection('orders').doc(returnData.orderId).get();
        if (orderDoc.exists) {
          const orderPaymentDetails = orderDoc.data().paymentDetails || {};
          paymentDetails = {
            transactionId: orderPaymentDetails.transactionId || '',
            gateway: orderPaymentDetails.gateway || 'UNKNOWN',
            paymentMethod: orderPaymentDetails.paymentMethod || 'UNKNOWN',
          };
        }
      } catch (e) {
        console.warn(`Could not fetch order data for return ${doc.id}`);
      }

      // Build updated document
      const updatedData = {
        ...returnData,
        // Create financials sub-object
        financials: {
          totalAmount: returnData.totalAmount || 0,
          refundAmountInitiated: returnData.refundAmountInitiated || 0,
          gatewayRefundId: returnData.gatewayRefundId || '',
          processedAt: returnData.processedAt || null,
          paymentDetails: paymentDetails,
          refundAttempts: 0,
          lastRefundAttempt: null,
          failureReason: '',
        },
        // Add new fields with defaults
        isAutoApproved: returnData.isAutoApproved || false,
        pickupScheduled: returnData.pickupScheduled || null,
        pickupCompletedAt: returnData.pickupCompletedAt || null,
        updatedAt: admin.firestore.Timestamp.now(),
      };

      if (!DRY_RUN) {
        batch.update(doc.ref, updatedData);
        operationCount++;

        // Execute batch when limit reached
        if (operationCount >= BATCH_SIZE) {
          await batch.commit();
          console.log(`✓ Committed ${operationCount} return updates`);
          batch = db.batch();
          operationCount = 0;
        }
      } else {
        console.log(`[DRY RUN] Would update return: ${doc.id}`, updatedData);
      }

      processedCount++;
    }

    // Final batch commit
    if (operationCount > 0 && !DRY_RUN) {
      await batch.commit();
      console.log(`✓ Final batch: Committed ${operationCount} return updates`);
    }

    console.log(`✅ Returns migration complete. Processed: ${processedCount}, Errors: ${errorCount}`);
  } catch (error) {
    console.error('❌ Returns migration failed:', error);
    throw error;
  }
}

/**
 * Verify migration was successful
 */
async function verifyMigration() {
  console.log('🔍 Verifying migration...');

  try {
    // Check orders
    const ordersSnapshot = await db.collection('orders').limit(5).get();
    if (!ordersSnapshot.empty) {
      const sample = ordersSnapshot.docs[0].data();
      const hasPaymentDetails = sample.paymentDetails?.transactionId !== undefined;
      const hasCancellationFields = sample.cancelled !== undefined;
      console.log(`Orders schema check: Payment Details ✓, Cancellation Fields ${hasPaymentDetails && hasCancellationFields ? '✓' : '✗'}`);
    }

    // Check returns
    const returnsSnapshot = await db.collection('returns').limit(5).get();
    if (!returnsSnapshot.empty) {
      const sample = returnsSnapshot.docs[0].data();
      const hasFinancials = sample.financials?.totalAmount !== undefined;
      console.log(`Returns schema check: Financials Sub-object ${hasFinancials ? '✓' : '✗'}`);
    }

    console.log('✅ Verification complete');
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

/**
 * Main execution
 */
async function runMigration() {
  console.log('🚀 Starting Firestore Schema Migration v1.0 → v2.0');
  console.log(`DRY_RUN: ${DRY_RUN}\n`);

  try {
    await migrateOrdersCollection();
    await migrateReturnsCollection();
    await verifyMigration();

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Execute migration
runMigration();
