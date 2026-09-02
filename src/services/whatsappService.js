/**
 * WhatsApp Business Automation Service for KrishiVishal ERP
 * Provides deep-links and API-ready message generators for orders, invoices, and cart recovery.
 */

/**
 * Format phone number to international 91XXXXXXXXXX format
 */
export const formatWhatsAppNumber = (phone) => {
  if (!phone) return "";
  let clean = phone.toString().replace(/\D/g, "");
  if (clean.length === 10) {
    clean = "91" + clean;
  }
  return clean;
};

/**
 * Open WhatsApp Web / App with encoded message
 */
export const openWhatsAppUrl = (phone, text) => {
  const formattedPhone = formatWhatsAppNumber(phone);
  if (!formattedPhone) return false;
  const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
  return true;
};

/**
 * 1. Order Confirmation WhatsApp Message
 */
export const sendOrderConfirmationWhatsApp = (order) => {
  const customerName = order.customerName || order.shippingAddress?.fullName || "किसान भाई";
  const orderId = order.orderNumber || order.id?.substring(0, 8).toUpperCase();
  const totalAmount = order.totalAmount || order.total || 0;
  const itemsList = (order.items || [])
    .map((item, idx) => `  ${idx + 1}. ${item.name || item.productName} (${item.quantity || 1} x ₹${item.price || 0})`)
    .join("\n");

  const message = `🌿 *कृषि विशाल (KrishiVishal) — ऑर्डर कन्फर्मेशन* 🌿\n\n` +
    `नमस्ते *${customerName}* जी,\n` +
    `आपका ऑर्डर सफलतापूर्वक स्वीकार कर लिया गया है।\n\n` +
    `📋 *ऑर्डर आईडी:* #${orderId}\n` +
    `💰 *कुल राशि:* ₹${totalAmount}\n` +
    `💳 *भुगतान प्रकार:* ${order.paymentMethod === 'COD' ? 'कैश ऑन डिलीवरी (COD)' : 'ऑनलाइन पेड'}\n\n` +
    `📦 *सामग्री विवरण:*\n${itemsList}\n\n` +
    `📍 *डिलीवरी पता:* ${order.shippingAddress?.address || order.address || 'पंजीकृत पता'}, ${order.shippingAddress?.pincode || ''}\n\n` +
    `⚡ हमारा वेयरहाउस आपका पार्सल तैयार कर रहा है। डिस्पैच होते ही आपको सूचित किया जाएगा।\n\n` +
    `📞 किसी भी सहायता के लिए संपर्क करें: 1800-123-4567\n` +
    `_कृषि विशाल — किसान का सच्चा साथी_`;

  return openWhatsAppUrl(order.customerPhone || order.shippingAddress?.phoneNumber || order.phone, message);
};

/**
 * 2. Out for Delivery WhatsApp Message
 */
export const sendOutForDeliveryWhatsApp = (order, riderInfo = {}) => {
  const customerName = order.customerName || order.shippingAddress?.fullName || "किसान भाई";
  const orderId = order.orderNumber || order.id?.substring(0, 8).toUpperCase();
  const riderName = riderInfo.name || order.assignedRiderName || "कृषि विशाल डिलीवरी बॉय";
  const riderPhone = riderInfo.phone || order.assignedRiderPhone || "7004123456";
  const otpCode = order.deliveryOtp || order.otp || "8921";

  const message = `🚚 *कृषि विशाल — पार्सल डिलीवरी के लिए रवाना!* 🚚\n\n` +
    `नमस्ते *${customerName}* जी,\n` +
    `आपका ऑर्डर #${orderId} वेयरहाउस से निकल चुका है और आज आपके पते पर पहुँचेगा।\n\n` +
    `🚴 *डिलीवरी पार्टनर:* ${riderName}\n` +
    `📞 *राइडर संपर्क नंबर:* ${riderPhone}\n` +
    `💰 *भुगतान योग्य राशि:* ₹${order.totalAmount || order.total || 0} (${order.paymentMethod === 'COD' ? 'नकद भुगतान' : 'पहले से भुगतान हो चुका है'})\n\n` +
    `🔐 *डिलीवरी OTP:* *${otpCode}*\n` +
    `_(पार्सल प्राप्त करते समय यह OTP डिलीवरी बॉय को बताएँ)_\n\n` +
    `धन्यवाद,\n*कृषि विशाल लॉजिस्टिक्स टीम*`;

  return openWhatsAppUrl(order.customerPhone || order.shippingAddress?.phoneNumber || order.phone, message);
};

/**
 * 3. Invoice & Receipt WhatsApp Message
 */
export const sendInvoiceWhatsApp = (order) => {
  const customerName = order.customerName || order.shippingAddress?.fullName || "किसान भाई";
  const orderId = order.orderNumber || order.id?.substring(0, 8).toUpperCase();
  const totalAmount = order.totalAmount || order.total || 0;
  const invoiceUrl = `https://krishivishal-a9ed7.web.app/invoice/${order.id}`;

  const message = `🧾 *कृषि विशाल — टैक्स इनवॉइस व रसीद* 🧾\n\n` +
    `नमस्ते *${customerName}* जी,\n` +
    `ऑर्डर #${orderId} की आधिकारिक टैक्स इनवॉइस (GST Bill) तैयार है।\n\n` +
    `💰 *कुल बिल राशि:* ₹${totalAmount}\n` +
    `📥 *डिजिटल बिल डाउनलोड लिंक:*\n${invoiceUrl}\n\n` +
    `_कृषि विशाल से खरीदारी करने के लिए धन्यवाद!_`;

  return openWhatsAppUrl(order.customerPhone || order.shippingAddress?.phoneNumber || order.phone, message);
};

/**
 * 4. Abandoned Cart Recovery WhatsApp Message
 */
export const sendAbandonedCartWhatsApp = (cart, discountCode = "KISAN10") => {
  const customerName = cart.customerName || cart.userName || "किसान भाई";
  const itemsText = (cart.items || [])
    .map(i => `• ${i.name} (${i.quantity || 1} यूनिट)`)
    .join("\n");

  const message = `🌾 *कृषि विशाल — आपके कार्ट में सामान छूट गया है!* 🌾\n\n` +
    `नमस्ते *${customerName}* जी,\n` +
    `आपने अपने कृषि विशाल कार्ट में निम्नलिखित सामग्री चुनी थी, लेकिन ऑर्डर पूरा नहीं हुआ:\n\n` +
    `${itemsText}\n\n` +
    `🎁 *विशेष किसान ऑफर:* आज ही ऑर्डर पूरा करने पर कूपन कोड *${discountCode}* का उपयोग करें और पाएँ *10% अतिरिक्त छूट!*\n\n` +
    `🛒 *तुरंत ऑर्डर पूरा करें:*\nhttps://krishivishal-a9ed7.web.app/cart\n\n` +
    `यदि ऑर्डर करने में कोई समस्या आ रही है, तो हमें इस नंबर पर रिप्लाई करें।\n` +
    `_कृषि विशाल सपोर्ट टीम_`;

  return openWhatsAppUrl(cart.phone || cart.customerPhone || cart.userPhone, message);
};
