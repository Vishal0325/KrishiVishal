const axios = require('axios');
const { HttpsError } = require("firebase-functions/v2/https");
const { getRequiredSecret } = require("../security_utils");

/**
 * ClearTax GSP Provider Implementation
 * API Docs: https://api.cleartax.in/
 */
class ClearTaxProvider {
    constructor(mode = 'SANDBOX') {
        this.mode = mode;
        this.baseUrl = mode === 'PRODUCTION'
            ? 'https://api.cleartax.in/v2'
            : 'https://api-sandbox.cleartax.in/v2';
        this.token = getRequiredSecret('CLEARTAX_AUTH_TOKEN', 'ClearTax API Authentication Token');
    }

    async authenticate() {
        // ClearTax uses static auth tokens passed in headers
        return true;
    }

    /**
     * Generates an e-Way Bill via ClearTax API
     */
    async generateEWayBill(orderData) {
        try {
            console.log(`[ClearTax] Generating E-Way Bill for order: ${orderData.id} (Mode: ${this.mode})`);

            const payload = this._mapOrderToEWayBillPayload(orderData);

            const response = await axios.post(`${this.baseUrl}/ewaybill/generate`, payload, {
                headers: {
                    'x-cleartax-auth-token': this.token,
                    'Content-Type': 'application/json'
                }
            });

            const data = response.data;

            if (data.error) {
                throw new Error(data.error.message || 'ClearTax API Error');
            }

            return {
                status: 'SUCCESS',
                provider: 'CLEARTAX',
                operation: 'E_WAY_BILL_GEN',
                referenceId: orderData.id,
                providerReferenceId: data.ewbNo,
                data: data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error(`[ClearTax] E-Way Bill Generation Failed:`, error.response?.data || error.message);
            return {
                status: 'FAILED',
                provider: 'CLEARTAX',
                operation: 'E_WAY_BILL_GEN',
                referenceId: orderData.id,
                error: {
                    code: error.response?.status === 401 ? 'AUTH_FAIL' : 'API_ERR',
                    message: error.response?.data?.error?.message || error.message,
                    raw: error.response?.data || {}
                },
                timestamp: new Date().toISOString()
            };
        }
    }

    async generateEInvoice(orderData) {
        // Implementation for e-Invoice (IRN generation)
        throw new Error("E-Invoice not implemented yet in ClearTaxProvider");
    }

    /**
     * Maps internal Order model to ClearTax E-Way Bill Schema
     */
    _mapOrderToEWayBillPayload(order) {
        return {
            transactionType: "Regular",
            subTransactionType: "Supply",
            documentType: "INV",
            documentNumber: order.id.slice(-16), // Max 16 chars for gov compliance
            documentDate: new Date(order.createdAt?.toMillis() || Date.now()).toLocaleDateString('en-GB'),
            fromGstin: process.env.STORE_GSTIN || "10AAAAA0000A1Z5", // Bihar KV GSTIN
            fromTrdName: "Krishi Vishal",
            fromAddr1: "Main Road, Near Block Chowk",
            fromPlace: "Purnea",
            fromPincode: 854301,
            fromStateCode: 10, // Bihar
            toGstin: order.customerGstin || "URP", // URP for Unregistered Person
            toTrdName: order.userName,
            toAddr1: order.address.substring(0, 50),
            toPlace: "Bihar",
            toPincode: parseInt(order.pincode) || 854301,
            toStateCode: 10,
            actualFromStateCode: 10,
            actualToStateCode: 10,
            itemList: order.items.map(item => ({
                productName: item.productName,
                hsnCode: item.hsnCode || "3101",
                quantity: item.quantity,
                qtyUnit: "NOS",
                taxableAmount: item.price * item.quantity,
                cgstRate: item.gstRate / 2 || 2.5,
                sgstRate: item.gstRate / 2 || 2.5,
                igstRate: 0
            })),
            totalValue: order.totalAmount,
            mainHsnCode: 3101,
            transDistance: 50, // Simplified for now
            transMode: 1, // Road
            vehicleNo: order.vehicleNo || "BR11XXXX",
            vehicleType: "R"
        };
    }
}

module.exports = ClearTaxProvider;
