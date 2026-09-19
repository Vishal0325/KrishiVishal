# Project Rules

## Architecture (non-negotiable)
- Server-authoritative: clients NEVER write orders, stock, wallet, ledger or job status directly. All mutations go through Cloud Functions (v2).
- Every ledger/inventory/payout function must be idempotent (idempotency_keys collection).
- Validate all function payloads with Zod. Deny client writes to critical fields in firestore.rules.
- Roles via custom claims: customer, rider, serviceman, warehouse_manager, finance, admin, super_admin.
  Warehouse managers can only access their own warehouse's data.

## Domain rules
- Multi-warehouse: stock lives per warehouse per SKU. Orders route to a warehouse that has stock. Inter-warehouse transfers have states (REQUESTED -> IN_TRANSIT -> RECEIVED).
- Finance: double-entry ledger only. No manual balance edits. Rider COD -> cash deposit -> cashier verification -> ledger entry. Serviceman payouts and commissions are ledger entries too.
- Service business: service_jobs flow BOOKED -> ASSIGNED -> EN_ROUTE -> IN_PROGRESS -> COMPLETED/CANCELLED. Start/end need OTP. Photos are stored in Storage.
- GST invoices are generated server-side.

## Android (customer + delivery)
- Kotlin, Jetpack Compose (Material 3), MVVM + Clean Architecture, Hilt, Coroutines/Flow, Room for offline cache.
- Packages: ui / data / domain / di. No business logic in composables.
- Delivery app must work offline (queue events, exponential-backoff sync).
- UI text in Hindi + English via string resources. No hardcoded strings.

## Admin panel
- React + Vite + Tailwind, React Router, httpsCallable for all backend calls, role-based rendering.

## Definition of done
- Never say "complete" without running build/tests and showing the real output.
- If something is not verified, say "not verified". Never invent files or endpoints.
- Do not touch files outside your assigned module.
