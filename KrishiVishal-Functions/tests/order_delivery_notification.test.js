const admin = require('firebase-admin');
const test = require('firebase-functions-test')();
const axios = require('axios');
const { getFirestore } = require('firebase-admin/firestore');

// Mock axios
jest.mock('axios');

admin.initializeApp();

describe('orderDeliveryNotification Trigger', () => {
    let myFunctions;
    let db;

    beforeAll(() => {
        myFunctions = require('../index.js');
        db = getFirestore();
    });

    afterAll(() => {
        test.cleanup();
        jest.restoreAllMocks();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.WHATSAPP_TOKEN = 'test_token';
        process.env.WHATSAPP_PHONE_NUMBER_ID = 'test_phone_id';
    });

    it('should be a No-Op if status does not change to DELIVERED', async () => {
        const beforeSnap = test.firestore.makeDocumentSnapshot({ status: 'PENDING' }, 'orders/order123');
        const afterSnap = test.firestore.makeDocumentSnapshot({ status: 'SHIPPED' }, 'orders/order123');
        const change = test.makeChange(beforeSnap, afterSnap);

        const result = await test.wrap(myFunctions.orderDeliveryNotification)({
            data: change,
            params: { orderId: 'order123' }
        });
        expect(result).toBeNull();
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('should be a No-Op if status was already DELIVERED', async () => {
        const beforeSnap = test.firestore.makeDocumentSnapshot({ status: 'DELIVERED' }, 'orders/order123');
        const afterSnap = test.firestore.makeDocumentSnapshot({ status: 'DELIVERED', updated: true }, 'orders/order123');
        const change = test.makeChange(beforeSnap, afterSnap);

        const result = await test.wrap(myFunctions.orderDeliveryNotification)({
            data: change,
            params: { orderId: 'order123' }
        });
        expect(result).toBeNull();
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('should send WhatsApp message if status changes to DELIVERED and data is complete', async () => {
        axios.post.mockResolvedValueOnce({ data: { messages: [{ id: 'msg123' }] } });

        const beforeSnap = test.firestore.makeDocumentSnapshot({ status: 'SHIPPED' }, 'orders/order123');
        const afterSnap = test.firestore.makeDocumentSnapshot({
            status: 'DELIVERED',
            invoiceUrl: 'https://example.com/invoice.pdf',
            customerName: 'Test Kisan',
            userPhone: '9876543210'
        }, 'orders/order123');
        const change = test.makeChange(beforeSnap, afterSnap);

        // We mock the DB collection add call to avoid actual DB writes during test
        const addMock = jest.fn().mockResolvedValue();
        const collectionMock = jest.spyOn(db, 'collection').mockReturnValue({ add: addMock });

        const result = await test.wrap(myFunctions.orderDeliveryNotification)({
            data: change,
            params: { orderId: 'order123' }
        });
        
        expect(result).toBeNull();
        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(axios.post).toHaveBeenCalledWith(
            'https://graph.facebook.com/v17.0/test_phone_id/messages',
            expect.objectContaining({
                to: '919876543210',
                type: 'document'
            }),
            expect.any(Object)
        );
        expect(addMock).toHaveBeenCalledWith(expect.objectContaining({
            status: 'SENT',
            orderId: 'order123'
        }));

        collectionMock.mockRestore();
    });
});
