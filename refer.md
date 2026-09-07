# Prompt: Implement Refer & Earn System — KrishiVishal

Copy this entire prompt into your AI coding agent (Cursor / Copilot / Gemini). Feed it your actual repo context first (open the relevant files) before running this.

---

## Project Context

KrishiVishal is an AgriTech e-commerce platform for farmers in Bihar, India. Stack:

- **Customer app**: Kotlin + Jetpack Compose (MVVM, Hilt, Room)
- **Backend**: Firebase (Firestore, Auth, Cloud Functions in TypeScript)
- **Admin dashboard**: React + Vite
- **Payment model**: COD-only launch (no Razorpay live yet — reward redemption must work against COD orders, not online refunds)

## Objective

Implement a double-sided "Refer & Earn" referral system:

- Referrer earns wallet credit when their referred friend's **first order is delivered**.
- Referee gets a discount coupon applied automatically at signup via referral code.
- Reward must NOT be granted at signup or at order placement — only at confirmed delivery — to prevent fraud loss on COD.

---

## 1. Firestore Data Model

Add these fields/collections. Do not break existing schema — extend `users` and `orders`, add two new collections.

```
users/{uid}
  + referralCode: string        // e.g. "KV-VISHAL234", generated at signup (name-based + 3-4 random digits)
  + referredBy: string | null   // referral code entered by this user at signup, null if none
  + walletBalance: number       // default 0
  + hasCompletedFirstOrder: boolean  // default false, flips true after first delivered order

referrals/{referralId}
  - referrerUid: string
  - refereeUid: string
  - referralCode: string
  - status: "PENDING" | "SIGNED_UP" | "REWARDED" | "VOIDED" | "FRAUD_FLAGGED"
  - referrerRewardAmount: number   // e.g. 75
  - refereeRewardAmount: number    // e.g. 50 (applied as coupon, not wallet)
  - referenceOrderId: string | null
  - createdAt: timestamp
  - rewardedAt: timestamp | null
  - voidReason: string | null

wallet_transactions/{txnId}
  - uid: string
  - type: "REFERRAL_CREDIT" | "REFERRAL_REVERSAL" | "REDEEMED_AT_CHECKOUT"
  - amount: number
  - referenceOrderId: string | null
  - referenceReferralId: string | null
  - createdAt: timestamp
```

---

## 2. Cloud Functions (TypeScript) — write these in the existing `functions/` directory

### `generateReferralCode` (Auth trigger, on user creation)

- Generate unique code: first name (uppercase, max 6 chars) + 3-digit random number, prefixed `KV-`.
- Check collision in `users` collection before assigning; retry with new random suffix if taken.
- Write to `users/{uid}.referralCode`.

### `applyReferralCode` (Callable function, called from signup screen)

- Input: `{ newUserUid, referralCodeEntered }`
- Validate: code exists, belongs to a different user (block self-referral), and `newUserUid` doesn't already have a `referredBy` set (one-time use per user).
- Block if referrer's phone number, device ID, or delivery address matches the referee's (fraud signal — pull these fields from your existing `users` and `devices` collections if tracked).
- On success: set `users/{newUserUid}.referredBy = referralCodeEntered`, create a `referrals` doc with `status: "SIGNED_UP"`, and issue the referee a ₹50 discount coupon (integrate with your existing coupon/discount system — do not hardcode a new one if a coupon engine already exists).

### `onReferralOrderDelivered` — hook into your EXISTING `onOrderDelivered` function, do not create a duplicate trigger

- After existing delivery logic runs, check: `users/{refereeUid}.hasCompletedFirstOrder == false` AND a `referrals` doc exists for this uid with `status: "SIGNED_UP"`.
- If both true:
  - Set `hasCompletedFirstOrder = true` on the referee.
  - Update the `referrals` doc: `status: "REWARDED"`, `rewardedAt: now`, `referenceOrderId`.
  - Credit `referrerRewardAmount` to `users/{referrerUid}.walletBalance` (atomic increment via Firestore transaction, not read-then-write).
  - Write a `wallet_transactions` doc of type `REFERRAL_CREDIT`.
  - Trigger a push notification / SMS to the referrer (reuse existing notification service): "Aapko ₹[amount] mil gaye! Aapke doston ne KrishiVishal join kiya."

### `onReferralOrderCancelled` — hook into existing order-cancellation function

- If the cancelled order's `orderId` matches a `referrals.referenceOrderId` with `status: "REWARDED"`:
  - Reverse the wallet credit via transaction (decrement `walletBalance`, floor at 0).
  - Write a `wallet_transactions` doc of type `REFERRAL_REVERSAL`.
  - Set `referrals.status = "VOIDED"`, `voidReason: "order_cancelled_after_reward"`.

### `redeemWalletAtCheckout` (Callable function)

- Input: `{ uid, orderId, amountToRedeem }`
- Validate `amountToRedeem <= users/{uid}.walletBalance`.
- For COD orders: deduct `amountToRedeem` from the COD collection amount recorded on the order, and decrement wallet balance atomically.
- Write a `wallet_transactions` doc of type `REDEEMED_AT_CHECKOUT`.
- Reject if order is already delivered/cancelled.

---

## 3. Firestore Security Rules

Add rules for the two new collections:

- `referrals/{referralId}`: readable by the referrer or referee only (`request.auth.uid in [resource.data.referrerUid, resource.data.refereeUid]`); writable only by Cloud Functions (no direct client writes — enforce via `allow write: if false;` and do all writes server-side).
- `wallet_transactions/{txnId}`: readable only by the owning `uid`; writable only by Cloud Functions.
- Update `users/{uid}` rules so `walletBalance`, `referralCode`, `hasCompletedFirstOrder`, and `referredBy` are NOT client-writable (add to your existing deny-list for protected fields).

---

## 4. Customer App (Kotlin/Compose)

Add a **"Refer & Earn"** screen:

- Display the user's `referralCode` in large copyable text.
- "Share via WhatsApp" button using `Intent.ACTION_SEND` with a pre-filled Hindi message containing a deep link with the referral code as a query param.
- List of referrals with status (Pending / Rewarded) pulled from `referrals` collection where `referrerUid == currentUser`.
- Show total wallet balance and a link to a **Wallet screen** with transaction history from `wallet_transactions`.

Update the **Checkout screen**:

- If `walletBalance > 0`, show a checkbox "Wallet balance use karein? (₹X available)". On check, call `redeemWalletAtCheckout` and reduce the displayed COD amount due.

Update the **Signup screen**:

- Add an optional "Referral Code" input field. On submit, call `applyReferralCode` before finalizing signup.

---

## 5. Admin Dashboard (React)

Add a new page/section:

- Table of all `referrals` docs with filters by status.
- A config panel to adjust `referrerRewardAmount` and `refereeRewardAmount` defaults (store in a `config/referralSettings` Firestore doc — do not hardcode amounts in Cloud Functions; read from this doc at runtime).
- A "Fraud Flagged" tab showing referrals with `status: "FRAUD_FLAGGED"` for manual review.
- Simple stat cards: total referrals, total rewarded, total wallet liability outstanding (sum of all `walletBalance` across users — useful for finance).

---

## 6. Verification Checklist (do not skip — confirm each with actual evidence, not just a "done" claim)

- [ ] Show me the Firestore transaction code proving wallet credit/debit is atomic (not read-then-write, which risks race conditions on concurrent orders).
- [ ] Confirm self-referral is blocked — show the exact check comparing referrer/referee identity.
- [ ] Confirm reward triggers only on delivery, not on order placement — point to the exact line in `onOrderDelivered` where this hooks in.
- [ ] Confirm `referrals` and `wallet_transactions` collections reject direct client writes in `firestore.rules` — show the deployed rule, not just the file.
- [ ] Run one full manual test end-to-end (new signup with code → place COD order → mark delivered → confirm wallet credited) and paste the actual before/after Firestore document snapshots, not a summary claim.
