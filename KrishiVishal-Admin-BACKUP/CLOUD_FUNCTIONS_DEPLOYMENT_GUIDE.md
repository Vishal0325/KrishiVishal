/**
 * FIREBASE CLOUD FUNCTION DEPLOYMENT GUIDE
 * Production Setup for Refund Processing
 */

// ===========================
// 1. ENVIRONMENT VARIABLES SETUP
// ===========================

// Set these in Firebase Cloud Functions configuration
// Command: firebase functions:config:set service.key="value"

firebase functions:config:set \
  razorpay.key_id="rzp_live_XXXXXXXXXXXXX" \
  razorpay.key_secret="xxxxxxxxxxxxxxxx" \
  stripe.secret_key="sk_live_XXXXXXXXXXXXXXXX" \
  stripe.webhook_secret="whsec_XXXXXXXXXXXXXXXX"

// Verify configuration
firebase functions:config:get

// ===========================
// 2. PACKAGE.JSON DEPENDENCIES
// ===========================

// functions/package.json
{
  "name": "krishivishal-functions",
  "description": "Firebase Cloud Functions for KrishiVishal",
  "scripts": {
    "serve": "firebase emulators:start --only functions",
    "shell": "firebase functions:shell",
    "start": "npm run shell",
    "deploy": "firebase deploy --only functions",
    "logs": "firebase functions:log"
  },
  "engines": {
    "node": "18"
  },
  "main": "index.js",
  "dependencies": {
    "firebase-admin": "^11.11.0",
    "firebase-functions": "^4.4.1",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "firebase-functions-test": "^3.1.0"
  }
}

// ===========================
// 3. FUNCTIONS INDEX FILE
// ===========================

// functions/index.js
const admin = require('firebase-admin');
admin.initializeApp();

// Import all function modules
const refundProcessing = require('./processReturnRefund');

// Export functions
exports.processReturnRefund = refundProcessing.processReturnRefund;
exports.retryFailedRefunds = refundProcessing.retryFailedRefunds;

// ===========================
// 4. DEPLOYMENT STEPS
// ===========================

/*
Step 1: Install Firebase CLI
  npm install -g firebase-tools

Step 2: Authenticate
  firebase login

Step 3: Initialize project (if not already done)
  firebase init functions

Step 4: Update functions/package.json with axios dependency

Step 5: Set environment variables
  firebase functions:config:set razorpay.key_id="..." razorpay.key_secret="..."

Step 6: Test locally
  firebase emulators:start --only functions

Step 7: Deploy to production
  firebase deploy --only functions

Step 8: Monitor logs
  firebase functions:log --limit 50

Step 9: Setup alerts (Firebase Console)
  - Go to Cloud Functions
  - Set up error reporting notifications
*/

// ===========================
// 5. LOCAL TESTING WITH EMULATOR
// ===========================

/*
Test refund processing locally:

1. Start emulator:
   firebase emulators:start --only firestore,functions

2. Create test data in emulator:
   - Create test order in orders collection
   - Create test return in returns collection with status "AUTO_APPROVED"

3. Update return status to "COMPLETED":
   - This triggers processReturnRefund function
   - Watch console logs for execution

4. View function logs in emulator console

5. Verify return document was updated with:
   - financials.gatewayRefundId
   - financials.processedAt
   - status remains "COMPLETED"
*/

// ===========================
// 6. PRODUCTION MONITORING
// ===========================

/*
Monitor Cloud Functions in Firebase Console:

1. Dashboard
   - View execution count
   - View average duration
   - View error rates

2. Logs
   - Real-time function logs
   - Filter by function name
   - Search for error messages

3. Metrics
   - Invocations
   - Execution times
   - Memory usage
   - Timeout errors

4. Error Reporting
   - Automatic error aggregation
   - Error rate tracking
   - Alert setup for high error rates

5. Set up alerts for:
   - Function failures
   - High memory usage
   - Timeout errors
   - Refund processing failures
*/

// ===========================
// 7. RAZORPAY WEBHOOK SETUP (OPTIONAL)
// ===========================

/*
For real-time refund status updates from Razorpay:

1. Go to Razorpay Dashboard
   - Settings → Webhooks

2. Add webhook URL:
   https://your-project.cloudfunctions.net/processRazorpayWebhook

3. Enable events:
   - refund.created
   - refund.failed
   - payment.captured
   - payment.failed

4. Implement webhook handler in Cloud Functions:
   - Verify webhook signature
   - Update return/order documents
   - Handle refund status updates
*/

// ===========================
// 8. STRIPE WEBHOOK SETUP (OPTIONAL)
// ===========================

/*
For real-time refund status updates from Stripe:

1. Go to Stripe Dashboard
   - Developers → Webhooks

2. Add endpoint:
   https://your-project.cloudfunctions.net/processStripeWebhook

3. Enable events:
   - charge.refunded
   - charge.refund.updated

4. Copy signing secret and set as environment variable
*/

// ===========================
// 9. ERROR HANDLING & RETRY LOGIC
// ===========================

/*
Automatic retry mechanism:

1. If refund fails on first attempt:
   - Status = REFUND_FAILED
   - financials.refundAttempts = 1
   - Error logged to refundErrors collection

2. Scheduled job runs every 6 hours:
   - Finds all REFUND_FAILED documents
   - Retries up to 3 times
   - Max 3 retry attempts to prevent infinite loops

3. Manual retry (if needed):
   - Call functions:executeRetryFailedRefunds
   - Triggers immediate retry of all failed refunds

4. After 3 failed attempts:
   - Status = REFUND_MANUAL_REVIEW
   - Alert admin via notification
   - Document stored in refundErrors collection
*/

// ===========================
// 10. SECURITY BEST PRACTICES
// ===========================

/*
1. API Key Security:
   ✓ Store keys in Firebase environment config (not in code)
   ✓ Use IAM roles to restrict Cloud Function permissions
   ✓ Rotate keys regularly
   ✓ Monitor key usage

2. Data Validation:
   ✓ Verify refund amount matches order amount
   ✓ Validate payment gateway response
   ✓ Check return document exists before processing
   ✓ Verify transaction ID format

3. Transaction Safety:
   ✓ Use Firestore transactions for atomic updates
   ✓ Idempotent operations (safe to retry)
   ✓ Log all operations for audit trail
   ✓ Timezone: Use UTC (Timestamp.now())

4. Error Handling:
   ✓ Catch all exceptions
   ✓ Log full error details
   ✓ Update document with failure reason
   ✓ Queue for manual review if needed

5. Monitoring:
   ✓ Track all refund attempts
   ✓ Monitor failure rates
   ✓ Set up alerts for anomalies
   ✓ Regular audit of refund logs
*/

// ===========================
// 11. COST OPTIMIZATION
// ===========================

/*
Cloud Functions Pricing:
- Invocations: $0.40 per 1 million invocations
- Compute time: $0.0000083 per GB-second
- Network egress: $0.12 per GB (for external API calls)

Optimization tips:
1. Use scheduled jobs for batch processing
2. Implement efficient error handling
3. Cache payment gateway responses
4. Use async/await properly
5. Monitor and optimize memory usage

For 1000 refunds per day:
- Estimated cost: ~$12-15/month
*/

// ===========================
// 12. TROUBLESHOOTING
// ===========================

/*
Issue: Function not triggering

Solution:
- Check Firestore Rules allow write access
- Verify 'returns' collection exists
- Check function is deployed (firebase deploy --only functions)
- View logs: firebase functions:log

Issue: Razorpay/Stripe API 401 errors

Solution:
- Verify API keys are correct in environment config
- Check key_id matches your environment (live vs test)
- Ensure credentials haven't expired
- Test API credentials with curl

Issue: Refund succeeds but document not updating

Solution:
- Check Firestore security rules allow write
- Verify return document ID is correct
- Check financials sub-object exists
- Monitor Cloud Function execution logs

Issue: High memory usage or timeouts

Solution:
- Optimize API calls (use connection pooling)
- Batch process refunds
- Increase function timeout (up to 540 seconds)
- Monitor with Profiler
*/
