/**
 * Mock GSP Provider for Testing and Sandbox
 */
class MockProvider {
    constructor(mode = 'SANDBOX') {
        this.mode = mode;
    }

    async authenticate() {
        return true;
    }

    async generateEWayBill(orderData) {
        console.log(`[MOCK] Generating E-Way Bill for order: ${orderData.id}`);

        // Simulate government network latency
        await new Promise(resolve => setTimeout(resolve, 500));

        const ewbNo = Math.floor(100000000000 + Math.random() * 900000000000).toString();

        return {
            status: 'SUCCESS',
            provider: 'MOCK',
            operation: 'E_WAY_BILL_GEN',
            referenceId: orderData.id,
            providerReferenceId: ewbNo,
            data: {
                ewbNo: ewbNo,
                validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            },
            timestamp: new Date().toISOString()
        };
    }

    async generateEInvoice(orderData) {
        const irn = require('crypto').randomBytes(32).toString('hex');
        return {
            status: 'SUCCESS',
            provider: 'MOCK',
            operation: 'E_INVOICE_GEN',
            referenceId: orderData.id,
            providerReferenceId: irn,
            data: { irn },
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = MockProvider;
