/**
 * ============================================
 * QUICK START INTEGRATION GUIDE
 * Production Return/Refund/Cancellation System
 * ============================================
 */

// ===========================
// STEP 1: ANDROID APP INTEGRATION (5 minutes)
// ===========================

/**
 * Location: app/src/main/java/com/company/krishivishal/data/di/
 * File: SecurityPerformanceModule.kt (or create new module)
 * 
 * Add this provider:
 */

@Module
@InstallIn(SingletonComponent::class)
object OrderCancellationModule {

    @Provides
    @Singleton
    fun provideOrderCancellationService(
        firestore: FirebaseFirestore
    ): OrderCancellationService {
        return OrderCancellationService(firestore)
    }
}

/**
 * Usage in your existing OrderScreen.kt:
 */

import com.company.krishivishal.services.OrderCancellationService

@Composable
fun UpdatedOrderScreen(
    onBack: () -> Unit,
    viewModel: OrderViewModel = hiltViewModel() // Your existing ViewModel
) {
    // Your existing code...
    
    // When user clicks "Cancel Order" button:
    OutlinedButton(
        onClick = { 
            // Navigate to new bifurcated flow screen
            navController.navigate("bifurcated_return_flow/$orderId/$orderStatus/$totalAmount")
        },
        enabled = canCancel
    ) {
        Text("Cancel Order")
    }
}

// ===========================
// STEP 2: NAVIGATION SETUP (Android)
// ===========================

/**
 * In your NavGraph.kt or Navigation composable:
 */

composable(
    route = "bifurcated_return_flow/{orderId}/{orderStatus}/{totalAmount}",
    arguments = listOf(
        navArgument("orderId") { type = NavType.StringType },
        navArgument("orderStatus") { type = NavType.StringType },
        navArgument("totalAmount") { type = NavType.StringType }
    )
) { backStackEntry ->
    val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
    val orderStatus = backStackEntry.arguments?.getString("orderStatus") ?: ""
    val totalAmount = backStackEntry.arguments?.getString("totalAmount")?.toDoubleOrNull() ?: 0.0
    
    BifurcatedReturnFlowScreen(
        orderId = orderId,
        orderStatus = orderStatus,
        totalAmount = totalAmount,
        productName = "Product", // Get from your data
        onBack = { navController.popBackStack() }
    )
}

// ===========================
// STEP 3: WEB ADMIN INTEGRATION (5 minutes)
// ===========================

/**
 * Location: src/pages/Orders.jsx
 * 
 * Update your cancel order button handler:
 */

import { cancelOrderTransaction } from '../services/orderCancellation';

async function handleCancelOrder(orderId, userId, reason) {
    try {
        const result = await cancelOrderTransaction(orderId, userId, reason);
        if (result.success) {
            toast.success(result.message);
            // Refresh orders list
            loadOrders();
        } else {
            toast.error(result.message);
        }
    } catch (error) {
        toast.error('Cancellation failed: ' + error.message);
    }
}

/**
 * Location: src/pages/Returns.jsx
 * 
 * Update your approve button handler:
 */

import { approveReturnTransaction } from '../services/orderCancellation';

async function handleApproveReturn(returnId, approvalAmount, notes) {
    try {
        const result = await approveReturnTransaction(
            returnId,
            approvalAmount,
            notes
        );
        if (result.success) {
            toast.success(result.message);
            loadReturns(); // Refresh
        } else {
            toast.error(result.message);
        }
    } catch (error) {
        toast.error('Approval failed: ' + error.message);
    }
}

// ===========================
// STEP 4: FIRESTORE SETUP (10 minutes)
// ===========================

/**
 * Step 4a: Deploy Security Rules
 * 
 * Command:
 *   firebase deploy --only firestore:rules
 * 
 * This applies: firestore.rules
 */

/**
 * Step 4b: Create Firestore Indexes
 * 
 * Go to: Firebase Console → Firestore → Indexes
 * 
 * Create these 3 composite indexes:
 * 
 * Index 1:
 * Collection: orders
 * Fields: userId (Ascending), status (Ascending), createdAt (Descending)
 * 
 * Index 2:
 * Collection: returns
 * Fields: userId (Ascending), status (Ascending), createdAt (Descending)
 * 
 * Index 3:
 * Collection: returns
 * Fields: status (Ascending), createdAt (Descending)
 * 
 * Wait for "Enabled" status (usually 5-10 minutes)
 */

/**
 * Step 4c: Set Admin Custom Claims
 * 
 * Run in Firebase Functions Shell:
 * 
 *   firebase functions:shell
 *   > admin.auth().setCustomUserClaims('your_admin_uid', { admin: true })
 * 
 * Replace 'your_admin_uid' with actual admin user's Firebase UID
 */

// ===========================
// STEP 5: SCHEMA MIGRATION (15 minutes)
// ===========================

/**
 * Step 5a: Backup your data first!
 * 
 * Command:
 *   firebase firestore:export ./backups/pre-migration-$(date +%Y%m%d)
 */

/**
 * Step 5b: Run migration script (DRY RUN first)
 * 
 * Command:
 *   cd KrishiVishal-Admin
 *   DRY_RUN=true node scripts/migrateFirestoreSchema.js
 * 
 * Review output for any issues
 */

/**
 * Step 5c: Run actual migration
 * 
 * Command:
 *   DRY_RUN=false node scripts/migrateFirestoreSchema.js
 * 
 * Wait for completion (usually 2-5 minutes depending on data size)
 */

/**
 * Step 5d: Verify migration
 * 
 * Go to Firebase Console:
 * - Check sample orders have paymentDetails.transactionId
 * - Check sample returns have financials.totalAmount
 * - Verify no errors in function logs
 */

// ===========================
// STEP 6: CLOUD FUNCTIONS DEPLOYMENT (10 minutes)
// ===========================

/**
 * Step 6a: Set environment variables
 * 
 * Command:
 *   firebase functions:config:set \
 *     razorpay.key_id="rzp_live_YOUR_KEY_ID" \
 *     razorpay.key_secret="YOUR_KEY_SECRET" \
 *     stripe.secret_key="sk_live_YOUR_SECRET_KEY"
 * 
 * Verify:
 *   firebase functions:config:get
 */

/**
 * Step 6b: Deploy Cloud Functions
 * 
 * Command:
 *   firebase deploy --only functions
 * 
 * This deploys: processReturnRefund function
 */

/**
 * Step 6c: Verify deployment
 * 
 * Command:
 *   firebase functions:log --limit 50
 * 
 * Should see no errors
 */

// ===========================
// STEP 7: TESTING (20 minutes)
// ===========================

/**
 * Test 1: Security Rules (Local Emulator)
 * 
 * Command:
 *   firebase emulators:start --only firestore
 * 
 * In another terminal:
 *   cd KrishiVishal-Admin
 *   npm test
 * 
 * All tests should PASS ✓
 */

/**
 * Test 2: Android App - Pre-shipment Cancellation
 * 
 * Steps:
 * 1. Open Android app
 * 2. Navigate to My Orders
 * 3. Select an order with status "PLACED"
 * 4. Click "Cancel Order"
 * 5. Select reason and confirm
 * 6. Verify: Order status changes to "CANCELLED"
 * 7. Check Firebase: returns collection has AUTO_APPROVED return
 */

/**
 * Test 3: Web Admin - Return Approval
 * 
 * Steps:
 * 1. Open web admin panel
 * 2. Go to "Returns & Refunds"
 * 3. Find PENDING return
 * 4. Click "View Details"
 * 5. Add notes and click "Approve"
 * 6. Verify: Status changes to "APPROVED"
 * 7. Check Firebase: Cloud Function processes refund
 * 8. Monitor: firebase functions:log should show success
 */

/**
 * Test 4: Refund Processing
 * 
 * Monitor Cloud Function logs:
 *   firebase functions:log --limit 100
 * 
 * Look for:
 * - "Processing Razorpay refund"
 * - "Refund successful: refnd_xxx"
 * - "✅ Refund successful"
 * 
 * Check Firebase Console:
 * - returns collection
 * - Select a COMPLETED return
 * - Verify financials.gatewayRefundId is populated
 * - Verify financials.processedAt is set
 */

// ===========================
// STEP 8: PRODUCTION MONITORING (Ongoing)
// ===========================

/**
 * Setup Cloud Monitoring Alerts
 * 
 * 1. Go to: Google Cloud Console → Monitoring → Policies
 * 
 * 2. Create alert for "Cloud Function Errors":
 *    - Metric: cloudfunctions.googleapis.com/execution_count
 *    - Filter: status = "ERROR"
 *    - Threshold: > 5 errors in 5 minutes
 *    - Notification: Your email
 * 
 * 3. Create alert for "High Function Duration":
 *    - Metric: cloudfunctions.googleapis.com/execution_times
 *    - Threshold: > 30 seconds
 *    - Notification: Your email
 */

/**
 * Monitor Key Metrics Daily:
 * 
 * Command:
 *   firebase functions:log --limit 500 | grep -i "REFUND\|ERROR"
 * 
 * Check:
 * - ✓ Refund success rate (should be > 99%)
 * - ✓ Cloud Function errors (should be < 0.1%)
 * - ✓ API latency (should be < 2 seconds)
 * - ✓ No failed transactions
 */

// ===========================
// TROUBLESHOOTING
// ===========================

/**
 * Issue: "User can only cancel their own orders"
 * 
 * Solution:
 * - Verify userId matches auth.currentUser?.uid
 * - Check Firestore rule: isOwner(resource.data.userId)
 * - Test with emulator
 */

/**
 * Issue: "Refund failed with 401 error"
 * 
 * Solution:
 * - Verify Razorpay/Stripe keys in environment
 * - Check keys are for LIVE environment (not test)
 * - Verify transaction ID exists and is valid
 * - Check API rate limits
 */

/**
 * Issue: "Cloud Function not triggering"
 * 
 * Solution:
 * - Verify firestore.rules allow write to returns collection
 * - Check function is deployed: firebase deploy --only functions
 * - Monitor logs: firebase functions:log
 * - Verify returns/{returnId} document exists
 */

/**
 * Issue: "Transaction timeout"
 * 
 * Solution:
 * - Reduce number of operations in transaction
 * - Max 500 operations per transaction
 * - Check Firestore read/write quota
 * - Monitor: Firebase Console → Firestore → Usage
 */

// ===========================
// QUICK REFERENCE
// ===========================

Commands Cheat Sheet:

// Deploy everything
firebase deploy --only firestore:rules,functions

// Check function logs
firebase functions:log --limit 100

// Run security tests
npm test

// Run migration (DRY RUN)
DRY_RUN=true node scripts/migrateFirestoreSchema.js

// Run migration (LIVE)
DRY_RUN=false node scripts/migrateFirestoreSchema.js

// Set environment vars
firebase functions:config:set razorpay.key_id="xxx"

// View environment
firebase functions:config:get

// Clear all emulator data
firebase emulators:start --import=/dev/null --export-on-exit

// ===========================
// SUCCESS CHECKLIST
// ===========================

Before Going Live:

□ Android app builds without errors
□ Web admin builds without errors
□ Firestore rules deployed
□ Firestore indexes created (enabled status)
□ Admin custom claims set
□ Schema migration completed
□ Cloud Functions deployed
□ Environment variables set
□ Security rules tests all pass
□ Manual testing completed (pre & post shipment)
□ Error monitoring alerts configured
□ Backup of data taken
□ Rollback plan documented
□ Team trained on new flows

// ===========================
// SUPPORT LINKS
// ===========================

Documentation:
✓ CLOUD_FUNCTIONS_DEPLOYMENT_GUIDE.md
✓ DEPLOYMENT_CHECKLIST.md
✓ IMPLEMENTATION_SUMMARY.md
✓ FirestoreSchema_v2.js

Firebase Docs:
✓ Firestore: https://firebase.google.com/docs/firestore
✓ Cloud Functions: https://firebase.google.com/docs/functions
✓ Security Rules: https://firebase.google.com/docs/firestore/security/start

Payment APIs:
✓ Razorpay: https://razorpay.com/docs/
✓ Stripe: https://stripe.com/docs/api

// ===========================
// ESTIMATED TIMELINE
// ===========================

Task                          Time      Status
─────────────────────────────────────────────
Integration (Android)         5 min     ⏳
Integration (Web Admin)       5 min     ⏳
Firestore Setup              10 min     ⏳
Schema Migration             15 min     ⏳
Cloud Functions Deploy       10 min     ⏳
Testing & Verification       20 min     ⏳
─────────────────────────────────────────────
TOTAL                        ~1 hour    

Ready to go live! 🚀
*/
