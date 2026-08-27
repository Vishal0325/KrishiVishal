/**
 * Expense Management Constants
 */

export const APPROVAL_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

export const PAYMENT_STATUS = {
  UNPAID: 'UNPAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  REFUNDED: 'REFUNDED'
};

export const PAYMENT_METHODS = [
  'CASH',
  'UPI',
  'BANK_TRANSFER',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'CHEQUE',
  'WALLET',
  'OTHER'
];

export const DOCUMENT_TYPES = [
  'INVOICE',
  'RECEIPT',
  'PAYMENT_PROOF',
  'OTHER'
];

export const STATUS_COLORS = {
  // Approval
  [APPROVAL_STATUS.DRAFT]: 'bg-gray-100 text-gray-700',
  [APPROVAL_STATUS.PENDING]: 'bg-yellow-100 text-yellow-700',
  [APPROVAL_STATUS.APPROVED]: 'bg-green-100 text-green-700',
  [APPROVAL_STATUS.REJECTED]: 'bg-red-100 text-red-700',

  // Payment
  [PAYMENT_STATUS.UNPAID]: 'bg-red-50 text-red-600',
  [PAYMENT_STATUS.PARTIALLY_PAID]: 'bg-blue-50 text-blue-600',
  [PAYMENT_STATUS.PAID]: 'bg-green-50 text-green-600',
  [PAYMENT_STATUS.REFUNDED]: 'bg-purple-50 text-purple-600'
};
