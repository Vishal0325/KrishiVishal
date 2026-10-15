# KrishiVishal Double-Entry Financial Architecture: Production Deployment Guide

Yeh document KrishiVishal ke financial system ko safely **System 1 (Legacy single-entry)** se **System 2 (Ind AS 115 compliant Double-Entry General Ledger)** par cutover karne ka step-by-step production runbook hai.

---

## Pre-Requisites & Deployment Flow Overview

```
[Step 1: Backup & Tag] ➔ [Step 2: Backend Functions] ➔ [Step 3: Frontend/Admin/App] ➔ [Step 4: Cutover Freeze & Rules]
```

---

## Step 1: Pre-Deploy Backup & Git Branch Tagging

Kisi bhi production change se pehle production Firestore data ka snapshot export karo aur rollback anchor ke liye git tag create karo.

### 1.1 Git Tag Anchor
Dono repositories mein pre-migration baseline commit tag karo:
```bash
# Backend Repo (KrishiVishal_GITCLONE)
cd c:\Users\visha\AndroidStudioProjects\KrishiVishal_GITCLONE
git tag -a v-pre-double-entry -m "Pre double-entry System 2 baseline"

# Admin Repo (KrishiVishal-Admin_GITCLONE)
cd c:\Users\visha\AndroidStudioProjects\KrishiVishal-Admin_GITCLONE
git tag -a v-pre-double-entry-admin -m "Pre double-entry Admin UI baseline"
```

### 1.2 Production Firestore Backup
Google Cloud Storage bucket mein disaster recovery export run karo:
```bash
gcloud firestore export gs://krishivishal-backups/firestore-pre-system2-$(date +%Y%m%d%H%M) \
  --project=krishivishal-a9ed7
```

---

## Step 2: Deploy Backend Functions (Additive Safe System 2)

Is step mein System 2 double-entry accounting engine, atomic wallet triggers, sales revenue recognition, cash settlement callables, aur nightly reconciliation deploy honge. 
*(Yeh deployment purely additive hai—purane clients aur background flows bina kisi disruption ke continue karte hain).*

### 2.1 Pre-Deploy Smoke Check
```bash
cd c:\Users\visha\AndroidStudioProjects\KrishiVishal_GITCLONE\KrishiVishal-Functions
npx firebase emulators:exec --only firestore "node tests/final_wiring_e2e.test.js"
```

### 2.2 Deploy Cloud Functions
```bash
cd c:\Users\visha\AndroidStudioProjects\KrishiVishal_GITCLONE
firebase deploy --only functions --project krishivishal-a9ed7
```

### 2.3 Verify Critical Exports
Google Cloud Console ya Firebase CLI logs mein verify karo ki yeh functions active hain:
- `createOrder` (Atomic wallet stock & Dr 2065/Cr 2070 entry)
- `verifyDeliveryOTP` (Revenue recognition & Dr 2070/Cr 4010 entry)
- `confirmCashSettlement` (Hub vault cash Dr 1020/Cr 1010 entry)
- `approveRiderPayout` (Rider weekly payout Dr 2015/Cr 1030 entry)
- `reconcileDailyLedgerSchedule` (Nightly 02:00 IST automated cron)
- `generateWeeklyRiderPayoutsSchedule` (Monday 09:00 IST automated payout batch)

---

## Step 3: Deploy Admin UI & Delivery App Updates

Backend callables active hone ke baad frontend interfaces ko direct Firestore client writes se hata kar System 2 backend services se bind karo.

### 3.1 KrishiVishal Admin Panel (Hosting Deploy)
```bash
cd c:\Users\visha\AndroidStudioProjects\KrishiVishal-Admin_GITCLONE

# 1. Clean dependencies & compile build
npm ci
npm run build

# 2. Deploy to Firebase Hosting
firebase deploy --only hosting --project krishivishal-a9ed7
```
**Verification Points in Admin UI:**
- **Cash Reconciliation (`/cash-recon`):** Hub manager ka cash handover button direct doc update nahi karta, seedha `confirmCashSettlement` callable invoke karta hai.
- **Rider Withdrawals (`/rider-withdrawals`):** Finance admin payout approval direct `payout_requests` update nahi karta, seedha `approveRiderPayout` callable invoke karta hai.
- **Finance Hub (`/finance`):** Journal entries, Trial Balance, aur Reconciliation Audit Tabs live General Ledger display karte hain.

### 3.2 Android Delivery App Build & Release
```bash
cd c:\Users\visha\AndroidStudioProjects\KrishiVishal_GITCLONE\KrishiVishalDelivery
./gradlew bundleRelease
```
- Play Store Internal Testing track par naya bundle upload karo.
- Passbook listener canonical `rider_transactions` collection aur single `cash_in_hand` field se sync hona verify karo.

---

## Step 4: Final Cutover Freeze (System 1 Freeze & Security Rules Lockdown)

Jab Admin Panel aur Functions live ho jayein, financial data integrity guarantee karne ke liye security rules lockdown deploy karo. Iske baad koi bhi client sidhe balance ya financial ledger mutate nahi kar payega.

### 4.1 Deploy Hardened Firestore Security Rules
```bash
cd c:\Users\visha\AndroidStudioProjects\KrishiVishal_GITCLONE
firebase deploy --only firestore:rules --project krishivishal-a9ed7
```

### 4.2 Lockdown Verification
Security rules deploy hote hi:
1. `users/{userId}.walletBalance` client write -> **PERMISSION_DENIED (Blocked)**.
2. `riders/{riderId}.cash_in_hand` client write -> **PERMISSION_DENIED (Blocked)**.
3. `journal_entries`, `wallet_transactions`, `rider_transactions`, `cash_settlements`, `payout_requests` client write -> **BLOCKED (`allow write: if false;`)**.
4. Legacy System 1 collections (`ledger`, `accounts`, `finance`) client write -> **BLOCKED (`allow write: if false;`)**.

### 4.3 Trigger First Manual Nightly Reconciliation
Cutover verify karne ke liye live reconciliation function trigger karo:
```bash
# Firebase Functions Shell ya Cloud Console se run karo:
firebase functions:shell --project krishivishal-a9ed7
> reconcileDailyLedger()
```
**Expected Output:**
- `reconciliation_logs` collection mein document create hoga with:
  * `balanced: true`
  * `checks.wallet.diff: 0` (Total user wallet liability matches Account 2065)
  * `checks.riderCash.diff: 0` (Total rider cash in hand matches Account 1010)
  * `checks.generalLedger.diff: 0` (Total Debits === Total Credits)

---

## Rollback Procedure (Emergency Only)

Agar production mein koi unexpected critical anomaly aati hai:
1. **Security Rules Revert:**
   ```bash
   git checkout v-pre-double-entry -- firestore.rules
   firebase deploy --only firestore:rules --project krishivishal-a9ed7
   ```
2. **Restore Previous Admin Build:**
   Firebase Console > Hosting > Release History se pre-deployment release ko 1-click Rollback karo.
3. **Emergency Point-in-Time Restore:**
   GCS export backup se collections restore karo via `gcloud firestore import gs://krishivishal-backups/...`.
