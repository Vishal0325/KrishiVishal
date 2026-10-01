# KrishiVishal-Admin Audit Scenarios Status Report

## 1. AI Control Room - Approve Action UI Write
- **File:** `src/pages/AIControlRoom.jsx` & `firestore.rules`
- **Status:** `RESOLVED (PASS)`
- **Fix:** Upgraded `handleApproval` to invoke the `approveAiAction` / `rejectAiAction` Cloud Functions (with atomic audit log recording) and robust fallback. Updated `firestore.rules` on `/ai_action_requests/{id}` to permit updating `reviewedBy`, `reviewedAt`, `notes`, `reason`, `approvedBy`, `rejectedBy`.

## 2. Orders & Warehouse Allocation - Routing Fallback
- **File:** `src/pages/Orders.jsx` & `warehouseAllocator.js`
- **Status:** `RESOLVED (PASS)`
- **Fix:** Fixed warehouse allocator to strictly drop unmatched pincodes into `UNASSIGNED` and `NEEDS_MANUAL_ROUTING`. Added dedicated `⚠️ Needs Routing` tab and re-assignment drawer to `Orders.jsx`.

## 3. Goods Receipt - Client Write to `stock_movements` / `products`
- **File:** `src/pages/GoodsReceipt.jsx`
- **Status:** `RESOLVED (PASS)`
- **Fix:** Removed all client-side direct mutations on `products.stock` and `stock_movements`. Enforced single source of truth via backend `receiveGrn` callable function with error notification and retry mechanism.

## 4. Returns, RTO & Expiry - Expiry Batch Write-Off
- **File:** `src/pages/ExpiryMonitor.jsx`
- **Status:** `RESOLVED (PASS)`
- **Fix:** Replaced direct `stock: 0` writes with backend `callWriteOffStock` callable function.

## 5. Returns - Restock Action
- **File:** `src/pages/Returns.jsx` & `functions/inventory/inventoryEngine.js`
- **Status:** `RESOLVED (PASS)`
- **Fix:** Implemented `restockReturnedItem` Cloud Function and wired return QC pass / hub handover buttons to invoke it instead of direct Firestore writes.

## 6. Security Rules Coverage Audit
- **File:** `firestore.rules`
- **Status:** `RESOLVED (PASS)`
- **Fix:** Added 13 previously missing collections (`agri_statutory_form_o`, `agri_statutory_form_a`, `agri_officer_inspections`, `farmer_crop_profiles`, `b2b_sales_deals`, `kisan_call_logs`, `expensePayments`, `expenseAuditLogs`, `counters`, `physical_stock_audits`, `rtv_returns`, `document_settings`, `company_holidays`) preventing random `Missing or insufficient permissions` errors across the ERP. Unlocked admin updates to product catalog prices and direct SKU sync. All rules deployed successfully.
