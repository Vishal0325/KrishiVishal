/**
 * KRISHIVISHAL - Production Firestore Schema v2.0
 * Financial Audit Enabled
 * Optimized for Return, Refund, and Cancellation Flows
 */

export const FirestoreSchema_v2 = {
  version: "2.0",
  description: "Production Firestore Schema Specification for KrishiVishal",

  // ORDERS COLLECTION SCHEMA
  orders: {
    path: "orders/{orderId}",
    fields: {
      id: "string (auto-generated)",
      userId: "string (Firebase UID of customer)",
      status: "PLACED | CONFIRMED | PACKED | SHIPPED | OUT_FOR_DELIVERY | DELIVERED | CANCELLED",
      items: [
        {
          productId: "string",
          productName: "string",
          quantity: "number",
          price: "number",
          cropAssociatedIds: ["string"],
          imageUrl: "string",
          discount: "number"
        }
      ],
      totalAmount: "number",
      subtotal: "number",
      discountAmount: "number",
      deliveryCharge: "number",
      paymentDetails: {
        gateway: "RAZORPAY | STRIPE | COD | UPI",
        transactionId: "string",
        paymentMethod: "CARD | UPI | WALLET | NET_BANKING | CASH_ON_DELIVERY",
        paymentStatus: "SUCCESS | PENDING | FAILED",
        paymentTimestamp: "timestamp"
      },
      address: {
        name: "string",
        phone: "string",
        email: "string",
        street: "string",
        village: "string",
        district: "string",
        state: "string",
        pincode: "string"
      },
      createdAt: "timestamp",
      updatedAt: "timestamp",
      deliveredAt: "timestamp",
      cancelled: "boolean",
      cancellationReason: "string",
      cancellationTimestamp: "timestamp",
      returnPending: "boolean",
      returnId: "string",
      returnApproved: "boolean",
      returnRejected: "boolean"
    }
  },

  // RETURNS COLLECTION SCHEMA
  returns: {
    path: "returns/{returnId}",
    fields: {
      id: "string",
      orderId: "string",
      userId: "string",
      productName: "string",
      reason: "string",
      proofUrls: ["string"],
      status: "PENDING | APPROVED | REJECTED | PICKED_UP | COMPLETED | AUTO_APPROVED | REFUND_FAILED",
      adminNotes: "string",
      financials: {
        totalAmount: "number",
        refundAmountInitiated: "number",
        gatewayRefundId: "string",
        processedAt: "timestamp",
        paymentDetails: {
          transactionId: "string",
          gateway: "RAZORPAY | STRIPE | COD | UPI",
          paymentMethod: "CARD | UPI | WALLET"
        },
        refundAttempts: "number",
        lastRefundAttempt: "timestamp",
        failureReason: "string"
      },
      createdAt: "timestamp",
      updatedAt: "timestamp",
      isAutoApproved: "boolean",
      pickupScheduled: "timestamp",
      pickupCompletedAt: "timestamp"
    }
  },

  // REQUIRED COMPOSITE INDEXES
  requiredIndexes: [
    {
      collection: "orders",
      fields: [
        { fieldPath: "userId", order: "ASCENDING" },
        { fieldPath: "status", order: "ASCENDING" },
        { fieldPath: "createdAt", order: "DESCENDING" }
      ]
    },
    {
      collection: "returns",
      fields: [
        { fieldPath: "userId", order: "ASCENDING" },
        { fieldPath: "status", order: "ASCENDING" },
        { fieldPath: "createdAt", order: "DESCENDING" }
      ]
    },
    {
      collection: "returns",
      fields: [
        { fieldPath: "status", order: "ASCENDING" },
        { fieldPath: "createdAt", order: "DESCENDING" }
      ]
    }
  ]
};

export default FirestoreSchema_v2;
