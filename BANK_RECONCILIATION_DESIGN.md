# 🏦 Bank Payout Reconciliation Design (Option A)

**Project:** KrishiVishal V4
**Status:** DESIGN READY
**Author:** Principal Finance Architect

## 1. Objective
Achieve 100% financial accuracy by matching order payments with actual bank settlements. This ensures that every rupee collected via Razorpay is accounted for after deducting gateway fees and GST.

## 2. New Account Mapping
We are introducing three new accounts to the ledger:

| Account Code | Type | Description |
| :--- | :--- | :--- |
| `RAZORPAY_PENDING` | Asset (Receivable) | Funds held by Razorpay before payout. |
| `BANK_ACCOUNT` | Asset (Bank) | Funds actually received in the business bank account. |
| `GATEWAY_FEES` | Expense | Fees charged by Razorpay (Commission + GST on Commission). |

## 3. Financial Lifecycle

### Step 1: Order Paid (Online)
When `verifyPayment` succeeds, the ledger will now post:
- **Debit:** `RAZORPAY_PENDING` (Asset Increase)
- **Credit:** `SALES` (Net Revenue)
- **Credit:** `GST_PAYABLE` (Tax Liability)

### Step 2: Bank Payout (Settlement)
When a payout is received (Manual or Webhook):
- **Debit:** `BANK_ACCOUNT` (Actual Cash Received)
- **Debit:** `GATEWAY_FEES` (The cut taken by Razorpay)
- **Credit:** `RAZORPAY_PENDING` (Asset Cleared)

## 4. Implementation Plan

### Phase 1: Ledger Hardening
- Update `onOrderPaidLedger` to use `RAZORPAY_PENDING` for online payments instead of `CASH_IN_HAND`.

### Phase 2: Settlement UI
- Create a "Payout Reconciliation" page in the Admin Dashboard.
- Allow Admin to enter Payout ID, Amount Received, and Fees.

### Phase 3: Automated Payout (Future)
- Connect to Razorpay Settlement Webhook (`settlement.processed`) to automate this movement.

## 5. Security
- Payout creation is strictly restricted to **SuperAdmin** only.
- Payout entries are immutable.
