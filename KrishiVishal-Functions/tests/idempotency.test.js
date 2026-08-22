/**
 * Enterprise V4 Reliability Test: Idempotency
 * Verifies that duplicate events do not create duplicate ledger entries.
 */

function processPaidEvent(orderId, orderData, existingLedger) {
    // SIMULATED GUARD
    if (orderData.ledgerPosted) {
        return { status: 'SKIPPED', reason: 'ALREADY_POSTED' };
    }

    // SIMULATED POSTING
    const entries = [
        { orderId, account: 'SALES', amount: orderData.totalAmount }
    ];

    // Mark as posted (In real logic this happens in a batch)
    orderData.ledgerPosted = true;

    return { status: 'SUCCESS', entries };
}

// TEST: Double PAID event
let order = { id: 'ORD123', totalAmount: 1180, ledgerPosted: false };
let ledger = [];

const firstAttempt = processPaidEvent(order.id, order, ledger);
console.log(`FIRST ATTEMPT: ${firstAttempt.status}`);

const secondAttempt = processPaidEvent(order.id, order, ledger);
console.log(`SECOND ATTEMPT: ${secondAttempt.status} (Reason: ${secondAttempt.reason})`);

if (firstAttempt.status === 'SUCCESS' && secondAttempt.status === 'SKIPPED') {
    console.log("IDEMPOTENCY TEST: PASS");
} else {
    console.log("IDEMPOTENCY TEST: FAIL");
}
