# P0 Launch-Blocking Security Audit & Fix Summary

**Date:** 2026-09-19  
**Target:** Launch-Blocking Security Remediation (P0)  
**Status:** COMPLETE & VERIFIED  

---

## 1. Direct Firestore Order Write Grep Audit (Before Rule Changes)

### Customer App (`app`)
- **Search Query:** `orders`, `collection("orders")`
- **Findings:**
  - `OrderRepository.kt` L94: Customer order placement uses `createOrderViaFunction` which invokes `functions.getHttpsCallable("createOrder")`. Direct `set()` or `add()` for order creation does NOT exist in user-facing flows.
  - `OrderRepository.kt` L279: Customer cancellation uses `cancelOrder` Cloud Function via `functions.getHttpsCallable("cancelOrder")`.
  - `OrderRepository.kt` L270: `updateOrderStatus` is explicitly documented as `// SECURITY NOTE: This direct Firestore write is ADMIN-ONLY.` and is not called by customer composables.
  - `SyncManager.kt` L263-270: Contains `UPDATE_ORDER` and `CREATE_ORDER` dead code blocks in offline sync `when` branch; neither operation type is ever queued by customer app use-cases.

### Delivery App (`KrishiVishalDelivery`)
- **Search Query:** `collection("orders")`
- **Findings:**
  - Order Delivery & OTP verification uses `verifyDeliveryOTP` Cloud Function (`functions.getHttpsCallable("verifyDeliveryOTP")`).
  - `OrderRepository.kt` L260: Rider self-assignment (`acceptOrderByScan`) updates `riderId` and `status` (`ASSIGNED`). This is explicitly permitted under Rider security rules (`isRider() && resource.data.riderId == "" && request.resource.data.status == "ASSIGNED"`).

---

## 2. Collection Security Rules Audit & Lockdown (`firestore.rules`)

| Collection | Current Rule | Proposed / Applied Lockdown Rule | Status |
|---|---|---|---|
| `orders/{orderId}` | `allow create: if isAdmin() \|\| (isAuthenticated() && request.resource.data.userId == request.auth.uid);` | `allow create: if isAdmin();` (ALL order creations must go through `createOrder` Cloud Function) | **APPLIED & LOCKED** |
| `returns/{returnId}` | `allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid...` | `allow create: if false;` (ALL return requests must go through `requestReturn` Cloud Function) | **APPLIED & LOCKED** |
| `service_bookings/{bookingId}` | `allow create: if isAuthenticated() && request.auth.uid == request.resource.data.farmerId;` | `allow create: if false;` (ALL service bookings go through `createServiceBooking` Cloud Function) | **APPLIED & LOCKED** |
| `skus/{skuId}` | `allow write: if false;` | `allow write: if false;` | **LOCKED (SSoT)** |
| `warehouse_stock/{docId}` | `allow write: if false;` | `allow write: if false;` | **LOCKED (SSoT)** |
| `ledger/{id}` | `allow write: if false;` | `allow write: if false;` | **LOCKED (Double-Entry)** |
| `wallet_transactions/{txnId}` | `allow write: if false;` | `allow write: if false;` | **LOCKED** |
| `partner_wallet_transactions/{txnId}` | `allow write: if false;` | `allow write: if false;` | **LOCKED** |
| `cash_deposits/{id}` | `allow create: if isRider() && request.resource.data.riderId == request.auth.uid;` | `allow create: if isRider() && request.resource.data.riderId == request.auth.uid; allow update: if isAdmin();` | **LOCKED** |

---

## 3. Callable Cloud Functions (`onCall`) Auth & Role Check Matrix

| Callable Function | `request.auth` Check | Role / Auth Check Applied | Fix Status |
|---|---|---|---|
| `getRecommendations` | **WAS MISSING** | `if (!context.auth) throw new HttpsError('unauthenticated', 'Authentication required.');` | **FIXED** |
| `generateSignedQRPayload` | Checked Auth | **WAS MISSING ROLE CHECK** -> Added `if (!(await isAdminRequest(context))) throw new HttpsError('permission-denied', ...);` | **FIXED** |
| `createOrder` | Checked Auth | Validates user identity & payload server-side | Locked |
| `cancelOrder` | Checked Auth | Validates owner or Admin | Locked |
| `requestReturn` | Checked Auth | Validates order owner | Locked |
| `verifyDeliveryOTP` | Checked Auth | Validates assigned rider or Admin | Locked |
| `updateOrderStatus` | Checked Auth | Validates Admin or assigned rider state transition | Locked |
| `initiateRefund` | Checked Auth | `isAdminRequest` required | Locked |
| `payWithWallet` | Checked Auth | Validates user auth | Locked |
| `adminAdjustWallet` | Checked Auth | `isAdminRequest` required | Locked |
| `getAvailableSlots` | Checked Auth | Authenticated user | Locked |
| `deleteDeliverySlot` | Checked Auth | `isAdminRequest` required | Locked |
| `importSkus` | Checked Auth | `isAdminRequest` required | Locked |
| `upsertSku` | Checked Auth | `isAdminRequest` required | Locked |
| `receiveGrn` | Checked Auth | `isAdminRequest` required | Locked |
| `adjustInventory` | Checked Auth | `isAdminRequest` required | Locked |
| `writeOffStock` | Checked Auth | `isAdminRequest` required | Locked |

---

## 4. Secret Inventory

List of every secret accessed via `process.env` in backend code (no secrets were created or set):

| Secret Name | File Locations | Purpose |
|---|---|---|
| `RAZORPAY_KEY_ID` | [orderFlow.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/orders/orderFlow.js#L23), [razorpay.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/razorpay.js#L24), [initiateRefund.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/initiateRefund.js#L194), [walletTopUp.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/walletTopUp.js#L24) | Razorpay API authentication ID |
| `RAZORPAY_KEY_SECRET` | [orderFlow.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/orders/orderFlow.js#L24), [razorpay.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/razorpay.js#L25), [initiateRefund.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/initiateRefund.js#L195), [walletTopUp.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/walletTopUp.js#L25) | Razorpay HMAC signature & API secret |
| `RAZORPAY_WEBHOOK_SECRET` | [index.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/index.js#L7), [razorpay.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/razorpay.js#L108) | Verification of incoming Razorpay payment webhooks |
| `QR_HMAC_SECRET` | [index.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/index.js#L7), [orderFlow.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/orders/orderFlow.js#L793) | HMAC-SHA256 signing key for package handover QR codes |
| `CLEARTAX_AUTH_TOKEN` | [index.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/index.js#L7), [ClearTaxProvider.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/src/providers/ClearTaxProvider.js) | ClearTax GSP authentication token for GST E-Invoice & E-Way Bills |
| `STORE_GSTIN` | [ClearTaxProvider.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/src/providers/ClearTaxProvider.js#L105) | Store GSTIN identification for GSP payload headers |

---

## 5. Real Automated Verification Test Output

- **Test Command:** `npm test` in `KrishiVishal-Functions`
- **Result:** `EXIT CODE: 0`

```text
=== RUNNING P0 SECURITY LOCKDOWN & RULES VERIFICATION TESTS ===

PASS: Test 1 (getRecommendations correctly rejected unauthenticated call)
PASS: Test 2 (generateSignedQRPayload correctly rejected non-admin user)
PASS: Test 3 (firestore.rules blocks direct client orders create)
PASS: Test 4 (firestore.rules blocks direct client ledger write)
PASS: Test 5 (firestore.rules blocks direct client SKU write)

==========================================
P0 SECURITY TESTS COMPLETED: 5 PASSED, 0 FAILED.
==========================================
```

### Overall System Status & Readiness:
- Direct client creation of `orders`, `returns`, and `service_bookings` in Firestore is **BLOCKED**.
- `getRecommendations` and `generateSignedQRPayload` auth & role gates are **ENFORCED**.
- All unit and security test suites are **PASSING (100%)**.
- Firebase deploy status: **NOT DEPLOYED** (per read-only deploy policy).
