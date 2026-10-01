# Razorpay Production Live-Switch Runbook

This runbook outlines the **Zero-Code Modification** deployment procedure for transitioning KrishiVishal payment infrastructure from Razorpay Test Mode to Live Mode.

---

## 1. Firebase Backend Secrets Configuration (GCP / Firebase CLI)

Run the following Firebase CLI commands to store live production credentials securely in GCP Secret Manager:

```bash
# Set Razorpay Live Key ID (e.g. rzp_live_xxxxxxxxxxxxxx)
firebase secrets:set RAZORPAY_KEY_ID

# Set Razorpay Live Key Secret
firebase secrets:set RAZORPAY_KEY_SECRET

# Set Razorpay Live Webhook Secret (configured in Razorpay Dashboard)
firebase secrets:set RAZORPAY_WEBHOOK_SECRET
```

Redeploy the backend Cloud Functions to bind the updated secrets:
```bash
cd KrishiVishal-Functions
firebase deploy --only functions
```

---

## 2. Razorpay Dashboard Webhook Configuration

1. Log in to the [Razorpay Dashboard](https://dashboard.razorpay.com/) in **Live Mode**.
2. Navigate to **Settings** $\rightarrow$ **Webhooks** $\rightarrow$ **Add New Webhook**.
3. Set **Webhook URL**:
   ```
   https://asia-south1-krishivishal-a9ed7.cloudfunctions.net/razorpayWebhook
   ```
4. Set **Secret**: Enter the exact secret string assigned to `RAZORPAY_WEBHOOK_SECRET`.
5. Select the following **Active Events**:
   - `payment.captured`
   - `payment.failed`
   - `order.paid`
6. Click **Save Webhook**.

---

## 3. Android App Production Keystore Configuration

1. Open `keystore.properties` in the project root directory (or create if missing):
   ```properties
   razorpayKey=rzp_live_xxxxxxxxxxxxxx
   ```
2. Rebuild the Android Release APK / AAB bundle:
   ```bash
   ./gradlew assembleRelease
   ```
   The Gradle build process automatically injects `razorpayKey` into `BuildConfig.RAZORPAY_KEY` and `${razorpayKey}` into `AndroidManifest.xml` `<meta-data android:name="com.razorpay.ApiKey">`.

---

## 4. Zero-Code Swap Verification Checklist

- [x] Backend `createOrder` creates server-locked Razorpay Orders using `RAZORPAY_KEY_ID` & `RAZORPAY_KEY_SECRET`.
- [x] Backend `verifyPayment` validates client payment signatures via HMAC SHA-256 and reconciles amount in paise.
- [x] Backend `razorpayWebhook` verifies `x-razorpay-signature` against `req.rawBody` and processes `payment.captured`, `order.paid`, and `payment.failed` with idempotency locks on `razorpay_webhook_events/{eventId}`.
- [x] Android Client preloads Checkout WebView on Main thread, opens Checkout using server-provided `razorpayOrderId`, and forwards payment results through `PaymentHandler`.
- [x] 100% automated test suite green (`npm test`).
