const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { randomUUID } = require('crypto');
const { admin, db, storage } = require('../core/admin');

/**
 * Formats timestamps safely across Firestore Timestamps, Strings, and Numbers
 */
function formatDate(timestamp) {
    if (!timestamp) return new Date().toLocaleDateString('en-IN');
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().toLocaleDateString('en-IN');
    if (timestamp._seconds) return new Date(timestamp._seconds * 1000).toLocaleDateString('en-IN');
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? new Date().toLocaleDateString('en-IN') : d.toLocaleDateString('en-IN');
}

/**
 * Formats currency values cleanly
 */
function formatCurrency(amt) {
    return 'Rs. ' + Number(amt || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Generates an in-memory PDF buffer using PDFKit with standard styling.
 */
function buildInvoicePdfBuffer({ hub, orderMeta, buyer, items, financials, clearTax, qrBuffer }) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 36 });
            const buffers = [];

            doc.on('data', (chunk) => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', (err) => reject(err));

            const contentWidth = 523; // 595 - 2 * 36
            const leftMargin = 36;

            // 1. Header: Brand and Hub info
            doc.fontSize(18).font('Helvetica-Bold').fillColor('#1b5e20').text(hub.brand, leftMargin, 36);
            doc.fontSize(9).font('Helvetica').fillColor('#333333');
            doc.text(hub.subtitle);
            doc.text(`${hub.name} (${hub.code})`);
            doc.text(hub.address);
            doc.text(`GSTIN: ${hub.gstin} | State Code: ${hub.stateCode}`);
            if (hub.seedLicenseNo || hub.pesticideLicenseNo || hub.fertilizerRegNo) {
                doc.fontSize(7.5).fillColor('#444444');
                doc.text(`Lic: Seed: ${hub.seedLicenseNo || 'BR-SAM-SED-2024-098'} | Pest: ${hub.pesticideLicenseNo || 'BR-SAM-PEST-2024-441'} | Fert: ${hub.fertilizerRegNo || 'BR-SAM-FERT-2024-112'}`);
            }
            doc.fontSize(8.5).fillColor('#333333').text(`Helpline: ${hub.helpline}`);

            // Document Meta in Header (Top Right)
            const metaX = 350;
            doc.fontSize(16).font('Helvetica-Bold').fillColor('#1b5e20').text('TAX INVOICE', metaX, 36, { align: 'right', width: 209 });
            doc.fontSize(9).font('Helvetica').fillColor('#333333');
            doc.text(`Invoice No: ${orderMeta.invoiceNumber}`, metaX, doc.y, { align: 'right', width: 209 });
            doc.text(`Order ID: #${orderMeta.orderId}`, metaX, doc.y, { align: 'right', width: 209 });
            doc.text(`Date: ${orderMeta.dateStr}`, metaX, doc.y, { align: 'right', width: 209 });
            doc.text(`Payment: ${orderMeta.paymentMethod} (${orderMeta.paymentStatus})`, metaX, doc.y, { align: 'right', width: 209 });

            doc.y = 125;
            doc.strokeColor('#1b5e20').lineWidth(2).moveTo(leftMargin, doc.y).lineTo(leftMargin + contentWidth, doc.y).stroke();
            doc.y += 10;

            // 2. ClearTax E-Invoice Details & QR Code (if present)
            if (clearTax && (clearTax.irn || qrBuffer)) {
                const boxTop = doc.y;
                const hasQr = Boolean(qrBuffer);
                const textWidth = hasQr ? contentWidth - 85 : contentWidth - 16;

                doc.roundedRect(leftMargin, boxTop, contentWidth, 54, 3).fillAndStroke('#f9f9f9', '#cccccc');
                doc.fillColor('#111111').fontSize(8).font('Helvetica-Bold');
                doc.text('GST E-INVOICE / IRN VERIFICATION', leftMargin + 8, boxTop + 6);
                
                doc.font('Helvetica').fontSize(7.5).fillColor('#333333');
                doc.text(`IRN: ${clearTax.irn || 'N/A'}`, leftMargin + 8, boxTop + 18, { width: textWidth });
                doc.text(`Ack No: ${clearTax.ackNo || 'N/A'}  |  Ack Date: ${clearTax.ackDate || 'N/A'}`, leftMargin + 8, boxTop + 34, { width: textWidth });

                if (hasQr) {
                    doc.image(qrBuffer, leftMargin + contentWidth - 52, boxTop + 3, { width: 48, height: 48 });
                }

                doc.y = boxTop + 62;
            }

            // 3. Buyer Details
            const buyerY = doc.y;
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#555555').text('BILLED & DELIVERED TO:', leftMargin, buyerY);
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#111111').text(buyer.name, leftMargin, buyerY + 12);
            doc.font('Helvetica').fontSize(8.5).fillColor('#444444');
            doc.text(`Address: ${buyer.address}`, leftMargin, buyerY + 24, { width: 320 });
            doc.text(`Phone: ${buyer.phone} | State: Bihar (10)`, leftMargin, doc.y + 2);

            doc.y = Math.max(doc.y + 12, buyerY + 54);

            // 4. Itemized Table
            const tableTop = doc.y;
            const colX = {
                idx: leftMargin,
                desc: leftMargin + 25,
                variant: leftMargin + 215,
                hsn: leftMargin + 295,
                qty: leftMargin + 350,
                price: leftMargin + 395,
                total: leftMargin + 455
            };

            // Table Header Background
            doc.rect(leftMargin, tableTop, contentWidth, 20).fill('#e8f5e9');
            doc.fillColor('#1b5e20').font('Helvetica-Bold').fontSize(8.5);
            doc.text('#', colX.idx + 4, tableTop + 5);
            doc.text('Item Description', colX.desc, tableTop + 5);
            doc.text('Variant', colX.variant, tableTop + 5);
            doc.text('HSN', colX.hsn, tableTop + 5);
            doc.text('Qty', colX.qty, tableTop + 5, { width: 35, align: 'center' });
            doc.text('Rate', colX.price, tableTop + 5, { width: 55, align: 'right' });
            doc.text('Total', colX.total, tableTop + 5, { width: 60, align: 'right' });

            doc.strokeColor('#cccccc').lineWidth(0.5);
            doc.moveTo(leftMargin, tableTop + 20).lineTo(leftMargin + contentWidth, tableTop + 20).stroke();

            let currentY = tableTop + 24;
            items.forEach((item, idx) => {
                // Page overflow safeguard
                if (currentY > 700) {
                    doc.addPage();
                    currentY = 40;
                }

                doc.fillColor('#222222').font('Helvetica').fontSize(8);
                doc.text(String(idx + 1), colX.idx + 4, currentY);
                doc.font('Helvetica-Bold').text(item.productName, colX.desc, currentY, { width: 185, lineBreak: false });
                
                // Statutory Batch & Expiry Display
                const batchStr = item.batchNumber || item.batch || 'N/A';
                const expStr = item.expiryDate || 'N/A';
                if (batchStr !== 'N/A' || expStr !== 'N/A') {
                    doc.fontSize(6.5).font('Helvetica').fillColor('#666666').text(`Batch: ${batchStr} | Exp: ${expStr}`, colX.desc, currentY + 10, { width: 185, lineBreak: false });
                }

                doc.fontSize(8).font('Helvetica').fillColor('#222222');
                doc.text(item.variantLabel || '-', colX.variant, currentY, { width: 75, lineBreak: false });
                doc.text(item.hsnCode || '3101', colX.hsn, currentY);
                doc.text(String(item.quantity), colX.qty, currentY, { width: 35, align: 'center' });
                doc.text(formatCurrency(item.price), colX.price, currentY, { width: 55, align: 'right' });
                doc.text(formatCurrency(item.lineTotal), colX.total, currentY, { width: 60, align: 'right' });

                currentY += 20;
                doc.strokeColor('#eeeeee').lineWidth(0.5).moveTo(leftMargin, currentY - 2).lineTo(leftMargin + contentWidth, currentY - 2).stroke();
            });

            // 5. Financial Summary / Totals Box
            currentY += 10;
            if (currentY > 680) {
                doc.addPage();
                currentY = 40;
            }

            const totalsLeft = leftMargin + 270;
            const totalsWidth = contentWidth - 270;
            const labelWidth = 140;
            const valWidth = totalsWidth - labelWidth;

            doc.rect(totalsLeft, currentY, totalsWidth, 110).fillAndStroke('#fafafa', '#e0e0e0');

            let lineY = currentY + 8;
            const addSummaryLine = (label, val, bold = false, color = '#333333') => {
                doc.fontSize(8.5).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(color);
                doc.text(label, totalsLeft + 10, lineY, { width: labelWidth });
                doc.text(val, totalsLeft + labelWidth, lineY, { width: valWidth - 15, align: 'right' });
                lineY += 16;
            };

            addSummaryLine('Subtotal (MRP):', formatCurrency(financials.subtotal));
            if (financials.totalDiscount > 0) {
                addSummaryLine('Discount:', `-${formatCurrency(financials.totalDiscount)}`, false, '#1b5e20');
            }
            addSummaryLine('Taxable Value:', formatCurrency(financials.taxableTotal));
            addSummaryLine('GST (CGST + SGST):', `+${formatCurrency(financials.totalTax)}`);
            addSummaryLine('Delivery Charges:', financials.deliveryCharges > 0 ? formatCurrency(financials.deliveryCharges) : 'FREE');

            doc.strokeColor('#cccccc').lineWidth(0.5).moveTo(totalsLeft + 5, lineY - 2).lineTo(totalsLeft + totalsWidth - 5, lineY - 2).stroke();
            lineY += 4;
            addSummaryLine('Grand Total:', formatCurrency(financials.totalAmount), true, '#1b5e20');

            // 6. Footer
            doc.y = Math.max(currentY + 120, doc.y + 20);
            if (doc.y > 760) {
                doc.addPage();
                doc.y = 750;
            }

            doc.strokeColor('#dddddd').lineWidth(1).moveTo(leftMargin, doc.y).lineTo(leftMargin + contentWidth, doc.y).stroke();
            doc.y += 8;
            doc.fontSize(8).font('Helvetica').fillColor('#777777').text(
                'This is a computer generated invoice and does not require a physical signature.',
                leftMargin,
                doc.y,
                { align: 'center', width: contentWidth }
            );
            doc.text(
                'Krishi Vishal - Bihar Rural Agri Commerce Network | Samastipur Central Hub',
                leftMargin,
                doc.y + 3,
                { align: 'center', width: contentWidth }
            );

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Main lifecycle function: Generates PDF invoice for an order and uploads to Cloud Storage.
 *
 * @param {string} orderId
 * @param {object|null} clearTaxPayload
 * @returns {Promise<{ success: boolean, invoiceNumber: string, downloadUrl: string }>}
 */
async function generateAndUploadInvoice(orderId, clearTaxPayload = null) {
    if (!orderId) {
        throw new Error('Missing orderId for invoice generation.');
    }

    // 1. Fetch order data from Firestore
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
        throw new Error(`Order not found: ${orderId}`);
    }
    const order = orderSnap.data() || {};

    // 2. Hub Details
    const hub = {
        brand: 'KRISHI VISHAL',
        subtitle: 'Bihar Fast Rural Agri Logistics & Dispatch',
        name: order.hub?.name || 'Samastipur Central Hub',
        code: order.hubCode || order.hub?.code || 'HUB-SAM-001',
        address: order.hub?.address || 'Station Road, Near Block Chowk, Samastipur, Bihar - 848101',
        gstin: order.hub?.gstin || process.env.STORE_GSTIN || '10AAACK9821M1Z5',
        stateCode: order.hub?.stateCode || '10 (Bihar)',
        helpline: order.hub?.helpline || '1800-890-AGRICONNECT',
        seedLicenseNo: order.hub?.seedLicenseNo || 'BR-SAM-SED-2024-098',
        pesticideLicenseNo: order.hub?.pesticideLicenseNo || 'BR-SAM-PEST-2024-441',
        fertilizerRegNo: order.hub?.fertilizerRegNo || 'BR-SAM-FERT-2024-112'
    };

    // 3. Order Metadata
    const year = new Date().getFullYear();
    const fallbackInvoiceNumber = `KV/SAM/${year}/${orderId.slice(-8).toUpperCase()}`;
    const invoiceNumber = order.invoiceNumber || order.invoice?.invoiceNumber || fallbackInvoiceNumber;
    const cleanInvoiceNumber = String(invoiceNumber).replace(/[^a-zA-Z0-9_-]/g, '_');
    const orderMeta = {
        invoiceNumber,
        orderId,
        dateStr: formatDate(order.createdAt),
        paymentMethod: (order.paymentMethod || 'COD').toUpperCase(),
        paymentStatus: order.paymentStatus || (order.isPaid ? 'PAID' : 'Pending')
    };

    // 4. Buyer Details
    const buyerName = order.userName || order.customerName || order.address?.name || 'Kisan Customer';
    const buyerPhone = order.userPhone || order.phone || order.address?.phone || 'N/A';
    let buyerAddress = '';
    if (typeof order.address === 'string') {
        buyerAddress = order.address;
    } else if (order.address && typeof order.address === 'object') {
        buyerAddress = [
            order.address.village || order.shippingAddress?.village,
            order.address.district || order.shippingAddress?.district,
            order.address.state || order.shippingAddress?.state || 'Bihar',
            order.address.pincode || order.shippingAddress?.pincode
        ].filter(Boolean).join(', ');
    } else if (order.shippingAddress && typeof order.shippingAddress === 'object') {
        buyerAddress = [
            order.shippingAddress.address,
            order.shippingAddress.village,
            order.shippingAddress.district,
            order.shippingAddress.state || 'Bihar',
            order.shippingAddress.pincode
        ].filter(Boolean).join(', ');
    }
    if (!buyerAddress) buyerAddress = 'Samastipur, Bihar - 848101';

    const buyer = {
        name: buyerName,
        phone: buyerPhone,
        address: buyerAddress
    };

    // 5. Items Extraction
    const rawItems = Array.isArray(order.items) && order.items.length > 0 ? order.items : [];
    const items = rawItems.map((item) => {
        const qty = Number(item.quantity) || 1;
        const price = Number(item.price) || 0;
        return {
            productName: item.productName || item.name || 'Agri Product',
            variantLabel: item.variantLabel || item.variant || '-',
            hsnCode: item.hsnCode || item.hsn || '3101',
            quantity: qty,
            price: price,
            lineTotal: qty * price,
            batchNumber: item.batchNumber || item.batch || 'N/A',
            expiryDate: item.expiryDate ? formatDate(item.expiryDate) : 'N/A'
        };
    });

    // 6. Tax & Financials
    const subtotal = Number(order.subtotal) || Number(order.totalAmount) || items.reduce((sum, i) => sum + i.lineTotal, 0);
    const totalDiscount = Number(order.totalDiscount) || Number(order.discount) || 0;
    const taxableTotal = Number(order.taxableTotal) || Math.max(0, subtotal - totalDiscount);
    const totalTax = Number(order.totalTax) || Number(order.tax) || 0;
    const deliveryCharges = Number(order.deliveryCharges) || 0;
    const totalAmount = Number(order.totalAmount) || (taxableTotal + totalTax + deliveryCharges);

    const financials = {
        subtotal,
        totalDiscount,
        taxableTotal,
        totalTax,
        deliveryCharges,
        totalAmount
    };

    // 7. ClearTax Details & QR Code
    let clearTaxInfo = null;
    let qrBuffer = null;

    if (clearTaxPayload) {
        const irn = clearTaxPayload.data?.irn || clearTaxPayload.providerReferenceId || clearTaxPayload.data?.Irn || '';
        const ackNo = clearTaxPayload.data?.AckNo || clearTaxPayload.data?.ackNo || '';
        const ackDate = clearTaxPayload.data?.AckDt || clearTaxPayload.data?.ackDate || clearTaxPayload.data?.ackDt || '';

        clearTaxInfo = { irn, ackNo, ackDate };

        const qrFallbackText = JSON.stringify({
            SellerGstin: hub.gstin,
            DocNo: invoiceNumber,
            DocTyp: 'INV',
            TotInvVal: totalAmount,
            Irn: irn || 'N/A'
        });

        const qrDataText = clearTaxPayload.data?.SignedQRCode || clearTaxPayload.data?.signedQrCode || qrFallbackText;
        try {
            qrBuffer = await QRCode.toBuffer(qrDataText, { width: 120, margin: 1 });
        } catch (qrErr) {
            console.warn('[invoiceService] QR Code generation fallback error:', qrErr);
        }
    }

    // 8. Render PDF Buffer
    const pdfBuffer = await buildInvoicePdfBuffer({
        hub,
        orderMeta,
        buyer,
        items,
        financials,
        clearTax: clearTaxInfo,
        qrBuffer
    });

    // 9. Upload buffer to Firebase Cloud Storage
    const storagePath = `invoices/${orderId}/INV_${cleanInvoiceNumber}.pdf`;
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);
    const downloadToken = randomUUID();

    await file.save(pdfBuffer, {
        contentType: 'application/pdf',
        metadata: {
            contentType: 'application/pdf',
            metadata: {
                firebaseStorageDownloadTokens: downloadToken
            }
        },
        resumable: false
    });

    const bucketName = bucket.name || process.env.STORAGE_BUCKET || 'krishivishal.appspot.com';
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    // 10. Update Firestore Document
    const irnVal = clearTaxPayload?.data?.irn || clearTaxPayload?.providerReferenceId || null;
    await orderRef.update({
        invoiceUrl: downloadUrl,
        invoice: {
            status: 'GENERATED',
            invoiceNumber: invoiceNumber,
            pdfUrl: downloadUrl,
            storagePath: storagePath,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            irn: irnVal
        }
    });

    console.log(`[invoiceService] Successfully generated and uploaded invoice for ${orderId}: ${downloadUrl}`);

    return {
        success: true,
        invoiceNumber,
        downloadUrl
    };
}

module.exports = {
    generateAndUploadInvoice,
    buildInvoicePdfBuffer
};
