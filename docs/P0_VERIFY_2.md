# P0 Security Lockdown & Rules Verification Report (Pass 2)

**Date:** 2026-09-19  
**Audit Scope:** Secret binding (`defineSecret`/`defineString`), Security Rule Helpers, Customer App Read Audit, Service Marketplace Hardening, Order State Machine, and Firebase Emulator Unit Test Suite.  
**Deployment Policy:** READ-ONLY Verification (No `firebase deploy` executed).  

---

## 1. Secret & String Parameter Declarations (`core/secrets.js`)

All environment secrets are explicitly declared using `defineSecret` and `defineString` from `firebase-functions/params`, with fallback logic for local unit testing (`getSecretVal`).

```javascript
// core/secrets.js
const { defineSecret, defineString } = require("firebase-functions/params");

const razorpayKeySecret = defineSecret("RAZORPAY_KEY_SECRET");
const razorpayWebhookSecret = defineSecret("RAZORPAY_WEBHOOK_SECRET");
const qrHmacSecret = defineSecret("QR_HMAC_SECRET");
const cleartaxAuthToken = defineSecret("CLEARTAX_AUTH_TOKEN");

const razorpayKeyId = defineString("RAZORPAY_KEY_ID", { default: "" });
const storeGstin = defineString("STORE_GSTIN", { default: "" });

function getSecretVal(secretParam, envName) {
    try {
        if (secretParam && typeof secretParam.value === 'function') {
            const val = secretParam.value();
            if (val) return val;
        }
    } catch (e) {}
    return process.env[envName] || "";
}

module.exports = {
    razorpayKeySecret, razorpayWebhookSecret, qrHmacSecret, cleartaxAuthToken,
    razorpayKeyId, storeGstin, getSecretVal
};
```

### Function Secret Bindings (`secrets: [...]`)
- `exports.createOrder`: `secrets: [razorpayKeySecret]` in [orderFlow.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/orders/orderFlow.js#L52)
- `exports.generateSignedQRPayload`: `secrets: [qrHmacSecret]` in [orderFlow.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/orders/orderFlow.js#L780)
- `exports.verifyPayment`: `secrets: [razorpayKeySecret]` in [razorpay.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/razorpay.js#L12)
- `exports.razorpayWebhook`: `secrets: [razorpayWebhookSecret]` in [razorpay.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/razorpay.js#L105)
- `exports.initiateRefund`: `secrets: [razorpayKeySecret]` in [initiateRefund.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/initiateRefund.js#L26)
- `exports.createWalletTopUpOrder`: `secrets: [razorpayKeySecret]` in [walletTopUp.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/walletTopUp.js#L13)
- `exports.verifyWalletTopUp`: `secrets: [razorpayKeySecret]` in [walletTopUp.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/walletTopUp.js#L68)
- `exports.generateEWayBill`: `secrets: [cleartaxAuthToken]` in [index.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/index.js#L96)

---

## 2. Exact Security Helper Code

### A. Firestore Rules Helpers (`firestore.rules`)
```firestore
    function isAuthenticated() {
      return request.auth != null;
    }

    function isAdmin() {
      return isAuthenticated() && (
        request.auth.token.admin == true ||
        request.auth.token.isAdmin == true ||
        request.auth.token.role in ["ADMIN", "SuperAdmin", "CatalogManager", "OrderManager"]
      );
    }

    function isSuperAdmin() {
      return isAuthenticated() && request.auth.token.role == "SuperAdmin";
    }

    function canViewFinance() {
      return isSuperAdmin();
    }

    function isViewer() {
      return isAuthenticated() && request.auth.token.role == "Viewer";
    }

    function isRider() {
      return isAuthenticated() && request.auth.token.role == "Rider";
    }
```

### B. Cloud Functions Helper `isAdminRequest` (`core/utils.js`)
```javascript
async function isAdminRequest(obj) {
    // Support both v1 (context) and v2 (request/obj) patterns
    const auth = obj.auth || obj;
    if (!auth || !auth.uid) return false;

    // 1. Check Custom Claims (High Performance)
    if (auth.token && (auth.token.admin === true || auth.token.isAdmin === true ||
        ["ADMIN", "SuperAdmin", "CatalogManager", "OrderManager"].includes(auth.token.role))) {
        return true;
    }

    // 2. Fallback to DB check (Security)
    const userDoc = await db.collection("users").doc(auth.uid).get();
    const d = userDoc.data() || {};
    return d.isAdmin === true || ["ADMIN", "SuperAdmin"].includes(d.role);
}
```

---

## 3. Customer App Read Audit & Restricted Rules

### Grep Results in Customer App (`app`)
- `whitelisted_riders`: **0 matches** (not read by Customer App). Unauthenticated access blocked (`allow read: if isAuthenticated();`).
- `riders`: **0 matches** (not read by Customer App). Self-creation blocked (`allow create: if isAdmin();`). Self-update locked with `affectedKeys().hasOnly(['name', 'phone', 'address', 'vehicleDetails', 'isAvailable', 'currentLocation', 'location', 'fcmToken', 'updatedAt'])`.
- `skus` / `batches`: Read in `SkuRepository.kt` when user is authenticated (`allow read: if isAuthenticated();`). Public guest browsing uses `products`.
- `warehouses`: Read in `WarehouseDao.kt` by authenticated users (`allow read: if isAuthenticated();`).

---

## 4. Service Marketplace & Repository Fixes

1. **`firestore.rules` Restriction:** Reading `PENDING_ASSIGNMENT` job alerts restricted strictly to verified serviceman/partner/admin roles:
   ```firestore
   match /service_bookings/{bookingId} {
     allow read: if isAuthenticated() && (
                   request.auth.uid == resource.data.farmerId
                   || request.auth.uid == resource.data.assignedPartnerId
                   || (resource.data.status == "PENDING_ASSIGNMENT" && request.auth.token.role in ['Rider', 'Serviceman', 'Partner', 'ADMIN'])
                   || isAdmin()
                 );
     allow create: if false; // All bookings must use createServiceBooking Cloud Function
     allow update, delete: if false;
   }
   ```
2. **`ServiceBookingRepository.kt` Direct-Write Fallback Removed:**
   In [ServiceBookingRepository.kt](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/data/repository/ServiceBookingRepository.kt#L97), the fallback `firestore.collection("service_bookings").document(...).set(...)` was completely removed. Creation errors now log via `Timber.e` and return clean failure states without attempting direct writes.

---

## 5. Order State Machine & `DELIVERED` OTP Enforce

### Allowed Transitions per Role (`updateOrderStatus`)
- **Customer:** CANNOT change order status directly. Order cancellation requires `cancelOrder` Cloud Function (`PLACED` -> `CANCELLED`).
- **Rider:** Can transition status across `ASSIGNED` -> `RIDER_ACCEPTED` -> `OUT_FOR_DELIVERY` -> `DELIVERY_FAILED`.
- **Rider DELIVERED Gate:** Attempting to transition to `DELIVERED` via `updateOrderStatus` is explicitly **DENIED**:
  ```javascript
  if (targetStatus === 'DELIVERED' && !isAdmin) {
      throw new HttpsError('permission-denied', 'DELIVERED status can only be set via verifyDeliveryOTP with customer OTP.');
  }
  ```
  `DELIVERED` status can strictly be achieved by calling `verifyDeliveryOTP` after validating customer OTP.
- **Admin:** Can execute admin state overrides across all canonical states.

---

## 6. Callable Functions Authorization & Reconciliation

- **`getAvailableSlots`:** Requires authentication (`if (!request.auth) throw new HttpsError('unauthenticated', ...)`). (Reconciled with documentation).
- **`expandRadiusOnTimeout`:**
  ```javascript
  if (!context.auth) throw new HttpsError('unauthenticated', 'Login required.');
  if (!(await isAdminRequest(context))) throw new HttpsError('permission-denied', 'Admin or System task authorization required.');
  ```
- **`acceptBooking` & `rejectBooking`:**
  ```javascript
  const partnerId = requireAuth(context); // Throws unauthenticated if request.auth is null
  ```

---

## 7. Real Firebase Emulator Test Suite Results

- **Command:** `npx firebase emulators:exec --only firestore "node tests/emulator_rules.test.js"`
- **Result:** `PASS - 19 PASSED, 0 FAILED`

```text
=== RUNNING FIRESTORE EMULATOR RULES VERIFICATION SUITE ===

PASS: 1.1 Customer CANNOT create orders directly
PASS: 1.2 Customer CANNOT create returns directly
PASS: 1.3 Customer CANNOT create service_bookings directly
PASS: 1.4 Customer CANNOT write ledger directly
PASS: 1.5 Customer CANNOT write skus directly
PASS: 1.6 Customer CANNOT write warehouse_stock directly
PASS: 1.7 Customer CANNOT write wallet_transactions directly
PASS: 2.1 Customer CANNOT change own role in users/{uid}
PASS: 2.2 Customer CANNOT change own walletBalance in users/{uid}
PASS: 3.1 Customer CANNOT read or update another user's order
PASS: 4.1 Rider CAN self-assign unassigned order
PASS: 4.2 Rider CANNOT modify order price or userId during self-assign
PASS: 5.1 Rider CAN create own cash deposit
PASS: 5.2 Rider CANNOT update own cash deposit to VERIFIED
PASS: 6.1 Admin CAN create and update orders
PASS: 7.1 Unauthenticated user CANNOT read whitelisted_riders
PASS: 7.2 User CANNOT self-create a riders doc
PASS: 7.3 Rider CANNOT directly set order status to DELIVERED in Firestore
PASS: 7.4 Customer CANNOT read PENDING_ASSIGNMENT service_bookings

==========================================
EMULATOR RULES SUITE: 19 PASSED, 0 FAILED
==========================================
```
