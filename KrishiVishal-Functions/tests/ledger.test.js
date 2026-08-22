/**
 * Enterprise V4 Accounting Test: Ledger Integrity
 * Verifies that every transaction remains balanced: Debit == Credit.
 */

function verifyBalance(entries) {
    let totalDebit = 0;
    let totalCredit = 0;

    entries.forEach(entry => {
        if (entry.type === 'DEBIT') totalDebit += Number(entry.amount);
        else if (entry.type === 'CREDIT') totalCredit += Number(entry.amount);
    });

    return {
        isBalanced: totalDebit.toFixed(2) === totalCredit.toFixed(2),
        totalDebit,
        totalCredit
    };
}

// TEST CASE 1: PAID Order (Bifurcated)
const orderEntries = [
    { account: 'SALES', type: 'CREDIT', amount: 1000 },
    { account: 'GST_PAYABLE', type: 'CREDIT', amount: 180 },
    { account: 'CASH_IN_HAND', type: 'DEBIT', amount: 1180 }
];

const orderResult = verifyBalance(orderEntries);
console.log(`TEST 1 (PAID Order): ${orderResult.isBalanced ? 'PASS' : 'FAIL'} (D: ${orderResult.totalDebit}, C: ${orderResult.totalCredit})`);

// TEST CASE 2: RETURN (Bifurcated Reversal)
const returnEntries = [
    { account: 'SALES', type: 'DEBIT', amount: 500 },
    { account: 'GST_PAYABLE', type: 'DEBIT', amount: 90 },
    { account: 'CASH_IN_HAND', type: 'CREDIT', amount: 590 },
    { account: 'COGS', type: 'CREDIT', amount: 350 },
    { account: 'INVENTORY', type: 'DEBIT', amount: 350 }
];

const returnResult = verifyBalance(returnEntries);
console.log(`TEST 2 (Return Reversal): ${returnResult.isBalanced ? 'PASS' : 'FAIL'} (D: ${returnResult.totalDebit}, C: ${returnResult.totalCredit})`);

// TEST CASE 3: BANK SETTLEMENT
const settleEntries = [
    { account: 'BANK_ACCOUNT', type: 'DEBIT', amount: 970 },
    { account: 'GATEWAY_FEES', type: 'DEBIT', amount: 30 },
    { account: 'RAZORPAY_PENDING', type: 'CREDIT', amount: 1000 }
];

const settleResult = verifyBalance(settleEntries);
console.log(`TEST 3 (Bank Settlement): ${settleResult.isBalanced ? 'PASS' : 'FAIL'} (D: ${settleResult.totalDebit}, C: ${settleResult.totalCredit})`);
