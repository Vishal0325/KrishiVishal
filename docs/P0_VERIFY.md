# P0 Security Verification & Comprehensive Audit Report

**Date:** 2026-09-19  
**Verification Method:** Firebase Emulator Test (`firebase emulators:exec`), Codebase Grep Analysis, Secret Binding Inspection  
**Deployment Policy:** READ-ONLY Verification (No `firebase deploy` commands executed).

---

## 1. Firebase Emulator Security Rules Test Results

- **Test Command:** `npx firebase emulators:exec --only firestore "node tests/emulator_rules.test.js"`
- **Test Framework:** `@firebase/rules-unit-testing`
- **Result:** `PASS - 15 PASSED, 0 FAILED`

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

==========================================
EMULATOR RULES SUITE: 15 PASSED, 0 FAILED
==========================================
```

---

## 2. Direct Firestore Writes & Cloud Function Callers Audit

| Target Entity / Collection | App / Repository | Direct Firestore Writes Found? | Primary Cloud Function Entry Point | Callable Function Call Confirmation |
|---|---|---|---|---|
| `orders` | Customer App (`app`) | **NONE** (`UPDATE_ORDER` & `CREATE_ORDER` in `SyncManager` are un-queued dead code) | `createOrder` | **CONFIRMED:** Called in `OrderRepositoryImpl.kt` L94 via `createOrderViaFunction` |
| `returns` | Customer App (`app`) | **NONE** | `requestReturn` | **CONFIRMED:** Called in `ReturnRepository.kt` L47 |
| `service_bookings` | Customer App (`app`) | **Fallback exists** in `ServiceBookingRepository.kt` L113 (Primary is `createServiceBooking` Cloud Function) | `createServiceBooking` | **CONFIRMED:** Called in `ServiceBookingRepository.kt` L97 |
| `service_jobs` / Service Ops | Rider / Partner App (`KrishiVishalDelivery`) | **NONE** | `verifyStartOtp` / `verifyEndOtp` | **CONFIRMED:** Called in `ServiceBookingRepositoryImpl.kt` L86 & L96 |

---

## 3. Full Firestore Security Rules Matrix (All Collections)

| Collection Path | Read Rule (Current -> Proposed) | Create Rule (Current -> Proposed) | Update Rule (Current -> Proposed) | Delete Rule (Current -> Proposed) |
|---|---|---|---|---|
| `/products/{id}` | `true` -> `true` | `isAdmin()` -> `isAdmin()` | `isAdmin() && !affectedKeys().hasAny(['price', 'stockQuantity'])` -> Same | `isSuperAdmin()` -> Same |
| `/products/{id}/variants/{variantId}` | `true` -> `true` | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/products/{id}/reviews/{reviewId}` | `true` -> `true` | `auth.uid == request.userId` -> Same | `isAdmin() \|\| auth.uid == resource.userId` -> Same | `isAdmin() \|\| auth.uid == resource.userId` -> Same |
| `/skus/{skuId}` | `isAuthenticated()` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/skus/{skuId}/batches/{batchId}` | `isAuthenticated()` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/master_data/{doc=**}` | `true` -> `true` | `isAdmin()` -> `isAdmin()` | `isAdmin()` -> `isAdmin()` | `isAdmin()` -> `isAdmin()` |
| `/categories/{id}` | `true` -> `true` | `isAdmin()` -> `isAdmin()` | `isAdmin()` -> `isAdmin()` | `isAdmin()` -> `isAdmin()` |
| `/brands/{id}` | `true` -> `true` | `isAdmin()` -> `isAdmin()` | `isAdmin()` -> `isAdmin()` | `isAdmin()` -> `isAdmin()` |
| `/crops/{id}` | `true` -> `true` | `isAdmin()` -> `isAdmin()` | `isAdmin()` -> `isAdmin()` | `isAdmin()` -> `isAdmin()` |
| `/banners/{id}` | `true` -> `true` | `isAdmin()` -> `isAdmin()` | `isAdmin()` -> `isAdmin()` | `isAdmin()` -> `isAdmin()` |
| `/product_costs/{id}` | `canViewFinance()` -> Same | `canViewFinance()` -> Same | `canViewFinance()` -> Same | `canViewFinance()` -> Same |
| `/ledger/{id}` | `canViewFinance()` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/finance/{doc=**}` | `canViewFinance()` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/accounts/{accountId}` | `canViewFinance()` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/expenses/{id}` | `canViewFinance()` -> Same | `canViewFinance() && validFields` -> Same | `canViewFinance() && immutableKeys` -> Same | `isSuperAdmin()` -> Same |
| `/sales_stats/{statId}` | `isAdmin()` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/ai_activity_logs/{id}` | `isAdmin()` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/ai_action_requests/{id}` | `isAdmin()` -> Same | `false` -> `false` | `isAdmin() && affectedKeys.hasOnly(['status'])` -> Same | `false` -> `false` |
| `/escalations/{id}` | `isAdmin()` -> Same | `false` -> `false` | `isAdmin() && affectedKeys.hasOnly(['status'])` -> Same | `false` -> `false` |
| `/broadcast_notifications/{id}` | `isAuthenticated()` -> Same | `isAdmin()` -> Same | `false` -> `false` | `false` -> `false` |
| `/delivery_slots/{slotId}` | `isAuthenticated()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/orders/{orderId}` | `isAdmin() \|\| userId == auth.uid \|\| riderId == auth.uid` -> Same | `isAdmin() \|\| userId == auth.uid` -> **`isAdmin()`** | `isAdmin() \|\| Rider restricted fields` -> Same | `isSuperAdmin()` -> Same |
| `/orders/{orderId}/tracking/{id}` | `isAdmin() \|\| order.userId == auth.uid \|\| order.riderId == auth.uid` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/orders/{orderId}/internal/{doc=**}` | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/returns/{returnId}` | `isAdmin() \|\| userId == auth.uid \|\| riderId == auth.uid` -> Same | `isAuthenticated() && validFields` -> **`false`** | `isAdmin() \|\| Rider QC fields` -> Same | `isSuperAdmin()` -> Same |
| `/users/{uId}` | `isOwner() \|\| isAdmin() \|\| isViewer()` -> Same | `isOwner() && noProtectedFields` -> Same | `isSuperAdmin() \|\| (isOwner() && noProtectedFields)` -> Same | `isSuperAdmin()` -> Same |
| `/users/{uId}/addresses/{addressId}` | `isOwner() \|\| isAdmin()` -> Same | `isOwner() \|\| isAdmin()` -> Same | `isOwner() \|\| isAdmin()` -> Same | `isOwner() \|\| isAdmin()` -> Same |
| `/users/{uId}/cart/{cartItemId}` | `isOwner() \|\| isAdmin()` -> Same | `isOwner() \|\| isAdmin()` -> Same | `isOwner() \|\| isAdmin()` -> Same | `isOwner() \|\| isAdmin()` -> Same |
| `/users/{uId}/wishlist/{itemId}` | `isOwner() \|\| isAdmin()` -> Same | `isOwner() \|\| isAdmin()` -> Same | `isOwner() \|\| isAdmin()` -> Same | `isOwner() \|\| isAdmin()` -> Same |
| `/users/{uId}/notifications/{id}` | `isOwner() \|\| isAdmin()` -> Same | `isRider() && validFields` -> Same | `false` -> `false` | `false` -> `false` |
| `/users/{uId}/fcm_tokens/{tokenId}` | `isOwner() \|\| isAdmin()` -> Same | `isOwner() \|\| isAdmin()` -> Same | `isOwner() \|\| isAdmin()` -> Same | `isOwner() \|\| isAdmin()` -> Same |
| `/whitelisted_riders/{phone}` | `isAuthenticated()` -> Same | `isAdmin()` -> Same | `isAdmin() \|\| Rider self-update` -> Same | `isAdmin()` -> Same |
| `/riders/{riderId}` | `isAuthenticated() \|\| isAdmin() \|\| isViewer()` -> Same | `isAdmin() \|\| isOwner()` -> Same | `isAdmin() \|\| isOwner()` -> Same | `isAdmin()` -> Same |
| `/wishlists/{userId}/{itemId}` | `isOwner() \|\| isAdmin()` -> Same | `isOwner() \|\| isAdmin()` -> Same | `isOwner() \|\| isAdmin()` -> Same | `isOwner() \|\| isAdmin()` -> Same |
| `/stock_notification_requests/{id}` | `isAdmin()` -> Same | `auth.uid == request.userId` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/settings/{allPaths=**}` | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/sos_alerts/{alertId}` | `isAdmin() \|\| auth.uid == resource.userId` -> Same | `isAuthenticated()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/emergency_alerts/{alertId}` | `isAdmin() \|\| auth.uid == resource.userId` -> Same | `isAuthenticated()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/audit_logs/{id}` | `isAdmin()` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/referrals/{referralId}` | `referrerUid == auth.uid \|\| refereeUid == auth.uid \|\| isAdmin()` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/wallet_transactions/{txnId}` | `uid == auth.uid \|\| isAdmin()` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/suppliers/{supplierId}` | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/procurement_queue/{itemId}` | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/purchase_orders/{poId}` | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/goods_receipts/{grnId}` | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/inventory_movements/{movementId}` | `isAdmin()` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/warehouse_stock/{docId}` | `isAdmin()` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/warehouses/{warehouseId}` | `isAuthenticated()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/idempotency_keys/{key}` | `false` -> `false` | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/supplier_ledger/{id}` | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/customer_ledger/{id}` | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/unit_economics/{orderId}` | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/support_tickets/{ticketId}` | `auth.uid == resource.userId \|\| isAdmin()` -> Same | `auth.uid == request.userId` -> Same | `isAdmin() \|\| User message update` -> Same | `isAdmin()` -> Same |
| `/complaints/{complaintId}` | `auth.uid == resource.userId \|\| isAdmin()` -> Same | `auth.uid == request.userId` -> Same | `isAdmin() \|\| User description update` -> Same | `isAdmin()` -> Same |
| `/customer_feedback/{feedbackId}` | `auth.uid == resource.userId \|\| isAdmin()` -> Same | `auth.uid == request.userId` -> Same | `isAdmin() \|\| User rating update` -> Same | `isAdmin()` -> Same |
| `/notification_logs/{id}` | `isAdmin()` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/outbox/{id}` | `false` -> `false` | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/cash_deposits/{id}` | `isAdmin() \|\| auth.uid == resource.riderId` -> Same | `isRider() && auth.uid == request.riderId` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/abandoned_carts/{id}` | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same | `isAdmin()` -> Same |
| `/service_bookings/{bookingId}` | `farmerId \|\| partnerId \|\| PENDING \|\| isAdmin` -> Same | `auth.uid == request.farmerId` -> **`false`** | `false` -> `false` | `false` -> `false` |
| `/partner_wallets/{partnerId}` | `partnerId == auth.uid \|\| isAdmin()` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/partner_wallet_transactions/{txnId}` | `partnerId == auth.uid \|\| isAdmin()` -> Same | `false` -> `false` | `false` -> `false` | `false` -> `false` |
| `/services/{serviceId}` | `true` -> `true` | `isAdmin()` -> `isAdmin()` | `isAdmin()` -> `isAdmin()` | `isAdmin()` -> `isAdmin()` |
| Catch-all `/{document=**}` | `false` -> `false` | `false` -> `false` | `false` -> `false` | `false` -> `false` |

---

## 4. Complete Callable Functions (`onCall`) Auth & Role Catalog (All 44 Functions)

1. `createOrder`: `request.auth` YES, Role: Authenticated User (Owner)
2. `getAvailableSlots`: `request.auth` NO (Public slot lookup)
3. `deleteDeliverySlot`: `request.auth` YES, Role: Admin (`isAdminRequest`)
4. `requestReturn`: `request.auth` YES, Role: Authenticated User (Order Owner)
5. `verifyDeliveryOTP`: `request.auth` YES, Role: Assigned Rider / Admin
6. `cancelOrder`: `request.auth` YES, Role: Order Owner / Admin
7. `updateOrderStatus`: `request.auth` YES, Role: Assigned Rider / Admin
8. `generateSignedQRPayload`: `request.auth` YES, Role: Admin / Warehouse Manager (`isAdminRequest`)
9. `verifyPayment`: `request.auth` YES, Role: Authenticated User (Owner)
10. `initiateRefund`: `request.auth` YES, Role: Admin (`isAdminRequest`)
11. `payWithWallet`: `request.auth` YES, Role: Authenticated User (Owner)
12. `redeemWalletAtCheckout`: `request.auth` YES, Role: Authenticated User (Owner)
13. `createWalletTopUpOrder`: `request.auth` YES, Role: Authenticated User (Owner)
14. `verifyWalletTopUp`: `request.auth` YES, Role: Authenticated User (Owner)
15. `adminAdjustWallet`: `request.auth` YES, Role: Admin (`isAdminRequest`)
16. `getWalletHistory`: `request.auth` YES, Role: Authenticated User (Owner)
17. `recordExpensePayment`: `request.auth` YES, Role: Finance Admin (`canViewFinance`)
18. `deleteExpenseAttachment`: `request.auth` YES, Role: Finance Admin (`canViewFinance`)
19. `importSkus`: `request.auth` YES, Role: Admin (`isAdminRequest`)
20. `upsertSku`: `request.auth` YES, Role: Admin (`isAdminRequest`)
21. `receiveGrn`: `request.auth` YES, Role: Admin / Warehouse Manager (`isAdminRequest`)
22. `adjustInventory`: `request.auth` YES, Role: Admin / Warehouse Manager (`isAdminRequest`)
23. `writeOffStock`: `request.auth` YES, Role: Admin / Warehouse Manager (`isAdminRequest`)
24. `getInventoryReport`: `request.auth` YES, Role: Admin (`isAdminRequest`)
25. `migrateSkuWeights`: `request.auth` YES, Role: Admin (`isAdminRequest`)
26. `backfillProductMetadata`: `request.auth` YES, Role: Admin (`isAdminRequest`)
27. `getRecommendations`: `request.auth` YES, Role: Authenticated User (Anonymous Guest or Registered User)
28. `getOrCreateReferralCode`: `request.auth` YES, Role: Authenticated User (Owner)
29. `applyReferralCode`: `request.auth` YES, Role: Authenticated User (Owner)
30. `runAbandonedCartScan`: `request.auth` YES, Role: Admin (`isAdminRequest`)
31. `aiSupervisor`: `request.auth` YES, Role: Admin (`isAdminRequest`)
32. `processAiAction`: `request.auth` YES, Role: Admin (`isAdminRequest`)
33. `generateEWayBill`: `request.auth` YES, Role: Admin (`isAdminRequest`)
34. `registerFcmToken`: `request.auth` YES, Role: Authenticated User (Owner)
35. `deleteFcmToken`: `request.auth` YES, Role: Authenticated User (Owner)
36. `sendBroadcastNotification`: `request.auth` YES, Role: Admin (`isAdminRequest`)
37. `runCropAdvisoryEngine`: `request.auth` YES, Role: Admin (`isAdminRequest`)
38. `createServiceBooking`: `request.auth` YES, Role: Authenticated Farmer / Customer
39. `acceptBooking`: `request.auth` YES, Role: Serviceman / Partner
40. `verifyStartOtp`: `request.auth` YES, Role: Assigned Serviceman / Partner
41. `verifyEndOtp`: `request.auth` YES, Role: Assigned Serviceman / Partner
42. `rejectBooking`: `request.auth` YES, Role: Serviceman / Partner
43. `expandRadiusOnTimeout`: `request.auth` YES, Role: System / Admin
44. `rechargePartnerWallet`: `request.auth` YES, Role: Admin (`isAdminRequest`)

---

## 5. Cross-App Callers Analysis & Guest User Impact

### A. `generateSignedQRPayload` Callers
- **Caller Location:** `KrishiVishal-Admin/src/pages/PackingStation.jsx` L180.
- **Context:** Invoked by logged-in Warehouse Managers / Admins when completing package item verification and printing thermal shipping labels.
- **Guest User Impact:** **NONE.** Guest users do not have access to the Admin panel.

### B. `getRecommendations` Callers
- **Caller Locations:**
  - Customer App: `ProductRepositoryImpl.kt` L318 (invoked in `ProductDetailViewModel.kt` L402 and `CartViewModel.kt` L167).
  - Admin App: `ProductDetail.jsx` L58.
- **Guest User Impact:**  
  In the Android Customer App, guest users are automatically signed in anonymously on launch (`auth.signInAnonymously()`). Anonymous sessions possess a valid Firebase Auth UID (`request.auth != null`). Therefore, legitimate guest users **pass the auth check cleanly** without any disruption, while unauthenticated calls (e.g. scrapers or malicious direct HTTP calls) are blocked with `unauthenticated`.

---

## 6. Secret Binding & Declaration Audit (`defineSecret` / `secrets: []`)

### Current Binding Status
Secrets currently rely on `process.env.SECRET_NAME` without `defineSecret` declarations from `firebase-functions/params` or `secrets: [...]` binding arrays on function triggers.

| Secret Name | Referenced In Files | Missing V2 Secret Binding Declaration |
|---|---|---|
| `RAZORPAY_KEY_ID` | `orderFlow.js`, `razorpay.js`, `initiateRefund.js`, `walletTopUp.js` | Missing `const rzpKeyId = defineSecret("RAZORPAY_KEY_ID")` & `secrets: [rzpKeyId]` |
| `RAZORPAY_KEY_SECRET` | `orderFlow.js`, `razorpay.js`, `initiateRefund.js`, `walletTopUp.js` | Missing `const rzpKeySecret = defineSecret("RAZORPAY_KEY_SECRET")` & `secrets: [rzpKeySecret]` |
| `RAZORPAY_WEBHOOK_SECRET` | `index.js`, `razorpay.js` | Missing `const rzpWebhookSecret = defineSecret("RAZORPAY_WEBHOOK_SECRET")` & `secrets: [rzpWebhookSecret]` |
| `QR_HMAC_SECRET` | `index.js`, `orderFlow.js` | Missing `const qrHmacSecret = defineSecret("QR_HMAC_SECRET")` & `secrets: [qrHmacSecret]` |
| `CLEARTAX_AUTH_TOKEN` | `index.js`, `ClearTaxProvider.js` | Missing `const cleartaxToken = defineSecret("CLEARTAX_AUTH_TOKEN")` & `secrets: [cleartaxToken]` |
| `STORE_GSTIN` | `ClearTaxProvider.js` | Missing `const storeGstin = defineSecret("STORE_GSTIN")` |
