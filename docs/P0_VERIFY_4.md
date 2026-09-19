# P0 Security Hardening & Verification Pass 4 Report

**Date & Time**: 2026-09-19T15:27:00+05:30  
**Environment**: Production Hardening & Local Emulator Suite  
**Reference Policy**: [GEMINI.md](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/GEMINI.md)

---

## Item A: Secret Bindings and Call Site Analysis (`createOrder` & `createWalletTopUpOrder`)

### 1. `createOrder` Secret Bindings & Calls
- **Enclosing Exported Function**: `exports.createOrder` in [orders/orderFlow.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/orders/orderFlow.js#L52)
- **Secrets Configuration**: `secrets: [razorpayKeySecret]`
- **Calls to `getSecretVal`**:
  - Inside helper `createRazorpayOrder(orderId, totalAmountINR)` ([orderFlow.js:24-25](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/orders/orderFlow.js#L24-L25)):
    - `getSecretVal(razorpayKeyId, 'RAZORPAY_KEY_ID')` (plain config string from `defineString`)
    - `getSecretVal(razorpayKeySecret, 'RAZORPAY_KEY_SECRET')` (bound secret parameter)
- **Runtime Invocation & COD Isolation**:
  - `createRazorpayOrder` is called **only** at [orderFlow.js:399](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/orders/orderFlow.js#L399) inside the payment method check:
    ```javascript
    if (paymentMethod === 'RAZORPAY_ONLINE') {
        razorpayOrderId = await createRazorpayOrder(orderId, finalAmount);
    }
    ```
  - **Why `createOrder` needs `razorpayKeySecret`**: When a customer chooses `RAZORPAY_ONLINE`, the server authoritatively calls Razorpay to generate a Razorpay Order locking the exact server-calculated amount (`finalAmount`). This prevents client-side price tampering.
  - **COD Orders Guarantee**: When `paymentMethod === 'COD'` or `paymentMethod === 'WALLET'`, execution skips the `if (paymentMethod === 'RAZORPAY_ONLINE')` block entirely. `createRazorpayOrder` is never invoked, meaning `RAZORPAY_KEY_SECRET` is **never** accessed, read, or evaluated at runtime for COD orders.

### 2. `createWalletTopUpOrder` Secret Bindings & Calls
- **Enclosing Exported Function**: `exports.createWalletTopUpOrder` in [finance/walletTopUp.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/walletTopUp.js#L14)
- **Secrets Configuration**: `secrets: [razorpayKeySecret]`
- **Calls to `getSecretVal`**:
  - [finance/walletTopUp.js:25-26](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/walletTopUp.js#L25-L26):
    - `getSecretVal(razorpayKeyId, 'RAZORPAY_KEY_ID')`
    - `getSecretVal(razorpayKeySecret, 'RAZORPAY_KEY_SECRET')`
- **Purpose**: Creates an authoritative Razorpay order for wallet top-up transactions.

### 3. Global Call Site & Binding Matrix Across Entire Backend
Every function accessing a secret is bound to that exact secret parameter:

| Exported Function | File Location | Secret Called | Secrets Binding | Call Site Line(s) |
|---|---|---|---|---|
| `createOrder` | [orders/orderFlow.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/orders/orderFlow.js) | `RAZORPAY_KEY_SECRET` | `secrets: [razorpayKeySecret]` | Lines 24–25 (inside `createRazorpayOrder`, invoked on line 401 for `RAZORPAY_ONLINE`) |
| `generateSignedQRPayload` | [orders/orderFlow.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/orders/orderFlow.js) | `QR_HMAC_SECRET` | `secrets: [qrHmacSecret]` | Line 802 |
| `createWalletTopUpOrder` | [finance/walletTopUp.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/walletTopUp.js) | `RAZORPAY_KEY_SECRET` | `secrets: [razorpayKeySecret]` | Lines 25–26 |
| `verifyWalletTopUp` | [finance/walletTopUp.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/walletTopUp.js) | `RAZORPAY_KEY_SECRET` | `secrets: [razorpayKeySecret]` | Line 81 |
| `initiateRefund` | [finance/initiateRefund.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/initiateRefund.js) | `RAZORPAY_KEY_SECRET` | `secrets: [razorpayKeySecret]` | Lines 194–195 (invoked on line 118 for `GATEWAY` refunds) |
| `verifyPayment` | [finance/razorpay.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/razorpay.js) | `RAZORPAY_KEY_SECRET` | `secrets: [razorpayKeySecret]` | Lines 25–26 |
| `razorpayWebhook` | [finance/razorpay.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/razorpay.js) | `RAZORPAY_WEBHOOK_SECRET` | `secrets: [razorpayWebhookSecret]` | Line 109 |
| `generateEWayBill` | [index.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/index.js) | `CLEARTAX_AUTH_TOKEN` | `secrets: [cleartaxAuthToken]` | [ClearTaxProvider.js:15](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/src/providers/ClearTaxProvider.js#L15) |

---

## Item B: `whitelisted_riders` Real Document ID vs Phone Number Format

### 1. Format Comparison
- **Firebase Auth Phone Format (`request.auth.token.phone_number`)**: Always E.164 standardized format starting with country code (e.g. `+919876543210`).
- **Firestore Document ID Format in App & Database**:
  - In [AuthViewModel.kt:174](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/auth/AuthViewModel.kt#L174), `normalizePhoneNumber` returns `+91$clean10` (E.164, e.g., `+919876543210`).
  - In Admin panel [riderManagement.js:36](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal-Admin/src/services/riderManagement.js#L36) or legacy imports, documents are sometimes keyed by 10-digit plain phone (`9876543210`) or auto-ID with a `phone` field.

### 2. Firestore Rule Implementation
To securely support both E.164 and 10-digit ID formats while preventing unauthorized lookups, the rule in [firestore.rules](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/firestore.rules#L438) was updated to:
```firestore
    match /whitelisted_riders/{id} {
      allow get: if isAdmin() || (
        isAuthenticated() && (
          request.auth.token.phone_number == id ||
          request.auth.token.phone_number == ('+91' + id) ||
          (resource.data.phone != null && resource.data.phone == request.auth.token.phone_number) ||
          (resource.data.phone != null && ('+91' + resource.data.phone) == request.auth.token.phone_number)
        )
      );
      allow list: if isAdmin();
      allow update: if isAdmin() || (
        isAuthenticated() && 
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'uid', 'riderIdDisplay', 'registeredAt']) &&
        request.resource.data.uid == request.auth.uid
      );
      allow create, delete: if isAdmin();
    }
```

### 3. Emulator Test Verification Output
```text
PASS: 9.1 Rider with matching phone CAN get own whitelisted_riders doc (E.164)
PASS: 9.2 Rider with matching phone CAN get own whitelisted_riders doc (10-digit ID)
PASS: 9.3 Rider CANNOT get another rider's whitelisted_riders doc
PASS: 9.4 Rider CANNOT list whitelisted_riders collection
```

---

## Item C: Function-Level Tests & Custom Claims Role Audit

### 1. Function-Level Tests (`acceptBooking`, `rejectBooking`, `verifyStartOtp`, `verifyEndOtp`)
Implemented in [tests/p0_pass4_functions.test.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/tests/p0_pass4_functions.test.js).
Real execution output:
```text
--- 2. serviceMarketplace Role Authorization Guards ---
PASS: 2.1 acceptBooking correctly denied guest (unauthenticated)
PASS: 2.2 acceptBooking correctly denied customer (permission-denied)
PASS: 2.3 rejectBooking correctly denied guest (unauthenticated)
PASS: 2.4 rejectBooking correctly denied customer (permission-denied)
PASS: 2.5 verifyStartOtp correctly denied guest (unauthenticated)
PASS: 2.6 verifyStartOtp correctly denied customer (permission-denied)
PASS: 2.7 verifyEndOtp correctly denied guest (unauthenticated)
PASS: 2.8 verifyEndOtp correctly denied customer (permission-denied)

--- 3. Partner Assignment Checks (Wrong Partner vs Assigned Partner) ---
PASS: 3.1 verifyStartOtp denied wrong partner (Not assigned to this partner)
PASS: 3.2 verifyStartOtp allowed assigned partner with correct OTP (status -> IN_PROGRESS)
PASS: 3.3 verifyEndOtp denied wrong partner (Not assigned to this partner)
PASS: 3.4 verifyEndOtp allowed assigned partner with correct OTP (status -> COMPLETED)
```

### 2. Custom Claims (`role=Rider/Serviceman/Partner`) Location Audit
- **Grep Audit Result across Repository**:
  - `admin.auth().setCustomUserClaims(...)` exists **only** in:
    - [scripts/setAdminClaim.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/scripts/setAdminClaim.js#L40) (sets `{ admin: true }`)
    - [scripts/removeAdminClaim.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/scripts/removeAdminClaim.js#L29) (sets `{ admin: false }`)
- **Finding**:
  - **Custom claims for `role=Rider`, `role=Serviceman`, or `role=Partner` are currently set NOWHERE in Cloud Functions or backend scripts for real users.**
  - Real delivery app registration in [AuthViewModel.kt:300](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/auth/AuthViewModel.kt) writes `role: 'Rider'` to the Firestore document `users/{uid}`, but **does not** set Firebase Auth Custom Claims (`request.auth.token.role`).
  - To enforce server-authoritative custom claims in production, a dedicated Cloud Function (e.g. `onUserCreated` or admin callable `setUserRole`) must be added in v1.1.

---

## Item D: `getSecretVal` Production Condition & Throw Safeguard

### 1. Exact Implementation in [core/secrets.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/core/secrets.js#L11-L26)
```javascript
function getSecretVal(secretParam, envName) {
    try {
        if (secretParam && typeof secretParam.value === 'function') {
            const val = secretParam.value();
            if (val) return val;
        }
    } catch (e) {
        // Fallback when running outside Firebase runtime in unit tests
    }
    const isEmulatorOrTest = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'test';
    if (!isEmulatorOrTest) {
        throw new Error(`Secret ${envName} is missing or undefined in production environment.`);
    }
    return process.env[envName] || "";
}
```

### 2. Condition & Behavior Explanation
- **Production Mode (`!isEmulatorOrTest`)**: Triggered whenever `FUNCTIONS_EMULATOR !== 'true'` and `NODE_ENV !== 'test'`.
  - If `secretParam.value()` is unavailable or empty, it **immediately throws**:  
    `Error: Secret <NAME> is missing or undefined in production environment.`
  - It **never** falls back to `process.env` or empty string in production.
- **Emulator / Test Mode**: Fallback to `process.env[envName] || ""` is executed **only** when `isEmulatorOrTest === true`.

### 3. Unit Test Verification Output
```text
PASS: 1.1 getSecretVal in production mode throws on missing secret
PASS: 1.2 getSecretVal in emulator mode correctly returns process.env fallback
```

---

## Item E: Emulator Tests on `users/{uid}` Protected Fields

### 1. Protected Fields
The fields `isAdmin`, `admin`, `referredBy`, `hasCompletedFirstOrder`, `role`, `walletBalance`, `rewardPoints`, `referralCode`, `customClaims` are restricted against user write on `users/{uid}`.

### 2. Test Cases Executed in [tests/emulator_rules.test.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/tests/emulator_rules.test.js)
```text
PASS: 9.5 User CANNOT set isAdmin, admin, referredBy, hasCompletedFirstOrder on users/{uid} during CREATE
PASS: 9.6 User CANNOT update isAdmin, admin, referredBy, hasCompletedFirstOrder on users/{uid}
```

---

## Item F: Customer App Rider Reads Audit

### 1. Grep Results in Customer App (`app/src`)
- Direct read of `riders/{id}` collection: **0 occurrences** found.
- The customer app **never** queries or listens to `riders/{id}`.

### 2. Source of Rider Name and Location in Customer App
- **Live Location**:
  - Found in [OrderTrackingRepository.kt:39](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/data/repository/OrderTrackingRepository.kt#L39):
    ```kotlin
    val subscription = firestore.collection("orders").document(orderId)
        .addSnapshotListener { snapshot, error ->
            ...
            trySend(OrderTrackingState(
                status = snapshot.getString("status") ?: "PLACED",
                statusHistory = statusHistory,
                riderLocation = snapshot.getGeoPoint("riderLocation"),
                estimatedDeliveryTime = snapshot.getTimestamp("estimatedDeliveryTime"),
                isLoading = false
            ))
        }
    ```
    The rider location displayed in [OrderTrackingScreen.kt](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/tracking/OrderTrackingScreen.kt#L106) comes directly from `orders/{orderId}.riderLocation`.
- **Rider Name**:
  - Found in [RiderTrackingScreen.kt:150](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/tracking/RiderTrackingScreen.kt#L150): Contains a hardcoded preview mock string: `Text("Rider: Suresh Kumar", ...)`.
  - In production, rider details are communicated via `orders/{orderId}` notifications and metadata, not by reading `riders/{id}`.

---

## Item G: `updateOrderStatus` State Machine Table & Tests

### 1. Role-Based State Machine Table

| Current Status | Target Status | Allowed Role | Assigned Rider Restriction |
|---|---|---|---|
| `PLACED` | `CANCELLED` | Customer (`userId == uid`), Admin | N/A |
| `PLACED` | `PAYMENT_CONFIRMED` / `PROCUREMENT_PENDING` / `READY_FOR_PACKING` | Admin | N/A |
| `PAYMENT_CONFIRMED` | `CANCELLED` | Customer (`userId == uid`), Admin | N/A |
| `PAYMENT_CONFIRMED` | `PROCUREMENT_PENDING` / `READY_FOR_PACKING` | Admin | N/A |
| `PROCUREMENT_PENDING` | `READY_FOR_PACKING` / `CANCELLED` | Admin | N/A |
| `READY_FOR_PACKING` | `PACKING` / `CANCELLED` | Admin | N/A |
| `PACKING` | `PACKED` / `READY_FOR_PACKING` / `CANCELLED` | Admin | N/A |
| `PACKED` | `READY_FOR_PICKUP` / `RIDER_ASSIGNED` / `CANCELLED` | Admin | N/A |
| `READY_FOR_PICKUP` | `RIDER_ASSIGNED` / `CANCELLED` | Admin | N/A |
| `READY_FOR_PICKUP` / `RIDER_ASSIGNED` | `RIDER_ACCEPTED` | Rider, Admin | Must be assigned rider (`riderId == uid`) |
| `RIDER_ACCEPTED` | `OUT_FOR_DELIVERY` | Rider, Admin | Must be assigned rider (`riderId == uid`) |
| `OUT_FOR_DELIVERY` | `DELIVERY_FAILED` | Rider, Admin | Must be assigned rider (`riderId == uid`) |
| `OUT_FOR_DELIVERY` | `DELIVERED` | Admin only | **BLOCKED for Rider** (Must call `verifyDeliveryOTP`) |

### 2. Unit Test Verification Output
```text
--- 4. updateOrderStatus Role-Based State Machine Tests ---
PASS: 4.1 Customer CAN cancel own order from PLACED
PASS: 4.2 Customer CANNOT transition order to READY_FOR_PACKING (permission-denied)
PASS: 4.3 Unassigned user CANNOT update another user's order (permission-denied)
PASS: 4.4 Unassigned rider CANNOT update order (permission-denied)
PASS: 4.5 Assigned rider CAN accept order (RIDER_ASSIGNED -> RIDER_ACCEPTED)
PASS: 4.6 Assigned rider CAN start delivery (RIDER_ACCEPTED -> OUT_FOR_DELIVERY)
PASS: 4.7 Assigned rider CANNOT directly set DELIVERED in updateOrderStatus (blocked: must use OTP)
PASS: 4.8 Assigned rider CAN set DELIVERY_FAILED from OUT_FOR_DELIVERY
PASS: 4.9 Admin CAN perform operational transitions (PACKING -> PACKED)
```

---

## Item H: Real Execution Outputs

### 1. `npm test` Output ([KrishiVishal-Functions](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions))
```text
> test
> node tests/sku_inventory.test.js && node tests/idempotency.test.js && node tests/ledger.test.js && node tests/security_remediation.test.js && node tests/v4_audit_verification.js && node tests/crop_advisory.test.js && node tests/round2_features.test.js && node tests/p0_security_rules.test.js && node tests/p0_pass4_functions.test.js

--- KrishiVishal SKU & Inventory Test Suite ---
PASS: Test 1.1 (Valid Standard SKU FE-URE-GRN-46-050KG-IFF)
PASS: Test 1.2 (Valid Liquid SKU PE-GLY-LIQ-00-500ML-BAY)
PASS: Test 1.3 (Reject Invalid Formats & Unapproved Nomenclature)
PASS: Test 1.4 (Reject Invalid Category Code)
PASS: Test 1.5 (Reject Invalid Unit)
PASS: Test 1.6 (SKU Generator output: FE-DAP-GRN-18-050KG-IFF)
PASS: Test 2.1 (FEFO Multi-Batch Allocation: 5 from B1, 7 from B2)
PASS: Test 3.1 (Deterministic Idempotency Key Structure)
--- ALL SKU & INVENTORY TESTS PASSED ---
FIRST ATTEMPT: SUCCESS
SECOND ATTEMPT: SKIPPED (Reason: ALREADY_POSTED)
IDEMPOTENCY TEST: PASS
TEST 1 (PAID Order): PASS (D: 1180, C: 1180)
TEST 2 (Return Reversal): PASS (D: 940, C: 940)
TEST 3 (Bank Settlement): PASS (D: 1000, C: 1000)
--- KrishiVishal Security Test Suite ---
PASS: Test 1 (Auth rejected unauthenticated)
PASS: Test 2 (Admin rejected normal user)
PASS: Test 3 (Ownership rejected cross-user access)
PASS: Test 4 (State Machine rejected invalid DELIVERED -> PENDING transition)
PASS: Test 5 (Admin Override allowed)
--- KrishiVishal V4 Audit Verification ---
PASS: getRequiredSecret (Secret exists)
FATAL: Required secret missing: TEST_KEY
PASS: getRequiredSecret (Threw error for missing key)
=== RUNNING CROP STAGE ADVISORY ENGINE TESTS ===
✓ All crop normalization test cases PASSED.
✓ Crop stage calculation & agronomic guidance rules PASSED.
✓ Personalized advisory payload generation PASSED.
✓ Fallback farm name generation PASSED.
==========================================
ALL FEATURE 2 ADVISORY ENGINE TESTS PASSED!
==========================================
--- KrishiVishal Round 2 Features Unit Test Suite ---
PASS: Test 1.1 (Standard metric and volume formats converted to grams)
PASS: Test 1.2 (Edge cases: null, undefined, malformed strings)
PASS: Test 2.1 (Valid structured address parsed successfully)
PASS: Test 2.2 (Legacy string address correctly rejected)
PASS: Test 2.3 (Invalid pincode rejected)
PASS: Test 3.1 (Delivery slot concurrency & max capacity enforcement)
PASS: Test 3.2 (Slot deletion blocked when active bookings exist)
PASS: Test 4.1 (FCM token hashing is deterministic and idempotent)
All Round 2 features tests passed successfully!
=== RUNNING P0 SECURITY LOCKDOWN & RULES VERIFICATION TESTS ===
PASS: Test 1 (getRecommendations correctly rejected unauthenticated call)
PASS: Test 2 (generateSignedQRPayload correctly rejected non-admin user)
PASS: Test 3 (firestore.rules blocks direct client orders create)
PASS: Test 4 (firestore.rules blocks direct client ledger write)
PASS: Test 5 (firestore.rules blocks direct client SKU write)
==========================================
P0 SECURITY TESTS COMPLETED: 5 PASSED, 0 FAILED.
==========================================
=== RUNNING P0 PASS 4 FUNCTION-LEVEL TESTS ===
PASS: 1.1 getSecretVal in production mode throws on missing secret
PASS: 1.2 getSecretVal in emulator mode correctly returns process.env fallback
PASS: 2.1 acceptBooking correctly denied guest (unauthenticated)
PASS: 2.2 acceptBooking correctly denied customer (permission-denied)
PASS: 2.3 rejectBooking correctly denied guest (unauthenticated)
PASS: 2.4 rejectBooking correctly denied customer (permission-denied)
PASS: 2.5 verifyStartOtp correctly denied guest (unauthenticated)
PASS: 2.6 verifyStartOtp correctly denied customer (permission-denied)
PASS: 2.7 verifyEndOtp correctly denied guest (unauthenticated)
PASS: 2.8 verifyEndOtp correctly denied customer (permission-denied)
PASS: 3.1 verifyStartOtp denied wrong partner (Not assigned to this partner)
PASS: 3.2 verifyStartOtp allowed assigned partner with correct OTP (status -> IN_PROGRESS)
PASS: 3.3 verifyEndOtp denied wrong partner (Not assigned to this partner)
PASS: 3.4 verifyEndOtp allowed assigned partner with correct OTP (status -> COMPLETED)
PASS: 4.1 Customer CAN cancel own order from PLACED
PASS: 4.2 Customer CANNOT transition order to READY_FOR_PACKING (permission-denied)
PASS: 4.3 Unassigned user CANNOT update another user's order (permission-denied)
PASS: 4.4 Unassigned rider CANNOT update order (permission-denied)
PASS: 4.5 Assigned rider CAN accept order (RIDER_ASSIGNED -> RIDER_ACCEPTED)
PASS: 4.6 Assigned rider CAN start delivery (RIDER_ACCEPTED -> OUT_FOR_DELIVERY)
PASS: 4.7 Assigned rider CANNOT directly set DELIVERED in updateOrderStatus (blocked: must use OTP)
PASS: 4.8 Assigned rider CAN set DELIVERY_FAILED from OUT_FOR_DELIVERY
PASS: 4.9 Admin CAN perform operational transitions (PACKING -> PACKED)
==========================================
PASS 4 TESTS: 23 PASSED, 0 FAILED
==========================================
```

### 2. Firebase Emulator Rules Test Output
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
PASS: 8.1 Customer CANNOT change referralCode or rewardPoints on users/{uid}
PASS: 8.2 Anonymous user CANNOT read whitelisted_riders
PASS: 8.3 Non-owner non-admin CANNOT read riders/{riderId}
PASS: 8.4 Customer CANNOT read skus/{skuId}/batches
PASS: 8.5 Serviceman CAN read PENDING_ASSIGNMENT service_bookings
PASS: 9.1 Rider with matching phone CAN get own whitelisted_riders doc (E.164)
PASS: 9.2 Rider with matching phone CAN get own whitelisted_riders doc (10-digit ID)
PASS: 9.3 Rider CANNOT get another rider's whitelisted_riders doc
PASS: 9.4 Rider CANNOT list whitelisted_riders collection
PASS: 9.5 User CANNOT set isAdmin, admin, referredBy, hasCompletedFirstOrder on users/{uid} during CREATE
PASS: 9.6 User CANNOT update isAdmin, admin, referredBy, hasCompletedFirstOrder on users/{uid}

==========================================
EMULATOR RULES SUITE: 30 PASSED, 0 FAILED
==========================================
```

### 3. Android Gradle Build & Test Output (`.\gradlew.bat :app:testDebugUnitTest :delivery-app:testDebugUnitTest :core:testDebugUnitTest assembleDebug`)
```text
> Task :app:compileDebugKotlin UP-TO-DATE
> Task :app:testDebugUnitTest UP-TO-DATE
> Task :delivery-app:testDebugUnitTest NO-SOURCE
> Task :core:testDebugUnitTest NO-SOURCE
> Task :app:assembleDebug UP-TO-DATE
> Task :delivery-app:assembleDebug UP-TO-DATE

BUILD SUCCESSFUL in 24s
135 actionable tasks: 135 up-to-date
```

---

## Disclaimers & Unverified Items
- **Production Deployment**: NOT VERIFIED / NOT PERFORMED (`firebase deploy` was not run).
- **Live Custom Claims in Production**: NOT VERIFIED in Firebase Auth live project (backend script for automated claim propagation is planned for v1.1).
- **Actual Secret Values**: NOT SET / NOT PRINTED.
