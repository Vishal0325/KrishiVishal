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

// ============================================================
// CASH DEPOSIT ORDER VALIDATION TESTS (P0 Pass 8)
// ============================================================
const { validateCashDepositOrders } = require('../finance/ledger');

// Helper to construct mock Firestore doc
function mockOrderDoc(id, data) {
    return {
        id,
        exists: true,
        data: () => data
    };
}

const baseDeposit = {
    depositId: 'dep_101',
    riderId: 'rider_suresh',
    amount: 1500,
    orderIds: ['ord_1', 'ord_2']
};

const validOrders = [
    mockOrderDoc('ord_1', { riderId: 'rider_suresh', paymentMode: 'COD', status: 'DELIVERED', isCashDeposited: false, totalAmount: 700 }),
    mockOrderDoc('ord_2', { riderId: 'rider_suresh', paymentMode: 'COD', status: 'DELIVERED', isCashDeposited: false, totalAmount: 800 })
];

// TEST 4: Valid Cash Deposit Orders
const t4 = validateCashDepositOrders(baseDeposit, validOrders);
console.log(`TEST 4 (Valid Cash Deposit Orders): ${t4.isValid ? 'PASS' : 'FAIL'}`);

// TEST 5: Mismatched Rider in Orders
const mismatchedRiderOrders = [
    mockOrderDoc('ord_1', { riderId: 'rider_suresh', paymentMode: 'COD', status: 'DELIVERED', isCashDeposited: false, totalAmount: 700 }),
    mockOrderDoc('ord_2', { riderId: 'rider_other', paymentMode: 'COD', status: 'DELIVERED', isCashDeposited: false, totalAmount: 800 })
];
const t5 = validateCashDepositOrders(baseDeposit, mismatchedRiderOrders);
console.log(`TEST 5 (Mismatched Rider Rejected): ${!t5.isValid && t5.reason.includes('rider') ? 'PASS' : 'FAIL'}`);

// TEST 6: Non-COD Payment Method Rejected
const nonCodOrders = [
    mockOrderDoc('ord_1', { riderId: 'rider_suresh', paymentMode: 'ONLINE', status: 'DELIVERED', isCashDeposited: false, totalAmount: 700 }),
    mockOrderDoc('ord_2', { riderId: 'rider_suresh', paymentMode: 'COD', status: 'DELIVERED', isCashDeposited: false, totalAmount: 800 })
];
const t6 = validateCashDepositOrders(baseDeposit, nonCodOrders);
console.log(`TEST 6 (Non-COD Payment Rejected): ${!t6.isValid && t6.reason.includes('COD') ? 'PASS' : 'FAIL'}`);

// TEST 7: Non-DELIVERED Order Rejected
const nonDeliveredOrders = [
    mockOrderDoc('ord_1', { riderId: 'rider_suresh', paymentMode: 'COD', status: 'OUT_FOR_DELIVERY', isCashDeposited: false, totalAmount: 700 }),
    mockOrderDoc('ord_2', { riderId: 'rider_suresh', paymentMode: 'COD', status: 'DELIVERED', isCashDeposited: false, totalAmount: 800 })
];
const t7 = validateCashDepositOrders(baseDeposit, nonDeliveredOrders);
console.log(`TEST 7 (Non-DELIVERED Order Rejected): ${!t7.isValid && t7.reason.includes('DELIVERED') ? 'PASS' : 'FAIL'}`);

// TEST 8: Already Deposited Order Rejected
const alreadyDepositedOrders = [
    mockOrderDoc('ord_1', { riderId: 'rider_suresh', paymentMode: 'COD', status: 'DELIVERED', isCashDeposited: true, totalAmount: 700 }),
    mockOrderDoc('ord_2', { riderId: 'rider_suresh', paymentMode: 'COD', status: 'DELIVERED', isCashDeposited: false, totalAmount: 800 })
];
const t8 = validateCashDepositOrders(baseDeposit, alreadyDepositedOrders);
console.log(`TEST 8 (Already Deposited Order Rejected): ${!t8.isValid && t8.reason.includes('already been deposited') ? 'PASS' : 'FAIL'}`);

// TEST 9: Sum Totals Mismatch Rejected
const mismatchAmountOrders = [
    mockOrderDoc('ord_1', { riderId: 'rider_suresh', paymentMode: 'COD', status: 'DELIVERED', isCashDeposited: false, totalAmount: 700 }),
    mockOrderDoc('ord_2', { riderId: 'rider_suresh', paymentMode: 'COD', status: 'DELIVERED', isCashDeposited: false, totalAmount: 500 }) // Total 1200 != 1500
];
const t9 = validateCashDepositOrders(baseDeposit, mismatchAmountOrders);
console.log(`TEST 9 (Sum Totals Mismatch Rejected): ${!t9.isValid && t9.reason.includes('does not match deposit amount') ? 'PASS' : 'FAIL'}`);

