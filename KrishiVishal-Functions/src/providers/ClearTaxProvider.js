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
        return true;
    }

    async generateEInvoice(orderData) {
        try {
            console.log(`[ClearTax] Generating E-Invoice for order: ${orderData.id}`);
            const payload = [this._mapOrderToEInvoicePayload(orderData)];

            const response = await axios.post(`${this.baseUrl}/einvoice/generate`, payload, {
                headers: {
                    'x-cleartax-auth-token': this.token,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            const result = response.data[0];
            if (result.error_details) {
                throw new Error(result.error_details[0]?.error_message || 'ClearTax E-Invoice API Error');
            }

            return {
                status: 'SUCCESS',
                provider: 'CLEARTAX',
                operation: 'E_INVOICE_GEN',
                referenceId: orderData.id,
                providerReferenceId: result.irn,
                data: result,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return this._handleError(error, 'E_INVOICE_GEN', orderData.id);
        }
    }

    async generateEWayBill(orderData) {
        try {
            console.log(`[ClearTax] Generating E-Way Bill for order: ${orderData.id}`);
            const payload = this._mapOrderToEWayBillPayload(orderData);

            const response = await axios.post(`${this.baseUrl}/ewaybill/generate`, payload, {
                headers: {
                    'x-cleartax-auth-token': this.token,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            const data = response.data;
            if (data.error_details || data.error) {
                throw new Error(data.error_details?.[0]?.error_message || data.error?.message || 'ClearTax E-Way Bill API Error');
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
            return this._handleError(error, 'E_WAY_BILL_GEN', orderData.id);
        }
    }

    _handleError(error, operation, referenceId) {
        const errorMessage = error.response?.data?.error?.message || error.message;
        console.error(`[ClearTax] ${operation} Failed:`, errorMessage);

        return {
            status: 'FAILED',
            provider: 'CLEARTAX',
            operation,
            referenceId,
            error: {
                code: error.response?.status === 401 ? 'AUTH_FAIL' : 'API_ERR',
                message: errorMessage,
                raw: error.response?.data || {}
            },
            timestamp: new Date().toISOString()
        };
    }

    _mapOrderToEInvoicePayload(order) {
        const gstin = process.env.STORE_GSTIN;
        if (!gstin && this.mode === 'PRODUCTION') throw new Error("STORE_GSTIN secret is required for Production compliance.");

        return {
            transactionDetails: { taxSch: "GST", supTyp: "B2C", regRev: "N" },
            documentDetails: { typ: "INV", no: order.id.slice(-16), dt: new Date(order.createdAt?.toMillis() || Date.now()).toLocaleDateString('en-GB') },
            sellerDetails: {
                gstin: gstin || "10AAAAA0000A1Z5", // Sandbox fallback
                lglNm: "Krishi Vishal",
                addr1: "Main Road, Near Block Chowk",
                loc: "Purnea",
                pin: 854301,
                stc: "10"
            },
            buyerDetails: {
                gstin: order.customerGstin || "URP",
                lglNm: order.userName || "Customer",
                pos: "10",
                addr1: order.address?.substring(0, 100) || "Bihar",
                loc: "Bihar",
                pin: parseInt(order.pincode) || 854301,
                stc: "10"
            },
            itemList: order.items.map((item, index) => ({
                slNo: (index + 1).toString(),
                prdDesc: item.productName,
                isServc: "N",
                hsnCd: item.hsnCode || "3101",
                qty: item.quantity,
                unit: "NOS",
                unitPrice: item.price,
                totAmt: item.price * item.quantity,
                taxableAmt: item.price * item.quantity,
                gstRt: item.gstRate || 5,
                cgstAmt: (item.price * item.quantity * (item.gstRate || 5)) / 200,
                sgstAmt: (item.price * item.quantity * (item.gstRate || 5)) / 200,
                totItemVal: (item.price * item.quantity) * (1 + (item.gstRate || 5) / 100)
            })),
            valueDetails: {
                totTaxVal: order.totalAmount - (order.totalTax || 0),
                cgstVal: (order.totalTax || 0) / 2,
                sgstVal: (order.totalTax || 0) / 2,
                totInvVal: order.totalAmount
            }
        };
    }

    _mapOrderToEWayBillPayload(order) {
        const gstin = process.env.STORE_GSTIN;
        if (this.mode === 'PRODUCTION') {
            if (!order.vehicleNo) throw new Error("Vehicle Number is mandatory for Production E-Way Bill.");
            if (!gstin) throw new Error("STORE_GSTIN secret is required for Production compliance.");
        }

        return {
            transactionType: "Regular",
            subTransactionType: "Supply",
            documentType: "INV",
            documentNumber: order.id.slice(-16),
            documentDate: new Date(order.createdAt?.toMillis() || Date.now()).toLocaleDateString('en-GB'),
            fromGstin: gstin || "10AAAAA0000A1Z5",
            fromTrdName: "Krishi Vishal",
            fromAddr1: "Main Road, Near Block Chowk",
            fromPlace: "Purnea",
            fromPincode: 854301,
            fromStateCode: 10,
            toGstin: order.customerGstin || "URP",
            toTrdName: order.userName,
            toAddr1: order.address?.substring(0, 100),
            toPlace: order.city || "Bihar",
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
                cgstRate: (item.gstRate || 5) / 2,
                sgstRate: (item.gstRate || 5) / 2,
                igstRate: 0
            })),
            totalValue: order.totalAmount,
            mainHsnCode: parseInt(order.items[0]?.hsnCode) || 3101,
            transDistance: order.transDistance || 50,
            transMode: 1,
            vehicleNo: order.vehicleNo || "BR11TEST",
            vehicleType: "R"
        };
    }
}

module.exports = ClearTaxProvider;
