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
export const printThermalShippingLabel = async (order, parcelInfo = {}) => {
  const parcelIndex = parcelInfo.parcelIndex || 1;
  const totalParcels = parcelInfo.totalParcels || order?.parcels?.length || 1;
  const parcelWeight = parcelInfo.weightKg || order?.totalWeightKg || '3.5';
  const sealNumber = parcelInfo.sealNumber || order?.sealNumber || `SEAL-${order?.id?.slice(-6)?.toUpperCase() || '8921'}`;
  const trackingNumber = parcelInfo.parcelId || `AWB-${order?.id?.slice(-8)?.toUpperCase() || '1001'}-${parcelIndex}`;
  const hubCode = order?.hubCode || order?.fulfillmentWarehouseId || order?.warehouseId || 'MAIN-HUB';
  let pincode = '';
  if (order?.address?.pincode) {
    pincode = order.address.pincode;
  } else if (order?.shippingAddress?.pincode) {
    pincode = order.shippingAddress.pincode;
  } else if (typeof order?.address === 'string') {
    const match = order.address.match(/\b\d{6}\b/);
    if (match) pincode = match[0];
  }
  const zoneCode = pincode ? `ZONE-${pincode.slice(-3)}` : 'ZONE-N/A';

  // Detect Agri Hazards (e.g. Liquid pesticides, Heavy bags)
  const items = parcelInfo.items || order?.items || [];
  const hasLiquid = items.some(i => (i?.productName || '').toLowerCase().includes('liquid') || (i?.productName || '').toLowerCase().includes('spray') || (i?.productName || '').toLowerCase().includes('ml') || (i?.productName || '').toLowerCase().includes('litre') || (i?.productName || '').toLowerCase().includes('liter'));
  const hasChemical = items.some(i => (i?.productName || '').toLowerCase().includes('pesticide') || (i?.productName || '').toLowerCase().includes('insecticide') || (i?.productName || '').toLowerCase().includes('herbicide') || (i?.category || '').toLowerCase().includes('chemical'));
  const isHeavy = Number(parcelWeight) >= 20 || items.some(i => (i?.productName || '').toLowerCase().includes('50kg') || (i?.productName || '').toLowerCase().includes('bag'));

  // Generate Code-128 Barcode & 2D QR
  const barcodeDataUrl = generateBarcodeDataUrl(trackingNumber, { height: 48, width: 2 });
  let qrCodeDataUrl = '';
  try {
    const qrPayload = parcelInfo.qrData || order?.qrPayload || JSON.stringify({
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

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Thermal 4x6 Label - ${trackingNumber}</title>
        <style>
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
            padding: 8px;
            width: 4in;
            height: 6in;
            background: #fff;
            color: #000;
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
            line-height: 1.25;
          }
          .seal-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
            font-weight: 700;
            padding: 3px 0;
            border-bottom: 2px solid #000;
          }
          .payment-banner {
            padding: 6px 4px;
            text-align: center;
            border: 2px solid #000;
            margin-top: 4px;
          }
          .payment-cod {
            background: #000;
            color: #fff;
          }
          .payment-cod .amt {
            font-size: 16px;
            font-weight: 900;
          }
          .payment-prepaid {
            background: #fff;
            color: #000;
          }
          .payment-prepaid .amt {
            font-size: 14px;
            font-weight: 900;
          }
          .footer-note {
            font-size: 8px;
            text-align: center;
            margin-top: 3px;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
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
              <strong>${pincode || 'N/A'}</strong>
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
              <div class="phone-line">M: ${sanitize(order?.userPhone || order?.address?.phone || 'N/A')}</div>
            </div>
            <div class="qr-box">
              <img src="${qrCodeDataUrl}" alt="2D QR" />
              <div style="font-size: 7px; font-weight: 800; margin-top: 2px;">SCAN TO VERIFY</div>
            </div>
          </div>

          <!-- Agri Hazard Badges (If Any) -->
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
      </body>
    </html>
  `;

  printHtmlContent(htmlContent);
};

export const printShippingLabel = async (order) => {
  return printThermalShippingLabel(order, { parcelIndex: 1, totalParcels: 1 });
};

export const printInvoice = (order) => {
  const itemsHtml = order?.items?.map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        ${sanitize(item?.productName || '')}
      </td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${sanitize(item?.variantLabel || '-')}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${sanitize(item?.hsnCode || 'N/A')}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item?.gstRate || 0}%</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item?.quantity || 1}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item?.price || 0)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency((item?.price || 0) * (item?.quantity || 1))}</td>
    </tr>
  `).join('') || '';

  const htmlContent = `
    <html>
      <head>
        <title>Invoice - ${order?.id || 'Unknown'}</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #333; }
          .header { display: flex; justify-content: space-between; border-bottom: 3px solid #1b5e20; padding-bottom: 20px; }
          .company-info h1 { margin: 0; color: #1b5e20; font-size: 28px; }
          .invoice-meta { text-align: right; }
          .billing-info { display: flex; justify-content: space-between; margin-top: 30px; }
          table { width: 100%; border-collapse: collapse; margin-top: 30px; }
          th { background: #f9f9f9; padding: 12px; text-align: left; border-bottom: 2px solid #eee; font-size: 13px; text-transform: uppercase; }
          .totals-box { margin-top: 30px; float: right; width: 350px; background: #f8f9fa; padding: 20px; border-radius: 8px; }
          .total-row-item { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
          .grand-total-row { border-top: 2px solid #ddd; padding-top: 10px; margin-top: 10px; font-size: 18px; font-weight: bold; color: #1b5e20; }
          .footer { margin-top: 80px; text-align: center; font-size: 12px; color: #999; clear: both; border-top: 1px solid #eee; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info">
            <h1>KRISHI VISHAL</h1>
            <p>Bihar's Trusted Agri-Store<br/>GSTIN: 10AAAAA0000A1Z5</p>
          </div>
          <div class="invoice-meta">
            <h2>TAX INVOICE</h2>
            <p><strong>Order ID:</strong> #${order?.id?.slice?.(-8)?.toUpperCase() || 'UNKNOWN'}<br/>
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
              <th style="text-align: center;">GST %</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Price</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="totals-box">
          <div class="total-row-item">
            <span>Subtotal (MRP):</span>
            <span>${formatCurrency(order?.subtotal || order?.totalAmount || 0)}</span>
          </div>
          ${order?.totalDiscount > 0 ? `
          <div class="total-row-item" style="color: #1b5e20;">
            <span>Discount:</span>
            <span>-${formatCurrency(order.totalDiscount)}</span>
          </div>` : ''}
          <div class="total-row-item">
            <span>Delivery Charges:</span>
            <span>${order?.deliveryCharges > 0 ? formatCurrency(order.deliveryCharges) : '<span style="color: #1b5e20;">FREE</span>'}</span>
          </div>
          ${order?.platformFee > 0 ? `
          <div class="total-row-item" style="font-size: 11px; color: #999;">
            <span>Platform Fee:</span>
            <span>${formatCurrency(order.platformFee)}</span>
          </div>` : ''}
          <div class="total-row-item grand-total-row">
            <span>Grand Total:</span>
            <span>${formatCurrency(order?.totalAmount || 0)}</span>
          </div>
        </div>

        <div class="footer">
          <p>This is a computer generated invoice and does not require a signature.</p>
          <p>Thank you for shopping with Krishi Vishal!</p>
        </div>
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
    const gstRate = item?.gstRate || 18;
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
              <div>${sanitize(order?.warehouseAddress || 'Central Agro Depot, Bihar')}</div>
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
              <strong>Address:</strong> ${sanitize(order?.shippingAddress?.address || order?.address?.village || order?.address || '')}<br/>
              <strong>State Code:</strong> 10 (Bihar) | <strong>Phone:</strong> ${sanitize(order?.userPhone || order?.phone || 'N/A')}
            </div>
            <div class="party-card">
              <strong>DISPATCH & PAYMENT DETAILS:</strong><br/>
              <strong>Dispatch From Hub:</strong> ${sanitize(order?.warehouseName || order?.warehouseId || 'Central Hub')}<br/>
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

