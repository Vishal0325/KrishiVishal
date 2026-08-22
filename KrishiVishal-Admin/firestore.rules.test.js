/**
 * FIRESTORE SECURITY RULES - TEST SUITE
 * Comprehensive testing with Firebase Emulator
 */

// Run tests with: npm test

const testing = require('@firebase/testing');
const admin = require('firebase-admin');

const PROJECT_ID = 'krishivishal-dev';
const FIRESTORE_PORT = 8080;

// Test user IDs
const AUTHENTICATED_UID = 'auth_user_123';
const ADMIN_UID = 'admin_user_456';
const OTHER_USER_UID = 'other_user_789';

let db;

describe('KrishiVishal Firestore Security Rules', () => {
  
  beforeAll(async () => {
    // Setup emulator
    process.env.FIRESTORE_EMULATOR_HOST = `localhost:${FIRESTORE_PORT}`;
    db = admin.firestore();
  });

  afterEach(async () => {
    // Clear data between tests
    await testing.clearFirestoreData({ projectId: PROJECT_ID });
  });

  afterAll(async () => {
    await testing.deleteApp(db);
  });

  // ========== ORDERS COLLECTION TESTS ==========

  describe('Orders Collection', () => {
    
    test('User can read own orders', async () => {
      const userDb = testing.getFirestore({ uid: AUTHENTICATED_UID });
      
      // Set test data
      await admin.firestore().collection('orders').doc('order_1').set({
        userId: AUTHENTICATED_UID,
        status: 'DELIVERED',
        totalAmount: 500
      });

      // Should succeed
      const doc = await userDb.collection('orders').doc('order_1').get();
      expect(doc.exists).toBe(true);
    });

    test('User cannot read other users orders', async () => {
      const userDb = testing.getFirestore({ uid: AUTHENTICATED_UID });
      
      // Set test data
      await admin.firestore().collection('orders').doc('order_1').set({
        userId: OTHER_USER_UID,
        status: 'DELIVERED',
        totalAmount: 500
      });

      // Should fail
      await expect(
        userDb.collection('orders').doc('order_1').get()
      ).rejects.toThrow();
    });

    test('User can create order with correct userId', async () => {
      const userDb = testing.getFirestore({ uid: AUTHENTICATED_UID });
      
      await expect(
        userDb.collection('orders').doc('order_1').set({
          userId: AUTHENTICATED_UID,
          status: 'PLACED',
          totalAmount: 500,
          items: [{ productId: 'prod_1' }],
          paymentDetails: { gateway: 'RAZORPAY' },
          address: { name: 'Test' },
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        })
      ).resolves.toBeDefined();
    });

    test('User cannot create order with different userId', async () => {
      const userDb = testing.getFirestore({ uid: AUTHENTICATED_UID });
      
      await expect(
        userDb.collection('orders').doc('order_1').set({
          userId: OTHER_USER_UID,
          status: 'PLACED',
          totalAmount: 500,
          items: [],
          paymentDetails: {},
          address: {},
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        })
      ).rejects.toThrow();
    });

    test('User can cancel own order if status is PLACED', async () => {
      const userDb = testing.getFirestore({ uid: AUTHENTICATED_UID });
      
      // Create order
      await admin.firestore().collection('orders').doc('order_1').set({
        userId: AUTHENTICATED_UID,
        status: 'PLACED',
        totalAmount: 500,
        paymentDetails: { gateway: 'RAZORPAY' },
        items: [],
        address: {}
      });

      // Update to CANCELLED
      await expect(
        userDb.collection('orders').doc('order_1').update({
          status: 'CANCELLED'
        })
      ).resolves.toBeDefined();
    });

    test('User cannot cancel order if status is SHIPPED', async () => {
      const userDb = testing.getFirestore({ uid: AUTHENTICATED_UID });
      
      // Create order with SHIPPED status
      await admin.firestore().collection('orders').doc('order_1').set({
        userId: AUTHENTICATED_UID,
        status: 'SHIPPED',
        totalAmount: 500,
        paymentDetails: { gateway: 'RAZORPAY' },
        items: [],
        address: {}
      });

      // Try to update to CANCELLED (should fail)
      await expect(
        userDb.collection('orders').doc('order_1').update({
          status: 'CANCELLED'
        })
      ).rejects.toThrow();
    });

    test('Admin can update any order', async () => {
      const adminDb = testing.getFirestore({ 
        uid: ADMIN_UID,
        token: { admin: true }
      });
      
      // Create order by regular user
      await admin.firestore().collection('orders').doc('order_1').set({
        userId: OTHER_USER_UID,
        status: 'PLACED',
        totalAmount: 500,
        paymentDetails: {},
        items: [],
        address: {}
      });

      // Admin updates
      await expect(
        adminDb.collection('orders').doc('order_1').update({
          status: 'CONFIRMED'
        })
      ).resolves.toBeDefined();
    });
  });

  // ========== RETURNS COLLECTION TESTS ==========

  describe('Returns Collection', () => {
    
    test('User can create return with PENDING status', async () => {
      const userDb = testing.getFirestore({ uid: AUTHENTICATED_UID });
      
      await expect(
        userDb.collection('returns').doc('return_1').set({
          userId: AUTHENTICATED_UID,
          orderId: 'order_1',
          status: 'PENDING',
          reason: 'Damaged product',
          adminNotes: '',
          financials: {
            totalAmount: 500,
            refundAmountInitiated: 0,
            gatewayRefundId: '',
            processedAt: null
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        })
      ).resolves.toBeDefined();
    });

    test('User cannot create return with gatewayRefundId', async () => {
      const userDb = testing.getFirestore({ uid: AUTHENTICATED_UID });
      
      await expect(
        userDb.collection('returns').doc('return_1').set({
          userId: AUTHENTICATED_UID,
          orderId: 'order_1',
          status: 'PENDING',
          reason: 'Damaged',
          gatewayRefundId: 'rfnd_123',  // Not allowed
          adminNotes: '',
          financials: {
            totalAmount: 500,
            refundAmountInitiated: 0,
            gatewayRefundId: '',
            processedAt: null
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        })
      ).rejects.toThrow();
    });

    test('User cannot approve return', async () => {
      const userDb = testing.getFirestore({ uid: AUTHENTICATED_UID });
      
      // Create return
      await admin.firestore().collection('returns').doc('return_1').set({
        userId: AUTHENTICATED_UID,
        orderId: 'order_1',
        status: 'PENDING',
        reason: 'Damaged',
        adminNotes: '',
        financials: {
          totalAmount: 500,
          refundAmountInitiated: 0,
          gatewayRefundId: '',
          processedAt: null
        }
      });

      // Try to update to APPROVED (should fail)
      await expect(
        userDb.collection('returns').doc('return_1').update({
          status: 'APPROVED'
        })
      ).rejects.toThrow();
    });

    test('Admin can approve return', async () => {
      const adminDb = testing.getFirestore({ 
        uid: ADMIN_UID,
        token: { admin: true }
      });
      
      // Create return
      await admin.firestore().collection('returns').doc('return_1').set({
        userId: OTHER_USER_UID,
        orderId: 'order_1',
        status: 'PENDING',
        reason: 'Damaged',
        adminNotes: '',
        financials: {
          totalAmount: 500,
          refundAmountInitiated: 0,
          gatewayRefundId: '',
          processedAt: null
        }
      });

      // Admin approves
      await expect(
        adminDb.collection('returns').doc('return_1').update({
          status: 'APPROVED',
          adminNotes: 'Approved by admin'
        })
      ).resolves.toBeDefined();
    });

    test('Admin cannot modify return reason', async () => {
      const adminDb = testing.getFirestore({ 
        uid: ADMIN_UID,
        token: { admin: true }
      });
      
      // Create return
      await admin.firestore().collection('returns').doc('return_1').set({
        userId: OTHER_USER_UID,
        orderId: 'order_1',
        status: 'PENDING',
        reason: 'Damaged',
        adminNotes: '',
        financials: {
          totalAmount: 500,
          refundAmountInitiated: 0,
          gatewayRefundId: '',
          processedAt: null
        }
      });

      // Try to modify reason (should fail)
      await expect(
        adminDb.collection('returns').doc('return_1').update({
          reason: 'Different reason'
        })
      ).rejects.toThrow();
    });
  });

  // ========== UNAUTHORIZED ACCESS TESTS ==========

  describe('Unauthorized Access', () => {
    
    test('Unauthenticated user cannot create order', async () => {
      const unauthDb = testing.getFirestore();
      
      await expect(
        unauthDb.collection('orders').doc('order_1').set({
          userId: 'any_user',
          status: 'PLACED',
          totalAmount: 500
        })
      ).rejects.toThrow();
    });

    test('Unauthenticated user cannot read orders', async () => {
      const unauthDb = testing.getFirestore();
      
      await expect(
        unauthDb.collection('orders').doc('order_1').get()
      ).rejects.toThrow();
    });

    test('Cannot access undefined collections', async () => {
      const userDb = testing.getFirestore({ uid: AUTHENTICATED_UID });
      
      await expect(
        userDb.collection('secretData').doc('doc_1').get()
      ).rejects.toThrow();
    });
  });

  // ========== FINANCIAL AUDIT TESTS ==========

  describe('Financial Audit', () => {
    
    test('Return must have complete financials', async () => {
      const userDb = testing.getFirestore({ uid: AUTHENTICATED_UID });
      
      // Missing totalAmount
      await expect(
        userDb.collection('returns').doc('return_1').set({
          userId: AUTHENTICATED_UID,
          orderId: 'order_1',
          status: 'PENDING',
          reason: 'Damaged',
          adminNotes: '',
          financials: {
            refundAmountInitiated: 0,
            gatewayRefundId: ''
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        })
      ).rejects.toThrow();
    });

    test('Refund amount must be valid', async () => {
      const userDb = testing.getFirestore({ uid: AUTHENTICATED_UID });
      
      // Zero amount
      await expect(
        userDb.collection('returns').doc('return_1').set({
          userId: AUTHENTICATED_UID,
          orderId: 'order_1',
          status: 'PENDING',
          reason: 'Damaged',
          adminNotes: '',
          financials: {
            totalAmount: 0,  // Invalid
            refundAmountInitiated: 0,
            gatewayRefundId: '',
            processedAt: null
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        })
      ).rejects.toThrow();
    });
  });
});

/**
 * RUN TESTS
 * 
 * 1. Start emulator:
 *    firebase emulators:start --only firestore
 * 
 * 2. Run tests:
 *    npm test
 * 
 * 3. Check coverage:
 *    npm run test:coverage
 */
