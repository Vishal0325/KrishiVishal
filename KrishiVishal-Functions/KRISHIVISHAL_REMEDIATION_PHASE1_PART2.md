# KrishiVishal GST Remediation — Phase 1 Part 2

## Root Cause Analysis
The idempotency check in `generateCreditNoteForReturn` (`invoices/creditNoteEngine.js`) queried `credit_notes` using an asynchronous `.where(...)` query without atomic locks. Because this read occurred outside of any Firestore transaction, tight concurrent invocations for the same `idempotencyKey` would simultaneously read `empty === true`, proceed independently to generate separate Credit Note sequence numbers, create separate reversal journal entries, and create multiple overlapping `credit_notes` records. This violated idempotency rules and generated duplicate financial journal postings.

## Design Logic (The Fix)
Firestore does not natively support nested transactions (e.g. `db.runTransaction` inside `db.runTransaction`), preventing a single transaction wrapper since `getNextCreditNoteNumber` and `postJournalEntry` utilize their own internal transactions.

To achieve strict atomicity:
1. **Pessimistic Atomic Locks**: Created an intermediary lock mechanism using a transaction on a dedicated `credit_note_locks/{effectiveKey}` document.
2. **Deterministic Pre-Execution Validation**: By writing an initial `status: "ALLOCATING"` document, concurrent requests are blocked (returning `CONCURRENT_ALLOCATION_IN_PROGRESS`) because a mutex is enforced via Firestore transaction `get` and `set`.
3. **Graceful Error Recovery**: A `try/finally` block handles cleanup, releasing the lock if sequence generation or journal posting fails mid-flight, keeping the system retryable. 
4. **Legacy Fallback**: To preserve records generated before this remediation, the logic safely falls back to querying `credit_notes` by `idempotencyKey` if the lock exists but isn't actively allocating.

## Exact Files Changed
1. `invoices/creditNoteEngine.js`
   - Refactored `generateCreditNoteForReturn` to acquire an atomic mutex lock in a dedicated `credit_note_locks` collection prior to executing sequence generation or journaling.
   - Preserved all original sequence structures, rule compliance, and idempotency key logic.
2. `tests/phase1_remediation.test.js`
   - Added concurrency test cases utilizing `Promise.all` against simulated duplicate credit note calls, asserting that exactly one succeeds and exactly one journal entry is generated.
   - Mock test suite patched to support `.delete()` for lock cleanup tests.
3. `tests/sprint2_gst_credit_notes.test.js`
   - Mock test suite patched to support `.update()` and `.delete()` for seamless testing of the new locking mechanism.

## Test Results
- **Phase 1 Remediation Suite**: Passed (7/7 tests) including the newly written deterministic concurrency test.
- **Sprint 2 GST Suite**: Passed (7/7 tests).
- **Full Application Suite (`npm test`)**: All 36+ test suites passed without failure.

## Conclusion
A (FIX IMPLEMENTED)
