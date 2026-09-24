/**
 * Shared Revenue & GMV Metrics Engine
 * Single Source of Truth used identically by Dashboard.jsx and dashboardMetricsWorker.js
 */

export const DELIVERED_STATUSES = ['DELIVERED'];

export const ACTIVE_BOOKED_STATUSES = [
  'PLACED', 'CONFIRMED', 'PAYMENT_CONFIRMED', 'PROCUREMENT_PENDING',
  'READY_FOR_PACKING', 'PACKING', 'PACKED', 'READY_FOR_PICKUP',
  'ASSIGNED', 'RIDER_ASSIGNED', 'RIDER_ACCEPTED', 'PICKED_UP',
  'PICKING_UP', 'IN_TRANSIT', 'SHIPPED', 'OUT_FOR_DELIVERY',
  'REATTEMPT_SCHEDULED'
];

export const FAILED_CANCELLED_STATUSES = [
  'CANCELLED', 'DELIVERY_FAILED', 'RTO_INITIATED', 'RTO_DAMAGED',
  'REJECTED', 'VOIDED', 'PAYMENT_FAILED', 'RAZORPAY_INIT_FAILED'
];

export const RETURNED_STATUSES = ['RETURNED'];

const loggedUnknownStatuses = new Set();
const loggedMissingGstProductIds = new Set();
const loggedInvalidDateValues = new Set();

/**
 * Robust date converter handling Firestore Timestamps, worker serialized objects, ISO strings, and numbers
 * @param {*} value 
 * @returns {Date|null}
 */
export function toDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value.toDate === 'function') {
    try {
      const d = value.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  // Worker-cloned or JSON-serialized Timestamp: { seconds, nanoseconds } or { _seconds, _nanoseconds }
  if (typeof value === 'object') {
    const sec = value.seconds ?? value._seconds;
    const nsec = value.nanoseconds ?? value._nanoseconds ?? 0;
    if (typeof sec === 'number') {
      const d = new Date(sec * 1000 + Math.floor(nsec / 1000000));
      return isNaN(d.getTime()) ? null : d;
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }

  const strKey = String(value);
  if (!loggedInvalidDateValues.has(strKey)) {
    loggedInvalidDateValues.add(strKey);
    console.warn(`[revenueMetrics] Invalid date value encountered:`, value);
  }
  return null;
}

/**
 * Checks if a given date value falls inside [start, end]
 */
export function isDateInRange(dateValue, start, end) {
  if (!start && !end) return true;
  const d = toDateSafe(dateValue);
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

/**
 * Calculates standardized Revenue & GMV Metrics from orders
 * @param {Array} orders List of order documents
 * @param {Object} options Optional { start: Date, end: Date }
 */
export function calculateOrderMetrics(orders = [], { start = null, end = null } = {}) {
  let netRevenue = 0;
  let grossBookedGMV = 0;
  let cancelledFailedGMV = 0;
  let unknownStatusCount = 0;
  let unknownStatusGMV = 0;
  let missingGstCount = 0;

  orders.forEach(order => {
    const rawStatus = order.status || '';
    const status = rawStatus.toUpperCase();
    const totalAmount = Number(order.totalAmount || 0);
    const createdAt = order.createdAt;
    const deliveredDate = order.deliveredAt || order.updatedAt || order.createdAt;

    // 1. Cancelled & Failed Orders (Filtered by createdAt)
    if (FAILED_CANCELLED_STATUSES.includes(status)) {
      if (isDateInRange(createdAt, start, end)) {
        cancelledFailedGMV += totalAmount;
      }
      return;
    }

    // 2. Delivered / Returned Orders
    if (DELIVERED_STATUSES.includes(status) || RETURNED_STATUSES.includes(status)) {
      // GMV is recognized on creation date
      if (isDateInRange(createdAt, start, end)) {
        grossBookedGMV += totalAmount;
      }

      // Net Revenue is recognized on delivery date
      if (isDateInRange(deliveredDate, start, end)) {
        let goodsInclusiveTotal = 0;
        let orderTaxableGoods = 0;

        if (Array.isArray(order.items) && order.items.length > 0) {
          order.items.forEach(item => {
            const qty = Number(item.quantity || 1);
            const price = Number(item.price || 0);
            const lineTotal = price * qty;
            
            if (item.gstRate === undefined || item.gstRate === null || item.gstRate === '') {
              missingGstCount++;
              const prodKey = item.productId || item.productName || 'unknown-product';
              if (!loggedMissingGstProductIds.has(prodKey)) {
                loggedMissingGstProductIds.add(prodKey);
                console.warn(`[revenueMetrics] Missing gstRate on product: "${prodKey}" in order ${order.id}`);
              }
            }

            const gstRate = Number(item.gstRate || 0);
            const taxable = lineTotal / (1 + (gstRate / 100));
            goodsInclusiveTotal += lineTotal;
            orderTaxableGoods += taxable;
          });
        } else {
          const delCharge = Number(order.deliveryCharge || order.deliveryCharges || 0);
          const tax = Number(order.totalTax || 0);
          goodsInclusiveTotal = Math.max(0, totalAmount - delCharge);
          orderTaxableGoods = Math.max(0, totalAmount - tax - delCharge);
        }

        // Exact GST-exclusive refund calculation capped at goodsInclusiveTotal
        let taxableRefund = 0;
        if (order.refundStatus === 'REFUNDED' && Number(order.refundAmount) > 0 && goodsInclusiveTotal > 0) {
          const refundAmt = Number(order.refundAmount);
          const cappedRefund = Math.min(refundAmt, goodsInclusiveTotal);
          taxableRefund = cappedRefund * (orderTaxableGoods / goodsInclusiveTotal);
        }

        netRevenue += Math.max(0, orderTaxableGoods - taxableRefund);
      }
      return;
    }

    // 3. Active Booked Pipeline Orders (Filtered by createdAt)
    if (ACTIVE_BOOKED_STATUSES.includes(status)) {
      if (isDateInRange(createdAt, start, end)) {
        grossBookedGMV += totalAmount;
      }
      return;
    }

    // 4. Unknown Status Bucket
    unknownStatusCount++;
    unknownStatusGMV += totalAmount;
    if (!loggedUnknownStatuses.has(rawStatus)) {
      loggedUnknownStatuses.add(rawStatus);
      console.warn(`[revenueMetrics] Unrecognized order status: "${rawStatus}" on order ID: ${order.id}`);
    }
  });

  return {
    netRevenue: Math.round(netRevenue * 100) / 100,
    grossBookedGMV: Math.round(grossBookedGMV * 100) / 100,
    cancelledFailedGMV: Math.round(cancelledFailedGMV * 100) / 100,
    unknownStatusCount,
    unknownStatusGMV: Math.round(unknownStatusGMV * 100) / 100,
    missingGstCount
  };
}
