/**
 * KRISHIVISHAL - Production Firestore Schema v2.0
 * Financial Audit Enabled
 * Optimized for Return, Refund, and Cancellation Flows
 */

// ===========================
// ORDERS COLLECTION SCHEMA
// ===========================

// Document: orders/{orderId}
{
  // Core Order Info
  id: string,                    // Order ID (auto-generated)
  userId: string,                // Firebase UID of customer
  status: "PLACED" | "CONFIRMED" | "PACKED" | "SHIPPED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED",
  
  // Items
  items: [
    {
      productId: string,
      productName: string,
      quantity: number,
      price: number,             // Unit price
      cropAssociatedIds: string[], // Associated crop IDs
      imageUrl: string,
      discount: number           // Per item discount
    }
  ],
  
  // Financial Details
  totalAmount: number,           // Final amount after discounts
  subtotal: number,              // Before discounts
  discountAmount: number,        // Total discount
  deliveryCharge: number,
  
  // Payment Gateway Integration
  paymentDetails: {
    gateway: "RAZORPAY" | "STRIPE" | "COD" | "UPI",
    transactionId: string,       // Unique transaction ID from gateway
    paymentMethod: "CARD" | "UPI" | "WALLET" | "NET_BANKING" | "CASH_ON_DELIVERY",
    paymentStatus: "SUCCESS" | "PENDING" | "FAILED",
    paymentTimestamp: timestamp
  },
  
  // Delivery Address
  address: {
    name: string,
    phone: string,
    email: string,
    street: string,
    village: string,
    district: string,
    state: string,
    pincode: string
  },
  
  // Timestamps
  createdAt: timestamp,
  updatedAt: timestamp,
  deliveredAt: timestamp,
  
  // Cancellation & Return Info
  cancelled: boolean,
  cancellationReason: string,
  cancellationTimestamp: timestamp,
  returnPending: boolean,
  returnId: string,              // References returns/{returnId}
  returnApproved: boolean,
  returnRejected: boolean,
  
  // Indexing Optimization
  __name__: string               // Firestore auto-index field
}

// Example Document
{
  id: "order_abc123",
  userId: "user_xyz789",
  status: "DELIVERED",
  items: [
    {
      productId: "prod_001",
      productName: "Allwin Fertilizer",
      quantity: 2,
      price: 250,
      cropAssociatedIds: ["rice", "wheat", "cotton"],
      imageUrl: "https://...",
      discount: 50
    }
  ],
  totalAmount: 450,
  subtotal: 500,
  discountAmount: 50,
  deliveryCharge: 0,
  paymentDetails: {
    gateway: "RAZORPAY",
    transactionId: "pay_1234567890",
    paymentMethod: "UPI",
    paymentStatus: "SUCCESS",
    paymentTimestamp: 2024-01-15T10:30:00Z
  },
  address: {
    name: "Farmer Name",
    phone: "+919876543210",
    email: "farmer@example.com",
    street: "Farm Road",
    village: "Nashik",
    district: "Nashik",
    state: "Maharashtra",
    pincode: "422001"
  },
  createdAt: 2024-01-15T09:00:00Z,
  updatedAt: 2024-01-16T14:00:00Z,
  deliveredAt: 2024-01-16T14:00:00Z,
  cancelled: false,
  returnPending: false
}

// ===========================
// RETURNS COLLECTION SCHEMA
// ===========================

// Document: returns/{returnId}
{
  // Return Identification
  id: string,                    // Return ID (auto-generated)
  orderId: string,               // Foreign key to orders/{orderId}
  userId: string,                // Customer Firebase UID
  
  // Return Details
  productName: string,
  reason: string,                // Why return was initiated
  proofUrls: string[],           // URLs of proof images from Storage
  status: "PENDING" | "APPROVED" | "REJECTED" | "PICKED_UP" | "COMPLETED" | "AUTO_APPROVED" | "REFUND_FAILED",
  adminNotes: string,            // Admin's remarks
  
  // Financial Tracking Sub-object
  financials: {
    totalAmount: number,         // Full order amount
    refundAmountInitiated: number, // Amount approved for refund (can be partial)
    gatewayRefundId: string,     // Refund ID from payment gateway
    processedAt: timestamp,      // When refund was processed
    
    // Payment Gateway Context
    paymentDetails: {
      transactionId: string,     // Original transaction ID
      gateway: "RAZORPAY" | "STRIPE" | "COD" | "UPI",
      paymentMethod: "CARD" | "UPI" | "WALLET"
    },
    
    // Audit Trail
    refundAttempts: number,      // Count of refund attempts
    lastRefundAttempt: timestamp,
    failureReason: string
  },
  
  // Timestamps
  createdAt: timestamp,
  updatedAt: timestamp,
  
  // Additional Metadata
  isAutoApproved: boolean,       // True for pre-shipment cancellations
  pickupScheduled: timestamp,
  pickupCompletedAt: timestamp
}

// Example Document (POST-DELIVERY RETURN)
{
  id: "return_def456",
  orderId: "order_abc123",
  userId: "user_xyz789",
  productName: "Allwin Fertilizer",
  reason: "Damaged packaging",
  proofUrls: [
    "gs://bucket/returns/def456_1.jpg",
    "gs://bucket/returns/def456_2.jpg"
  ],
  status: "APPROVED",
  adminNotes: "Item returned in sealed condition. Full refund approved.",
  financials: {
    totalAmount: 450,
    refundAmountInitiated: 450,
    gatewayRefundId: "rfnd_1234567890",
    processedAt: 2024-01-17T16:00:00Z,
    paymentDetails: {
      transactionId: "pay_1234567890",
      gateway: "RAZORPAY",
      paymentMethod: "UPI"
    },
    refundAttempts: 1,
    lastRefundAttempt: 2024-01-17T16:00:00Z,
    failureReason: ""
  },
  createdAt: 2024-01-16T14:30:00Z,
  updatedAt: 2024-01-17T16:00:00Z,
  isAutoApproved: false,
  pickupScheduled: 2024-01-17T10:00:00Z,
  pickupCompletedAt: 2024-01-18T14:00:00Z
}

// Example Document (PRE-SHIPMENT CANCELLATION - AUTO-APPROVED)
{
  id: "return_ghi789",
  orderId: "order_xyz999",
  userId: "user_abc111",
  productName: "Order Cancellation",
  reason: "Pre-shipment cancellation: Changed my mind",
  proofUrls: [],
  status: "AUTO_APPROVED",
  adminNotes: "Automatic approval: Order cancelled before shipment",
  financials: {
    totalAmount: 500,
    refundAmountInitiated: 500,
    gatewayRefundId: "",           // Will be populated by Cloud Function
    processedAt: null,             // Will be set by Cloud Function
    paymentDetails: {
      transactionId: "pay_9999999999",
      gateway: "RAZORPAY",
      paymentMethod: "CARD"
    },
    refundAttempts: 0,
    lastRefundAttempt: null,
    failureReason: ""
  },
  createdAt: 2024-01-15T09:15:00Z,
  updatedAt: 2024-01-15T09:15:00Z,
  isAutoApproved: true
}

// ===========================
// FIRESTORE INDEXES REQUIRED
// ===========================

// Composite Index 1
Collection: orders
Fields: 
  - userId (Ascending)
  - status (Ascending)
  - createdAt (Descending)

// Composite Index 2
Collection: returns
Fields:
  - userId (Ascending)
  - status (Ascending)
  - createdAt (Descending)

// Composite Index 3
Collection: returns
Fields:
  - status (Ascending)
  - createdAt (Descending)

// ===========================
// MIGRATION STEPS (FROM OLD SCHEMA)
// ===========================

/*
1. Backup existing data
   - Export orders collection to JSON
   - Export returns collection to JSON

2. Update orders documents:
   - Add paymentDetails sub-object if missing
   - Add cancelled, cancellationReason, cancellationTimestamp fields
   - Add returnPending, returnId, returnApproved, returnRejected fields

3. Update returns documents:
   - Add financials sub-object with paymentDetails
   - Ensure status field includes new statuses
   - Add isAutoApproved, pickupScheduled fields

4. Create missing indexes (via Firebase Console)

5. Test with sample data before production deploy
*/

// ===========================
// FIRESTORE CONSTRAINTS
// ===========================

/*
Document Size Limits:
  - Max 1 MB per document (financials sub-object stays well under)
  - Max 100 fields per document (current schema: ~35 fields - OK)

Collection Size:
  - No size limit, but recommend archiving old returns after 1 year

Write Frequency:
  - Max 1 write per second per document (acceptable for refund processing)
  - Transactions support up to 500 operations

Read Frequency:
  - No limit for reads
  - Filtered queries use composite indexes efficiently
*/
