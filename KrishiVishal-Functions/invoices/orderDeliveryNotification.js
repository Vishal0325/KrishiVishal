const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { getFirestore } = require('firebase-admin/firestore');
const axios = require('axios');

exports.orderDeliveryNotification = onDocumentUpdated({
    document: 'orders/{orderId}',
    region: 'asia-south1',
    secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID']
}, async (event) => {
    const orderId = event.params.orderId;
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    // Condition: Check if status changed TO 'DELIVERED'
    if (beforeData.status === 'DELIVERED' || afterData.status !== 'DELIVERED') {
        return null;
    }

    const db = getFirestore();
    const invoicePdfUrl = afterData.invoiceUrl || afterData.invoice?.pdfUrl || afterData.invoicePdfUrl;
    const farmerName = afterData.userName || afterData.customerName || afterData.address?.name || 'Kisan';
    const customerPhone = afterData.userPhone || afterData.phone || afterData.shippingAddress?.phone || afterData.address?.phone;

    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId || !customerPhone || !invoicePdfUrl) {
        // Fallback or Draft mode
        console.log(`[orderDeliveryNotification] Missing API keys or data for order ${orderId}. Logging to order_notifications.`);
        await db.collection('order_notifications').add({
            orderId,
            status: 'PENDING_WHATSAPP',
            type: 'INVOICE_DISPATCH',
            farmerName,
            customerPhone: customerPhone || 'UNKNOWN',
            invoicePdfUrl: invoicePdfUrl || 'MISSING',
            createdAt: new Date(),
            reason: 'Missing API keys or data'
        });
        return null;
    }

    // Format phone number to standard E.164 (without + if required by Meta API)
    let formattedPhone = customerPhone.replace(/\D/g, '');
    if (formattedPhone.length === 10) {
        formattedPhone = `91${formattedPhone}`;
    }

    // Send WhatsApp Message via Meta Cloud API
    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
    
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'document',
        document: {
            link: invoicePdfUrl,
            caption: `नमस्ते ${farmerName} जी, आपका कृषि-विशाल ऑर्डर #${orderId} सफलतापूर्वक डिलीवर हो गया है। आपका टैक्स इनवॉइस (बिल) संलग्न है।`,
            filename: `Invoice_${orderId}.pdf`
        }
    };

    try {
        const response = await axios.post(url, messagePayload, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`[orderDeliveryNotification] Successfully sent WhatsApp message for order ${orderId}.`);
        await db.collection('order_notifications').add({
            orderId,
            status: 'SENT',
            type: 'INVOICE_DISPATCH',
            farmerName,
            customerPhone: formattedPhone,
            invoicePdfUrl,
            messageId: response.data?.messages?.[0]?.id || 'UNKNOWN',
            createdAt: new Date()
        });
    } catch (error) {
        console.error(`[orderDeliveryNotification] Failed to send WhatsApp message for order ${orderId}:`, error.response?.data || error.message);
        await db.collection('order_notifications').add({
            orderId,
            status: 'FAILED',
            type: 'INVOICE_DISPATCH',
            farmerName,
            customerPhone: formattedPhone,
            invoicePdfUrl,
            error: error.response?.data || error.message,
            createdAt: new Date()
        });
    }

    return null;
});
