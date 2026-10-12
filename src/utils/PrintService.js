import { formatCurrency, formatDateTime } from './formatters';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

// [FIXED] Point #95: Sanitize input strings to prevent XSS in print templates
const sanitize = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Generates a high-contrast Code-128 Barcode as a Data URL for thermal printing.
 */
export const generateBarcodeDataUrl = (text, options = {}) => {
  if (!text) return '';
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, String(text).toUpperCase(), {
      format: options.format || 'CODE128',
      width: options.width || 2,
      height: options.height || 45,
      displayValue: options.displayValue !== false,
      fontSize: options.fontSize || 13,
      font: 'monospace',
      margin: options.margin || 2,
      ...options
    });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('Failed to generate Code-128 barcode:', err);
    return '';
  }
};

const printHtmlContent = (htmlContent) => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(htmlContent);
  doc.close();

  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 100);
  }, 250);
};

/**
 * 4×6 Standard Thermal Barcode Sticker (Zebra / TVS / Citizen Roll Format)
 * Designed for standard 100mm × 150mm adhesive roll printers.
 * Includes Code-128 AWB Barcode, 2D QR Code, Multi-Parcel (Box 1 of N),
 * Hazard/Chemical safety badges, and Tamper-Evident Bag Seal Number.
 */
export const generateThermalLabelHtml = async (order, parcelInfo = {}) => {
  const parcelIndex = parcelInfo.parcelIndex || 1;
  const totalParcels = parcelInfo.totalParcels || order?.parcels?.length || 1;
  const parcelWeight = parcelInfo.weightKg || order?.totalWeightKg || '3.5';
  const sealNumber = parcelInfo.sealNumber || order?.sealNumber || `SEAL-${order?.id?.slice(-6)?.toUpperCase() || '8921'}`;
  const trackingNumber = parcelInfo.parcelId || `AWB-${order?.id?.slice(-8)?.toUpperCase() || '1001'}-${parcelIndex}`;
  const hubCode = order?.hubCode || order?.fulfillmentWarehouseId || 'HUB-SAM-001';
  const pincode = order?.address?.pincode || order?.shippingAddress?.pincode || '854301';
  const zoneCode = `ZONE-${pincode.slice(-3)}`;

  // Detect Agri Hazards (e.g. Liquid pesticides, Heavy bags)
  const items = parcelInfo.items || order?.items || [];
  const hasLiquid = items.some(i => (i?.productName || '').toLowerCase().includes('liquid') || (i?.productName || '').toLowerCase().includes('spray') || (i?.productName || '').toLowerCase().includes('ml') || (i?.productName || '').toLowerCase().includes('litre') || (i?.productName || '').toLowerCase().includes('liter'));
  const hasChemical = items.some(i => (i?.productName || '').toLowerCase().includes('pesticide') || (i?.productName || '').toLowerCase().includes('insecticide') || (i?.productName || '').toLowerCase().includes('herbicide') || (i?.category || '').toLowerCase().includes('chemical'));
  const isHeavy = Number(parcelWeight) >= 20 || items.some(i => (i?.productName || '').toLowerCase().includes('50kg') || (i?.productName || '').toLowerCase().includes('bag'));

  // Generate Code-128 Barcode & 2D QR
  const barcodeDataUrl = generateBarcodeDataUrl(trackingNumber, { height: 48, width: 2 });
  let qrCodeDataUrl = '';
  try {
    const qrPayload = JSON.stringify({
      awb: trackingNumber,
      orderId: order?.id,
      parcel: `${parcelIndex}/${totalParcels}`,
      hub: hubCode,
      pincode: pincode,
      seal: sealNumber,
      amount: order?.totalAmount || 0,
      payment: order?.paymentMethod || 'COD'
    });
    qrCodeDataUrl = await QRCode.toDataURL(qrPayload, { width: 120, margin: 1 });
  } catch (err) {
    console.error('Failed to generate thermal QR code', err);
  }

  const itemsList = items.slice(0, 5).map(item => 
    `<li><strong>${sanitize(item?.productName || '')}</strong> &times; ${item?.quantity || 1} ${item?.variantLabel ? `(${sanitize(item.variantLabel)})` : ''}</li>`
  ).join('') || '<li>Standard Agri Package Items</li>';

  const isCOD = String(order?.paymentMethod || 'COD').toUpperCase() === 'COD' || order?.isCOD;

  return `
    <div class="thermal-card-wrapper" style="page-break-after: always; width: 4in; height: 6in; margin: 0; padding: 8px; box-sizing: border-box;">
      <div class="thermal-card">
        <!-- Top Brand & Routing -->
        <div class="header-row">
          <div>
            <div class="brand-title">KRISHI VISHAL LOGISTICS</div>
            <div style="font-size: 9px; font-weight: 700;">BIHAR FAST RURAL DISPATCH</div>
          </div>
          <div style="text-align: right;">
            <span class="hub-badge">${sanitize(hubCode)}</span>
            <div style="font-size: 9px; font-weight: 800; margin-top: 2px;">${sanitize(zoneCode)}</div>
          </div>
        </div>

        <!-- Code 128 Barcode -->
        <div class="tracking-section">
          <img class="tracking-barcode" src="${barcodeDataUrl}" alt="Tracking Barcode" />
        </div>

        <!-- Parcel & Weight Meta -->
        <div class="meta-grid">
          <div class="meta-cell">
            PARCEL
            <strong>${parcelIndex} / ${totalParcels}</strong>
          </div>
          <div class="meta-cell">
            WEIGHT
            <strong>${parcelWeight} KG</strong>
          </div>
          <div class="meta-cell">
            PINCODE
            <strong>${sanitize(pincode)}</strong>
          </div>
        </div>

        <!-- Ship To & QR -->
        <div class="address-qr-grid">
          <div>
            <div class="ship-title">DELIVER TO:</div>
            <div class="customer-name">${sanitize(order?.userName || order?.address?.name || 'Kisan Customer')}</div>
            <div class="address-lines">
              ${order?.address && typeof order?.address === 'string' ? sanitize(order?.address) : [sanitize(order?.address?.village || order?.shippingAddress?.village), sanitize(order?.address?.district || order?.shippingAddress?.district), sanitize(order?.address?.state || 'Bihar')].filter(Boolean).join(', ')}
            </div>
            <div class="phone-line">TEL: ${sanitize(order?.userPhone || order?.address?.phone || order?.shippingAddress?.phone || 'N/A')}</div>
          </div>
          <div class="qr-box">
            ${qrCodeDataUrl ? `<img src="${qrCodeDataUrl}" alt="QR Code" />` : '<div style="font-size: 8px;">NO QR</div>'}
            <div style="font-size: 8px; font-weight: 900; margin-top: 2px;">SCAN TO POD</div>
          </div>
        </div>

        <!-- Agri Safety & Hazard Row -->
        <div class="hazard-row">
          ${hasChemical ? '<span class="hazard-tag">⚠️ AGRI CHEMICAL</span>' : ''}
          ${hasLiquid ? '<span class="hazard-tag">💧 LIQUID BOTTLE - UPRIGHT</span>' : ''}
          ${isHeavy ? '<span class="hazard-tag">🏋️ HEAVY CARGO</span>' : ''}
          ${!hasChemical && !hasLiquid && !isHeavy ? '<span style="color:#444;">📦 STANDARD AGRI SEEDS/INPUTS</span>' : ''}
        </div>

        <!-- Package Items -->
        <div class="items-box">
          <div style="font-weight: 800;">Package Manifest (Items):</div>
          <ul>
            ${itemsList}
          </ul>
        </div>

        <!-- Tamper Evident Bag Seal -->
        <div class="seal-row">
          <span>🔒 TAMPER SEAL: <strong style="font-family: monospace;">${sanitize(sealNumber)}</strong></span>
          <span>ORD: #${sanitize(order?.id?.slice(-8)?.toUpperCase() || 'UNKNOWN')}</span>
        </div>

        <!-- Payment Header Banner -->
        <div class="payment-banner ${isCOD ? 'payment-cod' : 'payment-prepaid'}">
          ${isCOD 
            ? `<div style="font-size: 10px; font-weight: 800; letter-spacing: 0.5px;">CASH ON DELIVERY (COLLECT FROM FARMER)</div><div class="amt">${formatCurrency(order?.totalAmount || 0)}</div>`
            : `<div style="font-size: 10px; font-weight: 800;">PREPAID ORDER - DO NOT COLLECT CASH</div><div class="amt">PAID ₹0.00 DUE</div>`
          }
        </div>

        <div class="footer-note">
          Krishi Vishal Central Hub | Helpline: 1800-890-AGRICONNECT
        </div>
      </div>
    </div>
  `;
};

const getThermalLabelStyles = () => `
  @page {
    size: 4in 6in;
    margin: 0;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
  }
  .thermal-card-wrapper {
    page-break-after: always;
    break-after: page;
    width: 4in;
    height: 6in;
    padding: 8px;
    box-sizing: border-box;
  }
  .thermal-card-wrapper:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  .thermal-card {
    border: 2px solid #000;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 6px;
  }
  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #000;
    padding-bottom: 4px;
  }
  .brand-title {
    font-size: 16px;
    font-weight: 900;
    letter-spacing: -0.5px;
  }
  .hub-badge {
    background: #000;
    color: #fff;
    font-size: 11px;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 2px;
  }
  .tracking-section {
    text-align: center;
    padding: 4px 0;
    border-bottom: 1.5px dashed #000;
  }
  .tracking-barcode {
    max-width: 95%;
    height: 48px;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    border-bottom: 2px solid #000;
    text-align: center;
    font-size: 10px;
    padding: 3px 0;
    background: #f0f0f0;
  }
  .meta-cell {
    border-right: 1px solid #000;
    padding: 2px;
  }
  .meta-cell:last-child {
    border-right: none;
  }
  .meta-cell strong {
    display: block;
    font-size: 12px;
  }
  .address-qr-grid {
    display: grid;
    grid-template-columns: 1fr 90px;
    gap: 6px;
    padding: 6px 0;
    border-bottom: 2px solid #000;
  }
  .ship-title {
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    color: #333;
  }
  .customer-name {
    font-size: 14px;
    font-weight: 900;
    text-transform: uppercase;
    margin: 1px 0;
  }
  .address-lines {
    font-size: 11px;
    font-weight: 600;
    line-height: 1.25;
  }
  .phone-line {
    font-size: 12px;
    font-weight: 900;
    margin-top: 3px;
  }
  .qr-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .qr-box img {
    width: 80px;
    height: 80px;
    border: 1px solid #000;
  }
  .hazard-row {
    display: flex;
    gap: 4px;
    padding: 3px 0;
    border-bottom: 1px solid #000;
    font-size: 9px;
    font-weight: 800;
  }
  .hazard-tag {
    border: 1px solid #000;
    padding: 1px 4px;
    border-radius: 2px;
    background: #000;
    color: #fff;
  }
  .items-box {
    font-size: 10px;
    padding: 3px 0;
    border-bottom: 1.5px dashed #000;
    flex-grow: 1;
  }
  .items-box ul {
    margin: 2px 0 0 0;
    padding-left: 14px;
    line-height: 1.3;
  }
  .seal-row {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    font-weight: 700;
    padding: 3px 0;
    border-bottom: 2px solid #000;
    background: #fafafa;
  }
  .payment-banner {
    padding: 4px;
    text-align: center;
    border: 2px solid #000;
    margin: 3px 0;
  }
  .payment-cod {
    background: #000;
    color: #fff;
  }
  .payment-prepaid {
    background: #eee;
    color: #000;
  }
  .payment-banner .amt {
    font-size: 16px;
    font-weight: 900;
  }
  .footer-note {
    font-size: 8px;
    text-align: center;
    font-weight: 700;
    text-transform: uppercase;
    color: #444;
  }
`;

export const printThermalShippingLabel = async (order, parcelInfo = {}) => {
  const labelBody = await generateThermalLabelHtml(order, parcelInfo);
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Thermal 4x6 Label - #${order?.id?.slice(-8) || 'PRINT'}</title>
        <style>${getThermalLabelStyles()}</style>
      </head>
      <body>
        ${labelBody}
      </body>
    </html>
  `;
  printHtmlContent(htmlContent);
};

export const printBulkThermalShippingLabels = async (orders = []) => {
  if (!orders || orders.length === 0) return;
  const labelBodies = [];
  for (const order of orders) {
    const body = await generateThermalLabelHtml(order);
    labelBodies.push(body);
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Bulk Thermal 4x6 Labels (${orders.length} Orders)</title>
        <style>${getThermalLabelStyles()}</style>
      </head>
      <body>
        ${labelBodies.join('')}
      </body>
    </html>
  `;
  printHtmlContent(htmlContent);
};

export const printShippingLabel = async (order) => {
  return printThermalShippingLabel(order, { parcelIndex: 1, totalParcels: 1 });
};

export const generateInvoiceHtml = (order) => {
  const itemsHtml = order?.items?.map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        ${sanitize(item?.productName || '')}
      </td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${sanitize(item?.variantLabel || '-')}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${sanitize(item?.hsnCode || 'N/A')}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item?.quantity || 1}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item?.price || 0)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency((item?.price || 0) * (item?.quantity || 1))}</td>
    </tr>
  `).join('') || '';

  return `
    <div class="invoice-page-wrapper" style="page-break-after: always; break-after: page; padding: 30px; box-sizing: border-box;">
      <div class="header">
        <div class="company-info">
          <h1>KRISHI VISHAL</h1>
          <p>Bihar's Trusted Agri-Store<br/>GSTIN: 10AAAAA0000A1Z5</p>
        </div>
        <div class="invoice-meta">
          <h2>TAX INVOICE</h2>
          <p><strong>Invoice No:</strong> ${order?.invoiceNumber || order?.invoice?.invoiceNumber || (order?.id ? `SAM-${String(new Date().getFullYear()).slice(-2)}-${order.id.slice(-9).padStart(9, '0').toUpperCase()}` : 'PROVISIONAL')}<br/>
          <strong>Order ID:</strong> #${order?.id?.slice?.(-8)?.toUpperCase() || 'UNKNOWN'}<br/>
          <strong>Date:</strong> ${formatDateTime(order?.createdAt)}</p>
        </div>
      </div>

      <div class="billing-info">
        <div>
          <h4 style="margin-bottom: 5px; color: #666;">BILLED TO:</h4>
          <p><strong>${sanitize(order?.userName || order?.address?.name || 'Customer')}</strong><br/>
          ${order?.address && typeof order?.address === 'string' ? sanitize(order?.address) : [sanitize(order?.address?.village), sanitize(order?.address?.district)].filter(Boolean).join(', ')}<br/>
          ${order?.address?.state ? sanitize(order?.address.state) + (order?.address?.pincode ? ' - ' + sanitize(order?.address.pincode) : '') : ''}<br/>
          Phone: ${sanitize(order?.userPhone || order?.address?.phone || '')}</p>
        </div>
        <div style="text-align: right;">
          <h4 style="margin-bottom: 5px; color: #666;">PAYMENT:</h4>
          <p><strong>Method:</strong> ${sanitize(order?.paymentMethod || 'COD')}<br/>
          <strong>Status:</strong> ${sanitize(order?.paymentStatus || 'Pending')}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 35%;">Item Description</th>
            <th style="text-align: center;">Size/Variant</th>
            <th style="text-align: center;">HSN Code</th>
            <th style="text-align: center;">Qty</th>
            <th style="text-align: right;">Price</th>
            <th style="text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="totals">
        <p>Subtotal (MRP): ${formatCurrency(order?.subtotal || order?.totalAmount || 0)}</p>
        ${order?.totalDiscount > 0 ? `<p style="color: #1b5e20;">Discount: -${formatCurrency(order.totalDiscount)}</p>` : ''}
        <p>Taxable Value: ${formatCurrency(order?.taxableTotal || order?.totalAmount || 0)}</p>
        <p>GST (Bihar): +${formatCurrency(order?.totalTax || 0)}</p>
        <p>Delivery Charges: ${order?.deliveryCharges > 0 ? formatCurrency(order.deliveryCharges) : '<span style="color: #1b5e20;">FREE</span>'}</p>
        ${order?.platformFee > 0 ? `<p style="font-size: 11px; color: #999;">Platform Fee: ${formatCurrency(order.platformFee)}</p>` : ''}
        <div class="total-row">Grand Total: ${formatCurrency(order?.totalAmount || 0)}</div>
      </div>

      <div class="footer">
        <p>This is a computer generated invoice and does not require a signature.</p>
        <p>Thank you for shopping with Krishi Vishal!</p>
      </div>
    </div>
  `;
};

const getInvoiceStyles = () => `
  @page {
    size: A4;
    margin: 10mm;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: 'Segoe UI', sans-serif;
    padding: 0;
    margin: 0;
    color: #333;
  }
  .invoice-page-wrapper {
    page-break-after: always;
    break-after: page;
    padding: 20px;
    box-sizing: border-box;
  }
  .invoice-page-wrapper:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  .header { display: flex; justify-content: space-between; border-bottom: 3px solid #1b5e20; padding-bottom: 20px; }
  .company-info h1 { margin: 0; color: #1b5e20; font-size: 28px; }
  .invoice-meta { text-align: right; }
  .billing-info { display: flex; justify-content: space-between; margin-top: 25px; }
  table { width: 100%; border-collapse: collapse; margin-top: 25px; }
  th { background: #f9f9f9; padding: 12px; text-align: left; border-bottom: 2px solid #eee; font-size: 13px; text-transform: uppercase; }
  .totals { margin-top: 25px; text-align: right; }
  .total-row { font-size: 20px; font-weight: bold; color: #1b5e20; }
  .footer { margin-top: 60px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
`;

export const printInvoice = (order) => {
  const invoiceBody = generateInvoiceHtml(order);
  const htmlContent = `
    <html>
      <head>
        <title>Invoice - ${order?.id || 'Unknown'}</title>
        <style>${getInvoiceStyles()}</style>
      </head>
      <body>
        ${invoiceBody}
      </body>
    </html>
  `;
  printHtmlContent(htmlContent);
};

export const printBulkInvoices = (orders = []) => {
  if (!orders || orders.length === 0) return;
  const invoiceBodies = orders.map(order => generateInvoiceHtml(order)).join('');
  const htmlContent = `
    <html>
      <head>
        <title>Bulk Invoices (${orders.length} Orders)</title>
        <style>${getInvoiceStyles()}</style>
      </head>
      <body>
        ${invoiceBodies}
      </body>
    </html>
  `;
  printHtmlContent(htmlContent);
};

export const printB2BEInvoice = async (order) => {
  const irn = order?.irn || `IRN-${Math.random().toString(36).substring(2, 15).toUpperCase()}${Date.now().toString(36).toUpperCase()}`;
  const ackNo = order?.ackNo || `ACK${Date.now().toString().slice(-10)}`;
  const ackDate = order?.ackDate || new Date().toLocaleDateString('en-IN');
  const buyerGstin = order?.buyerGstin || order?.customerGstin || '10AABCK1234F1Z0';
  const buyerName = order?.buyerName || order?.customerName || 'Bihar Farmers Producer Company Ltd.';

  let qrCodeDataUrl = '';
  try {
    const qrPayload = JSON.stringify({
      SellerGstin: '10AAACK9821M1Z5',
      BuyerGstin: buyerGstin,
      DocNo: order?.orderNumber || order?.id?.slice(-8),
      DocTyp: 'INV',
      TotInvVal: order?.totalAmount || 0,
      ItemCnt: order?.items?.length || 1,
      MainHsnCode: '3105',
      Irn: irn
    });
    qrCodeDataUrl = await QRCode.toDataURL(qrPayload);
  } catch (err) {
    console.error('Failed to generate GST QR code', err);
  }

  const itemsRows = (order?.items || []).map((item, idx) => {
    const qty = Number(item?.quantity) || 1;
    const price = Number(item?.price) || 0;
    const total = qty * price;
    const hsn = item?.hsnCode || '3105';
    const gstRate = item?.taxRate || 18;
    const taxable = Math.round(total / (1 + (gstRate / 100)));
    const gstAmt = total - taxable;
    const cgst = Math.round(gstAmt / 2);
    const sgst = gstAmt - cgst;

    return `
      <tr>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${idx + 1}</td>
        <td style="padding: 6px; border: 1px solid #ddd;"><strong>${sanitize(item?.productName || '')}</strong></td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: center; font-family: monospace;">${hsn}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${qty}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatCurrency(price)}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatCurrency(taxable)}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatCurrency(cgst)} (${gstRate / 2}%)</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatCurrency(sgst)} (${gstRate / 2}%)</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: right; font-weight: bold;">${formatCurrency(total)}</td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
    <html>
      <head>
        <title>B2B E-Invoice - ${order?.id || 'Doc'}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 25px; color: #111; font-size: 11px; }
          .einvoice-border { border: 2px solid #000; padding: 15px; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; }
          .company-title { font-size: 20px; font-weight: 900; color: #0B4D31; }
          .irn-box { background: #f5f5f5; border: 1px dashed #666; padding: 8px; margin: 10px 0; font-family: monospace; font-size: 10px; word-break: break-all; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 10px; }
          th { background: #e8f5e9; border: 1px solid #000; padding: 6px; text-align: left; }
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 10px; }
          .party-card { border: 1px solid #ccc; padding: 10px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="einvoice-border">
          <div class="header">
            <div>
              <div class="company-title">KRISHI VISHAL PRIVATE LIMITED</div>
              <div>Corporate Agri Logistics & Supply Chain Network</div>
              <div>Samastipur Central Hub, Station Road, Samastipur, Bihar - 848101</div>
              <div><strong>GSTIN:</strong> 10AAACK9821M1Z5 | State: 10 (Bihar)</div>
            </div>
            <div style="text-align: right;">
              <h2 style="margin: 0; color: #0B4D31;">GST TAX E-INVOICE</h2>
              <div><strong>Invoice No:</strong> ${order?.orderNumber || `INV-${order?.id?.slice(-8)?.toUpperCase()}`}</div>
              <div><strong>Date:</strong> ${ackDate}</div>
              <img src="${qrCodeDataUrl}" style="width: 85px; height: 85px; margin-top: 5px; border: 1px solid #ccc;" alt="GST QR" />
            </div>
          </div>

          <div class="irn-box">
            <div><strong>IRN:</strong> ${irn}</div>
            <div><strong>Ack No:</strong> ${ackNo} | <strong>Ack Date:</strong> ${ackDate}</div>
          </div>

          <div class="grid-2">
            <div class="party-card">
              <strong>DETAILS OF BUYER / BILLED TO:</strong><br/>
              <strong>Name:</strong> ${sanitize(buyerName)}<br/>
              <strong>GSTIN:</strong> ${sanitize(buyerGstin)}<br/>
              <strong>Address:</strong> ${sanitize(order?.shippingAddress?.address || order?.address?.village || 'Purnea, Bihar')}<br/>
              <strong>State Code:</strong> 10 (Bihar) | <strong>Phone:</strong> ${sanitize(order?.userPhone || order?.phone || 'N/A')}
            </div>
            <div class="party-card">
              <strong>DISPATCH & PAYMENT DETAILS:</strong><br/>
              <strong>Dispatch From Hub:</strong> Samastipur Central Hub<br/>
              <strong>Transport Mode:</strong> Road Fleet<br/>
              <strong>Payment Terms:</strong> ${sanitize(order?.paymentMethod || 'Prepaid')}<br/>
              <strong>Place of Supply:</strong> Bihar (10)
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product Description</th>
                <th style="text-align: center;">HSN</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Rate (₹)</th>
                <th style="text-align: right;">Taxable (₹)</th>
                <th style="text-align: right;">CGST</th>
                <th style="text-align: right;">SGST</th>
                <th style="text-align: right;">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div style="margin-top: 15px; display: flex; justify-content: space-between; align-items: flex-end;">
            <div style="font-size: 10px; color: #555;">
              <strong>Declaration:</strong> We declare that this invoice shows the actual price of goods<br/>
              described and that all particulars are true and correct.
            </div>
            <div style="text-align: right;">
              <div style="font-size: 16px; font-weight: 900; color: #0B4D31;">
                Invoice Total: ${formatCurrency(order?.totalAmount || 0)}
              </div>
              <div style="margin-top: 30px; font-weight: bold; border-top: 1px solid #333; padding-top: 5px;">
                Authorized Signatory (Krishi Vishal Pvt Ltd)
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  printHtmlContent(htmlContent);
};

/**
 * Consolidated Warehouse Pick-List (सामूहिक सामान निकालने की पर्ची)
 * Groups all products across N selected orders by SKU, calculates total units needed,
 * lists matching Order IDs for each item, and generates an organized fulfillment checklist.
 */
export const printConsolidatedPickList = (orders = [], meta = {}) => {
  if (!orders || orders.length === 0) return;

  const summaryMap = new Map();
  let totalOrderUnits = 0;

  orders.forEach(order => {
    const orderShortId = `#${order.id?.slice(-6)?.toUpperCase() || 'ORD'}`;
    const items = order.items || [];
    items.forEach(item => {
      const key = `${item.productId || item.skuCode || item.productName || 'UNKNOWN'}_${item.variantLabel || 'default'}`;
      const qty = Number(item.quantity) || 1;
      totalOrderUnits += qty;

      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          productId: item.productId || item.skuCode || '-',
          productName: item.productName || 'Unknown Product',
          variantLabel: item.variantLabel || '-',
          category: item.category || 'General',
          hsnCode: item.hsnCode || 'N/A',
          fulfillmentType: item.fulfillmentType || order.fulfillmentType || 'SELF_STOCK',
          totalQuantity: 0,
          ordersList: []
        });
      }

      const entry = summaryMap.get(key);
      entry.totalQuantity += qty;
      entry.ordersList.push(`${orderShortId} (${qty})`);
    });
  });

  const sortedItems = Array.from(summaryMap.values()).sort((a, b) => {
    // Group Self-Stock first, then by Category, then by Name
    if (a.fulfillmentType !== b.fulfillmentType) {
      return a.fulfillmentType === 'SELF_STOCK' ? -1 : 1;
    }
    return a.productName.localeCompare(b.productName);
  });

  const hubName = meta.hubName || meta.warehouseName || orders[0]?.warehouseName || orders[0]?.fulfillmentWarehouseId || 'Central Hub Bihar';
  const printDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

  const rowsHtml = sortedItems.map((item, idx) => `
    <tr style="${idx % 2 === 1 ? 'background-color: #fcfcfc;' : ''}">
      <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center; font-weight: bold; color: #6b7280;">
        ${idx + 1}
      </td>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">
        <span style="display: inline-block; padding: 2px 6px; font-size: 9px; font-weight: 800; border-radius: 4px; ${item.fulfillmentType === 'SELF_STOCK' ? 'background: #dcfce7; color: #166534;' : 'background: #fef3c7; color: #92400e;'}">
          ${item.fulfillmentType}
        </span>
      </td>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb;">
        <div style="font-weight: 800; font-size: 13px; color: #111827;">${sanitize(item.productName)}</div>
        <div style="font-size: 10px; color: #6b7280; font-mono: monospace;">SKU: ${sanitize(item.productId)} | Cat: ${sanitize(item.category)}</div>
      </td>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center; font-weight: 700; color: #374151;">
        ${sanitize(item.variantLabel)}
      </td>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">
        <span style="font-size: 16px; font-weight: 900; color: #047857; background: #ecfdf5; padding: 4px 10px; border-radius: 8px; border: 1.5px solid #a7f3d0;">
          ${item.totalQuantity}
        </span>
      </td>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 10px; color: #4b5563; max-width: 250px;">
        ${item.ordersList.slice(0, 10).join(', ')}${item.ordersList.length > 10 ? ` +${item.ordersList.length - 10} more` : ''}
      </td>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">
        <div style="width: 18px; height: 18px; border: 2px solid #9ca3af; border-radius: 4px; margin: 0 auto;"></div>
      </td>
    </tr>
  `).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Warehouse Consolidated Pick-List (${orders.length} Orders)</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; color: #111; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #047857; padding-bottom: 14px; margin-bottom: 16px; }
          .title { font-size: 22px; font-weight: 900; color: #047857; letter-spacing: -0.5px; }
          .sub { font-size: 11px; color: #4b5563; margin-top: 2px; }
          .meta-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
          .meta-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px 12px; text-align: center; }
          .meta-val { font-size: 18px; font-weight: 900; color: #111827; }
          .meta-lbl { font-size: 9px; font-weight: 800; color: #6b7280; text-transform: uppercase; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background: #f3f4f6; padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #374151; border-bottom: 2px solid #d1d5db; }
          .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 10px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">KRISHI VISHAL - WAREHOUSE PICK-LIST</div>
            <div class="sub">सामूहिक सामान निकालने की पर्ची | Batch Dispatch Manifest</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 900; font-size: 12px; color: #047857;">${sanitize(hubName)}</div>
            <div class="sub">Printed: ${printDate}</div>
          </div>
        </div>

        <div class="meta-cards">
          <div class="meta-card">
            <div class="meta-val">${orders.length}</div>
            <div class="meta-lbl">Total Orders</div>
          </div>
          <div class="meta-card">
            <div class="meta-val">${summaryMap.size}</div>
            <div class="meta-lbl">Unique SKUs</div>
          </div>
          <div class="meta-card">
            <div class="meta-val">${totalOrderUnits}</div>
            <div class="meta-lbl">Total Units to Pick</div>
          </div>
          <div class="meta-card">
            <div class="meta-val" style="color: #047857;">READY</div>
            <div class="meta-lbl">Packing Status</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">#</th>
              <th style="width: 85px;">Type</th>
              <th>Product Details / SKU</th>
              <th style="width: 80px; text-align: center;">Variant</th>
              <th style="width: 75px; text-align: center;">Pick Qty</th>
              <th>Order ID References</th>
              <th style="width: 45px; text-align: center;">Done</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <div>Picker Signature: ______________________</div>
          <div>Checker / Supervisor: ______________________</div>
          <div>Generated by KrishiVishal WMS ERP</div>
        </div>
      </body>
    </html>
  `;

  printHtmlContent(htmlContent);
};


