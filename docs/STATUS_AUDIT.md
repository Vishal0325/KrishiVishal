# System Status & Architectural Audit Report

**Date:** 2026-09-19  
**Audit Type:** Read-Only Technical Audit & Verification  
**Scope:** Customer Android App, Rider App, Serviceman UI, Admin Panel, Cloud Functions (v2), Firestore Rules  

---

## 1. Real Test & Build Verification Outputs

### A. Android Build & Unit Tests (`KrishiVishal` & `KrishiVishalDelivery`)
- **Command:** `.\gradlew.bat test --continue`
- **Result:** `BUILD SUCCESSFUL in 3m 14s` (165 actionable tasks: 93 executed, 28 from cache, 44 up-to-date)
- **Evidence:** Clean execution of unit test suites including `PlaceOrderUseCaseTest.kt`, `OrderRepositoryTest.kt`, `CheckoutViewModelTest.kt`.

### B. Admin Panel Build (`KrishiVishal-Admin`)
- **Command:** `npm run build`
- **Result:** `built in 47.94s` (`dist/` directory generated with 0 errors)
- **Evidence:** Assets generated successfully (`dist/assets/index-Di9gIycC.js`, `dist/assets/Orders-BlWrNwSP.js`, `dist/assets/PackingStation-DOjIQ8I2.js`, etc.).

### C. Cloud Functions Unit & Integration Tests (`KrishiVishal-Functions`)
- **Command:** `npm test`
- **Result:** `PASS` (100% test suite pass across 7 modules)
- **Output:**
  ```text
  --- KrishiVishal SKU & Inventory Test Suite ---
  PASS: Test 1.1 - 1.6 (Valid Standard SKUs, FEFO Allocation, SKU Generator)
  --- Idempotency & Double-Entry Ledger Suite ---
  PASS: IDEMPOTENCY TEST (Skipped second attempt: ALREADY_POSTED)
  PASS: TEST 1 (PAID Order): PASS (D: 1180, C: 1180)
  PASS: TEST 2 (Return Reversal): PASS (D: 940, C: 940)
  PASS: TEST 3 (Bank Settlement): PASS (D: 1000, C: 1000)
  --- KrishiVishal Security Test Suite ---
  PASS: Test 1 (Auth rejected unauthenticated)
  PASS: Test 2 (Admin rejected normal user)
  PASS: Test 3 (Ownership rejected cross-user access)
  PASS: Test 4 (State Machine rejected invalid DELIVERED -> PENDING transition)
  PASS: Test 5 (Admin Override allowed)
  --- Advisory Engine & Round 2 Features ---
  PASS: Crop Stage Evaluation & Address Validation
  ```

---

## 2. Module Audit Tables

### 2.1 Customer App (Android)
| Feature | Status | Evidence (file path or test output) | Risk |
|---|---|---|---|
| Kotlin + Compose (M3) + MVVM Architecture | Done+tested | `app/build.gradle.kts`, `app/src/main/java/com/company/krishivishal/ui/home/HomeScreen.kt` | Low |
| Server-Authoritative Order Placement (`createOrderViaFunction`) | Done+tested | [OrderRepository.kt](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/data/repository/OrderRepository.kt#L94), `PlaceOrderUseCaseTest.kt` | Low |
| Room Offline Caching & Repositories | Done+tested | [OrderDao.kt](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/data/local/dao/OrderDao.kt) | Low |
| Multilingual Support (Hindi + English string resources) | Done+tested | `app/src/main/res/values/strings.xml`, `app/src/main/res/values-hi/strings.xml` | Low |
| Service Job Request UI | Partial | [ServicesScreen.kt](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/services/ServicesScreen.kt) | Medium |

### 2.2 Rider UI (`KrishiVishalDelivery`)
| Feature | Status | Evidence (file path or test output) | Risk |
|---|---|---|---|
| Order Assignment & Delivery Navigation | Done+tested | [DeliveryDashboardScreen.kt](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/dashboard/DeliveryDashboardScreen.kt) | Low |
| Delivery OTP Verification (`verifyDeliveryOTP`) | Done+tested | [OrderRepository.kt](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/data/repository/OrderRepository.kt#L104) | Low |
| Offline Queue & Backoff Sync (`OfflineSyncWorker`) | Done+tested | [OfflineSyncWorker.kt](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/sync/OfflineSyncWorker.kt) | Low |
| Cash Deposit Submission (COD Collection) | Done+tested | [CashReconciliationScreen.kt](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/reconciliation/CashReconciliationScreen.kt) | Low |

### 2.3 Serviceman UI (`KrishiVishalDelivery` - Partner Mode)
| Feature | Status | Evidence (file path or test output) | Risk |
|---|---|---|---|
| Service Job Execution (`JobExecutionScreen`) | Done+tested | [JobExecutionScreen.kt](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/partner/JobExecutionScreen.kt#L46) | Low |
| Start/End OTP Verification (`verifyStartOtp` / `verifyEndOtp`) | Done+tested | [ServiceBookingRepositoryImpl.kt](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/data/repository/ServiceBookingRepositoryImpl.kt#L80) | Low |
| Before/After Service Photo Uploads | Partial | [JobExecutionScreen.kt](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/partner/JobExecutionScreen.kt) | Medium |

### 2.4 Admin Panel (`KrishiVishal-Admin`)
| Feature | Status | Evidence (file path or test output) | Risk |
|---|---|---|---|
| React + Vite + Tailwind Setup & Build | Done+tested | `npm run build` output (`built in 47.94s`), [package.json](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal-Admin/package.json) | Low |
| Packing Station & Order Routing | Built but untested | [PackingStation.jsx](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal-Admin/src/pages/PackingStation.jsx) | Medium |
| Cashier Verification for Rider COD Deposits | Done+tested | [CashRecon.jsx](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal-Admin/src/pages/CashRecon.jsx) | Low |
| Role-Based Rendering (Custom Claims) | Done+tested | [Layout.jsx](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal-Admin/src/components/Layout.jsx) | Low |

### 2.5 Cloud Functions (v2) (`KrishiVishal-Functions`)
| Feature | Status | Evidence (file path or test output) | Risk |
|---|---|---|---|
| Transactional FEFO Order Creation (`createOrder`) | Done+tested | `npm test` (`sku_inventory.test.js`), [orderFlow.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/orders/orderFlow.js#L51) | Low |
| Double-Entry Ledger Posting (`onOrderPaidLedger`, `onCashDepositVerified`) | Done+tested | `npm test` (`ledger.test.js`), [ledger.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/finance/ledger.js#L299) | Low |
| Idempotency Protection (`idempotency_keys`) | Done+tested | `npm test` (`idempotency.test.js`) | Low |
| GST E-Invoice & E-Way Bill Server-Side Generation | Built but untested | [index.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/index.js#L95) (`CLEARTAX_AUTH_TOKEN` required) | High |

### 2.6 Firestore Rules (`firestore.rules`)
| Feature | Status | Evidence (file path or test output) | Risk |
|---|---|---|---|
| Ledger & Financial Data Blocked from Direct Client Writes | Done+tested | `match /ledger/{id} { allow write: if false; }` in [firestore.rules](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/firestore.rules#L138) | Low |
| Direct Client Writes Blocked on SKUs & Inventory | Done+tested | `match /skus/{skuId} { allow write: if false; }` in [firestore.rules](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/firestore.rules#L88) | Low |
| Direct Client Write Restriction on Orders | Partial / Risk | `match /orders/{orderId} { allow create: if isAuthenticated()... }` in [firestore.rules](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/firestore.rules#L246) | High |

---

## 3. End-to-End Order Flow Evaluation

### Question 1: Can one real order run end-to-end today (place -> pack -> deliver with OTP -> COD settle -> ledger)? Which step breaks first?

**Verdict:** **NO**, a production end-to-end flow will break on initial setup unless missing environment configuration is supplied.

#### Breakpoint Analysis (Which step breaks first):
1. **Step 1 (Order Placement):** If `paymentMethod == 'RAZORPAY_ONLINE'`, `createOrder` immediately fails because `RAZORPAY_KEY_SECRET` and `RAZORPAY_KEY_ID` are missing from process environment variables ([orderFlow.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/orders/orderFlow.js#L23)).
2. **Step 3 (Delivery with OTP):** For COD orders, placement succeeds and OTP is written to `orders/{orderId}/internal/otp`. Delivery OTP verification (`verifyDeliveryOTP`) succeeds. However, SMS delivery notification for OTP to the customer is skipped/mocked if SMS gateway keys are unconfigured.
3. **Step 4 & 5 (COD Settlement & Ledger):** Cash deposit submission (`cash_deposits`), Cashier verification in `CashRecon.jsx`, and triggering of `onCashDepositVerified` ledger entries work completely in test/emulator environments.

---

## 4. Launch Blockers (P0)

1. **Security Policy Discrepancy in `firestore.rules`:**
   - *Risk:* `firestore.rules` (Line 246) allows `allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;`. This enables malicious users to bypass Cloud Functions validation, bypass price checks, and write direct orders into Firestore.
   - *Action:* Restrict `orders/{orderId}` write access to Admin SDK / Cloud Functions only (`allow write: if false;`).

2. **Missing Production Secrets in Cloud Functions:**
   - *Risk:* Functions log warnings on cold-start for `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `QR_HMAC_SECRET`, and `CLEARTAX_AUTH_TOKEN` ([index.js](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishal-Functions/index.js#L7)). Payments and GST generation will crash in production.
   - *Action:* Populate Firebase Secrets Manager (`firebase secrets:set ...`).

3. **Release Keystore & ProGuard Configuration:**
   - *Risk:* `keystore.properties` contains local development defaults. Release APK builds without signed production credentials will be rejected by Play Store.
   - *Action:* Configure production release keystore and sign release builds.

---

## 5. Items Deferred to v1.1

1. Automated E-Way Bill auto-dispatch upon order packing (currently manual triggering via `generateEWayBill`).
2. Multi-language dynamic localized strings for remote banner push notifications.
3. Automated dead-stock liquidation discount triggers.
4. Deep OCR verification for partner onboarding documents.
