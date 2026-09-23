# KrishiVishal Delivery App Architecture & Dual UI Workflows (Master Index)
**Document Version**: 2.0  
**Target Subproject**: `KrishiVishalDelivery`  
**Purpose**: Rapid Error Diagnosis & Resolution Guide using Unique Error Codes (`E-001` to `E-999`).

---

## 📑 How to Use this Numbered Index
Jab bhi app mein koi problem ya error aaye, sirf uska **Error / Point Number (jaise `E-203` ya `E-402`)** batayein. Antigravity turant corresponding code file aur fix identify karke fast resolution dega.

---

## 🧭 Master Quick Index Table

| Error Code Range | System Area / Module | Key Files Involved |
|---|---|---|
| **E-100 to E-199** | **Authentication, Whitelist & Dual UI Role Resolution** | `LoginScreen.kt`, `AuthViewModel.kt`, `DashboardViewModel.kt` |
| **E-200 to E-299** | **Warehouse Hub Pickup, QR Scanning & Morning Batch** | `QRScannerScreen.kt`, `OrderRepository.kt`, `ScannerViewModel.kt` |
| **E-300 to E-399** | **Delivery Flow, Navigation, Search & Farmer Contact** | `DashboardScreen.kt`, `OrderDetailScreen.kt`, `OrderCard` |
| **E-400 to E-499** | **Cash On Delivery (COD), UPI QR & Vault Reconciliation** | `DynamicUpiQrDialog.kt`, `CashReconciliationScreen.kt`, `CashDepositSlipDialog.kt` |
| **E-500 to E-599** | **Proof of Delivery (POD), OTP, Photos & Signatures** | `ProofOfDeliveryScreen.kt`, `Cloud Functions: verifyDeliveryOTP` |
| **E-600 to E-699** | **Failed Delivery, Reattempt & RTO Return Workflows** | `ReattemptDialog.kt`, `ReturnDetailScreen.kt`, `ReturnRequest.kt` |
| **E-700 to E-799** | **Service Partner Mode (Agri Services / Drone / Soil Test)** | `IncomingJobAlertScreen.kt`, `JobExecutionScreen.kt`, `NavGraph.kt` |
| **E-800 to E-899** | **Agri-Service Area Measurement, OTPs & Billing Settlement** | `ServiceBookingRepository.kt`, `DashboardViewModel.kt`, `PartnerWalletScreen.kt` |
| **E-900 to E-999** | **Offline Sync, GPS Tracking & Admin Portal Integration** | `RiderLocationService.kt`, `RuralOfflineBanner.kt`, `riderManagement.js` |

---

## 🔐 [E-100 to E-199] Authentication & Dual UI Role Resolution

### `[E-101]` Phone OTP Login & Firebase Session
- **Files**: [`LoginScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/auth/LoginScreen.kt), [`AuthViewModel.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/auth/AuthViewModel.kt)
- **Rule**: Phone number se 6-digit OTP verify hota hai.
- **Error Condition**: SMS OTP deliver nahi ho raha ya invalid token error aa raha hai.
- **Fix Action**: Check SHA-256 in Firebase Console & verify Play Integrity SafetyNet token.

### `[E-102]` Firestore Whitelist Verification
- **Files**: `whitelisted_riders` Firestore collection, [`AuthViewModel.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/auth/AuthViewModel.kt)
- **Rule**: Agar rider ka phone `whitelisted_riders` me nahi hai ya `isActive == false` hai, to login block hoga (`ACCESS_DENIED`).
- **Error Condition**: "Account not approved by Admin" screen loop.
- **Fix Action**: Admin Portal me Jake phone whitelist karein ya `isActive = true` set karein.

### `[E-103]` Dual UI Mode Switching (Rider vs Service Partner)
- **Files**: [`DashboardViewModel.kt` (partnerRole map)](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/dashboard/DashboardViewModel.kt#L55-L66), [`DashboardScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/dashboard/DashboardScreen.kt#L78-L86)
- **Rule**:
  - `role == 'RIDER'` -> Tabs: `["Deliveries", "Returns"]`
  - `role == 'SERVICE_MAN' / 'SERVICE_PARTNER'` -> Tabs: `["Services"]`
  - `role == 'BOTH'` -> Tabs: `["Deliveries", "Returns", "Services"]`
- **Error Condition**: Service man ko delivery tab dikh raha hai ya rider ko service jobs.
- **Fix Action**: `riderProfile.role` aur `partnerRole` strings ko lowercase sanitize karke verify karein.

### `[E-104]` Online / Offline GPS Location Switch
- **Files**: [`DashboardScreen.kt` (TopAppBar Switch)](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/dashboard/DashboardScreen.kt#L140-L165), [`RiderLocationService.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/service/RiderLocationService.kt)
- **Rule**: Toggle ON hone par Foreground Location Service start hoti hai aur Firestore me `isOnline = true` update hota hai.
- **Error Condition**: Switch turn ON karne par turant wapas OFF ho jata hai.
- **Fix Action**: Check Runtime Location Permissions (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `POST_NOTIFICATIONS`).

---

## 📦 [E-200 to E-299] Warehouse Hub Pickup & Order Scanning

### `[E-201]` Barcode / QR Code Decoding
- **Files**: [`QRScannerScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/scanner/QRScannerScreen.kt), [`OrderRepository.kt` (`parseScannedOrderId`)](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/data/repository/OrderRepository.kt#L310-L330)
- **Rule**: Scanned raw text se Order ID extract hoti hai (`AWB-123456`, JSON payload, ya plain ID).
- **Error Condition**: Camera scan karne par beep hoti hai par order accept nahi hota.
- **Fix Action**: Check `parseScannedOrderId` regex split aur ML Kit barcode formats.

### `[E-202]` Order State Validation during Scan
- **Files**: [`OrderRepository.kt` (`acceptOrderByScan`)](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/data/repository/OrderRepository.kt#L330-L345)
- **Rule**: Scanned order ka status `PLACED`, `CONFIRMED`, `PACKED`, `READY_FOR_PICKUP`, `READY_FOR_DISPATCH`, ya `ASSIGNED` hona zaroori hai.
- **Error Condition**: "Invalid status" exception thrown during pickup scan.
- **Fix Action**: Verify status string matches allowed warehouse lifecycle states.

### `[E-203]` Cloud Function Auto-Assignment on Scan
- **Files**: [`OrderRepository.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/data/repository/OrderRepository.kt), `functions/index.js` (`updateOrderStatus`)
- **Rule**: Client seedha Firestore write nahi karta; Cloud Function `updateOrderStatus` status ko `ASSIGNED` karta hai aur local Room DB update hoti hai.
- **Error Condition**: "Network timeout" ya permission error on scan.
- **Fix Action**: Check Firebase Auth Bearer token in Cloud Function caller.

---

## 🗺️ [E-300 to E-399] Delivery Flow, Navigation & Customer Search

### `[E-301]` Shortest Route TSP Sequence (1-2-3-4 Optimization)
- **Files**: [`DashboardViewModel.kt` (`computeShortestRoute`)](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/dashboard/DashboardViewModel.kt#L249-L320), [`TripSummaryCard`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/dashboard/DashboardScreen.kt#L850-L879)
- **Rule**: Nearest-Neighbor Heuristic algorithm rider ke GPS location se sabhi pending orders ka shortest distance calculate karta hai.
- **Error Condition**: Route stops galat sequence me dikh rahe hain ya distance 0.0 km aa raha hai.
- **Fix Action**: Check target latitude/longitude non-zero in order document.

### `[E-302]` Instant Search Bar Filter
- **Files**: [`DashboardScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/dashboard/DashboardScreen.kt#L295-L330)
- **Rule**: Search bar Order ID (AWB), Farmer Name, Mobile Number, Address, aur Landmark par real-time client-side filter karta hai.
- **Error Condition**: Search karne par blank list aa rahi hai.
- **Fix Action**: Check case-insensitive `contains()` aur whitespace `trim()`.

### `[E-303]` Quick Status Filter Chips
- **Files**: [`DashboardScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/dashboard/DashboardScreen.kt#L330-L395)
- **Rule**: Chips `All (N)`, `Pending (N)`, `Picked (N)`, `Delivered (N)` status groups ke hisab se count aur filter maintain karte hain.
- **Error Condition**: Filter chip click karne par galat counts ya empty state.
- **Fix Action**: Verify status list categorizations in `pendingStatuses` and `pickedStatuses`.

### `[E-304]` 1-Tap Google Maps Navigation
- **Files**: [`OrderDetailScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/order_detail/OrderDetailScreen.kt#L250-L275), [`OrderCard`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/dashboard/DashboardScreen.kt#L960-L980)
- **Rule**: Agar GPS coords present hain to `google.navigation:q=lat,lng&mode=d` launch hota hai; warna Rural Landmark fallback query pass hoti hai.
- **Error Condition**: Maps app nahi khul raha ya wrong location pin ho rahi hai.
- **Fix Action**: Check Uri encoding of address strings in Intent.

### `[E-305]` 1-Tap Call & 1-Tap WhatsApp to Farmer
- **Files**: [`OrderDetailScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/order_detail/OrderDetailScreen.kt#L220-L250), [`OrderCard`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/dashboard/DashboardScreen.kt#L945-L965)
- **Rule**: WhatsApp button phone number se `+91` aur spaces clean karke `https://api.whatsapp.com/send?phone=...` deep link launch karta hai with pre-filled message.
- **Error Condition**: WhatsApp chat nahi khul rahi ya invalid number format error.
- **Fix Action**: Verify phone sanitization regex (`replace("+91", "").replace(" ", "").trim()`).

---

## 💰 [E-400 to E-499] COD Cash, Dynamic UPI QR & Vault Reconciliation

### `[E-401]` Dynamic UPI QR Code Generation (100% Offline ZXing)
- **Files**: [`DynamicUpiQrDialog.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/order_detail/components/DynamicUpiQrDialog.kt)
- **Rule**: NPCI standard UPI URI `upi://pay?pa=...&pn=...&am=...&tn=...` ko in-app ZXing `QRCodeWriter` se local Bitmap render kiya jata hai (zero internet requirement).
- **Error Condition**: QR code image load nahi ho rahi ya distorted aa rahi hai.
- **Fix Action**: Verify ZXing `QRCodeWriter.encode()` matrix width/height bitmap dimensions (512x512).

### `[E-402]` COD Vault Limit & Security Auto-Lock
- **Files**: [`DashboardViewModel.kt` (`COD_VAULT_LIMIT = 15000.0`)](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/dashboard/DashboardViewModel.kt#L40-L42), [`CodVaultSecurityBanner`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/dashboard/DashboardScreen.kt#L735-L765)
- **Rule**: Agar rider ka `cashInHand >= ₹15,000` ho jaye, to app auto-lock warning banner trigger karta hai aur warehouse cash deposit mandate karta hai.
- **Error Condition**: Cash deposit ke baad bhi banner nahi hat raha.
- **Fix Action**: Admin Hub manager se deposit slip status `APPROVED` mark karwayein.

### `[E-403]` Hub Cash Reconciliation & Deposit Slip Submission
- **Files**: [`CashReconciliationScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/reconciliation/CashReconciliationScreen.kt), [`CashDepositSlipDialog.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/reconciliation/components/CashDepositSlipDialog.kt)
- **Rule**: Rider delivered COD orders select karke deposit slip submit karta hai (`cash_deposits` collection) -> Hub Manager verify karta hai -> `isCashDeposited = true`.
- **Error Condition**: Deposit request submission fails with permission-denied.
- **Fix Action**: Check Firestore Rules for `cash_deposits` collection write permissions.

---

## ✍️ [E-500 to E-599] Proof of Delivery (POD), OTP & Signatures

### `[E-501]` Delivery OTP Verification
- **Files**: [`ProofOfDeliveryScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/pod/ProofOfDeliveryScreen.kt#L70-L100), [`OrderRepository.kt` (`verifyOrderDelivery`)](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/data/repository/OrderRepository.kt#L101-L110)
- **Rule**: Farmer ke phone par bheja gaya 4/6 digit OTP Cloud Function `verifyDeliveryOTP` dwara server par match hota hai.
- **Error Condition**: "Incorrect OTP entered" error.
- **Fix Action**: Match OTP with `customerOTP` field in Firestore order document.

### `[E-502]` POD Camera Photo Capture & Local Storage
- **Files**: [`ProofOfDeliveryScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/pod/ProofOfDeliveryScreen.kt), [`OrderRepository.kt` (`syncPendingOrders`)](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/data/repository/OrderRepository.kt#L112-L135)
- **Rule**: Delivery photo pehle local cache me save hoti hai, aur network aane par Firebase Storage `orders/{orderId}/pod_photo.jpg` par upload hoti hai.
- **Error Condition**: Storage upload failed ya photo crash.
- **Fix Action**: Verify Camera Permission in Manifest & Firebase Storage rules for `orders/**`.

### `[E-503]` Digital Signature Canvas Draw
- **Files**: [`ProofOfDeliveryScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/pod/ProofOfDeliveryScreen.kt)
- **Rule**: Farmer finger touch se Canvas par sign karta hai jo local bitmap me convert hota hai.
- **Error Condition**: Signature draw nahi ho raha ya clear button unresponsive hai.
- **Fix Action**: Verify pointerInput drag gesture handler offset coordinates.

---

## 🔄 [E-600 to E-699] Failed Delivery, Reattempt & RTO Workflows

### `[E-601]` Delivery Reattempt & Failure Reporting
- **Files**: [`ReattemptDialog.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/order_detail/components/ReattemptDialog.kt), [`DashboardViewModel.kt` (`reportDeliveryFailure`)](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/dashboard/DashboardViewModel.kt)
- **Rule**: Reasons: `CUSTOMER_UNAVAILABLE`, `WRONG_ADDRESS`, `CUSTOMER_REFUSED`, `PAYMENT_ISSUE`, `DAMAGED_PACKAGE`. Status -> `DELIVERY_FAILED` ya `RETURN_TO_ORIGIN`.
- **Error Condition**: Reason submit karne par order status change nahi hota.
- **Fix Action**: Check `statusHistory` array append in Firestore update payload.

### `[E-602]` Customer Return Pickup QC Checklist
- **Files**: [`ReturnDetailScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/returns/ReturnDetailScreen.kt)
- **Rule**: Return pickup ke samay rider 3 QC checks verify karta hai: 1) Package Intact, 2) Reason Matched, 3) Photo Proof.
- **Error Condition**: "Submit QC" button disabled.
- **Fix Action**: Ensure mandatory photo proof is captured and QC result selected.

---

## 🌾 [E-700 to E-799] Service Partner Mode (Agri Services)

### `[E-701]` FCM Push Job Alert Deep Linking
- **Files**: [`AndroidManifest.xml`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/AndroidManifest.xml), [`MyFirebaseMessagingService.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/service/MyFirebaseMessagingService.kt)
- **Rule**: FCM notification click karne par `krishivishal://job_alert/{bookingId}` deep link Intent open hota hai.
- **Error Condition**: Notification click par app home screen khol deta hai bajay Job Alert Screen ke.
- **Fix Action**: Check `<intent-filter>` scheme `krishivishal` host `job_alert` in `MainActivity`.

### `[E-702]` Service Job Acceptance & Navigation Route
- **Files**: [`NavGraph.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/navigation/NavGraph.kt), [`IncomingJobAlertScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/partner/IncomingJobAlertScreen.kt)
- **Rule**: "Accept Job" tap karne par `DashboardViewModel.acceptServiceBooking(bookingId)` execute hota hai aur partner `partner_job_execution/{bookingId}/ON_THE_WAY` screen par land karta hai.
- **Error Condition**: Accept button click karne par spinner ghumta rehta hai.
- **Fix Action**: Verify NavGraph route parameter `{bookingId}` is non-null and correctly parsed.

### `[E-703]` Service Partner Execution Steps
- **Files**: [`JobExecutionScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/partner/JobExecutionScreen.kt)
- **Rule**: Lifecycle: `ASSIGNED` -> `ON_THE_WAY` -> `REACHED_LOCATION` -> `IN_PROGRESS` (Start OTP) -> `COMPLETED` (End OTP).
- **Error Condition**: Sequence button wrong stage par locked ho gaya.
- **Fix Action**: Check `service_bookings` document `status` field in Firestore.

---

## 📐 [E-800 to E-899] Agri-Service Area Measurement & Settlement

### `[E-801]` Service Start OTP Verification
- **Files**: [`JobExecutionScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/partner/JobExecutionScreen.kt), [`ServiceBookingRepositoryImpl.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/data/repository/ServiceBookingRepositoryImpl.kt)
- **Rule**: Field par kaam shuru karne se pehle farmer ka Start OTP enter hota hai -> Status banta hai `IN_PROGRESS`.
- **Error Condition**: "Invalid Start OTP" error.
- **Fix Action**: Verify Start OTP generated in `service_bookings/{id}.startOtp`.

### `[E-802]` Actual Area Input (Acres) & End OTP Final Settlement
- **Files**: [`ServiceBookingRepositoryImpl.kt` (`verifyEndOtp`)](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/data/repository/ServiceBookingRepositoryImpl.kt), [`DashboardViewModel.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/dashboard/DashboardViewModel.kt)
- **Rule**: Kaam khatam hone par actual area (`actualArea`) enter hota hai aur End OTP verify hota hai. Cloud Function final billing calculate karta hai:
  $$\text{Final Payable} = (\text{Actual Area} \times \text{Rate Per Acre}) - \text{Advance Paid}$$
- **Error Condition**: End OTP ke baad final bill galat calculate hona.
- **Fix Action**: Ensure `actualArea` parameter is passed in Cloud Function callable request payload `{ bookingId, otp, actualArea }`.

### `[E-803]` Partner Wallet & Payout Credit
- **Files**: [`PartnerWalletScreen.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/partner/PartnerWalletScreen.kt)
- **Rule**: Job `COMPLETED` hote hi partner ke wallet me commission credit hota hai (`partner_wallets/{userId}`).
- **Error Condition**: Job complete hone ke baad wallet balance update nahi hua.
- **Fix Action**: Check Cloud Function `onServiceBookingCompleted` trigger execution logs.

---

## 🌐 [E-900 to E-999] Offline Sync, GPS Tracking & Admin Portal

### `[E-901]` Rural Offline Local Room Database Sync
- **Files**: [`RuralOfflineBanner.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/components/RuralOfflineBanner.kt), [`OrderRepository.kt` (`syncPendingOrders`)](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/data/repository/OrderRepository.kt#L112-L135)
- **Rule**: Internet na hone par status updates Room DB me queue hote hain (`isPendingSync = true`). Internet connect hote hi auto-sync ho jate hain.
- **Error Condition**: "X Orders Pending Sync" banner stuck rehna.
- **Fix Action**: Tap "Sync Cloud Data" ya check `connectivityObserver.isConnected` flow.

### `[E-902]` Background GPS Tracking Service
- **Files**: [`RiderLocationService.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/service/RiderLocationService.kt), [`LocationTrackingService.kt`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/service/LocationTrackingService.kt)
- **Rule**: Har 30 seconds me rider ki live location Firestore document `riders/{riderId}.currentLat/currentLng` par push hoti hai.
- **Error Condition**: Admin portal me rider ka location update nahi ho raha.
- **Fix Action**: Check battery optimization settings (disable battery restriction for delivery app).

### `[E-903]` Admin Portal Whitelist Management & Deletion
- **Files**: [`riderManagement.js`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal-Admin/src/services/riderManagement.js), [`Riders.jsx`](file:///c:/Users/visha/AndroidStudioProjects/KrishiVishal-Admin/src/pages/Riders.jsx)
- **Rule**: Admin naye riders/partners ko whitelist karta hai aur delete/deactivate kar sakta hai.
- **Error Condition**: Whitelist delete karne par JavaScript reference error.
- **Fix Action**: Use document ID or Phone query fallback in `deleteWhitelistedRider()`.

---

## 🛠️ Summary Note for Future Debugging
Koi bhi issue aane par user ya developer direct code quote kar sakta hai (e.g., *"E-202 fail ho raha hai"* ya *"E-401 ka QR nahi khul raha"*), aur Antigravity bina samay gavaye upar likhe code files aur rules ke hisab se 1-minute me solution execute kar dega.
