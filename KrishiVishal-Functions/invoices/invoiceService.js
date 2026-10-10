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
 * Rounds numeric currency to 2 decimal places cleanly
 */
function roundCurrency(num) {
    return Math.round((Number(num || 0) + Number.EPSILON) * 100) / 100;
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
            const isProvisional = Boolean(orderMeta.isProvisional);
            const docTitle = orderMeta.documentTitle || (isProvisional ? 'PACKING SLIP / CHALLAN' : 'TAX INVOICE');
            const titleColor = isProvisional ? '#c62828' : '#1b5e20';

            doc.fontSize(15).font('Helvetica-Bold').fillColor(titleColor).text(docTitle, metaX, 36, { align: 'right', width: 209 });
            if (isProvisional) {
                doc.fontSize(7).font('Helvetica-Bold').fillColor('#c62828').text('PROVISIONAL - NOT A GST TAX INVOICE', metaX, doc.y, { align: 'right', width: 209 });
            }
            doc.fontSize(9).font('Helvetica').fillColor('#333333');
            const numLabel = isProvisional ? 'Challan No' : 'Invoice No';
            doc.text(`${numLabel}: ${orderMeta.invoiceNumber}`, metaX, doc.y + (isProvisional ? 2 : 0), { align: 'right', width: 209 });
            doc.text(`Order ID: #${orderMeta.orderId}`, metaX, doc.y, { align: 'right', width: 209 });
            doc.text(`Date: ${orderMeta.dateStr}`, metaX, doc.y, { align: 'right', width: 209 });
            doc.text(`Payment: ${orderMeta.paymentMethod} (${orderMeta.paymentStatus})`, metaX, doc.y, { align: 'right', width: 209 });

            doc.y = 125;
            doc.strokeColor(titleColor).lineWidth(2).moveTo(leftMargin, doc.y).lineTo(leftMargin + contentWidth, doc.y).stroke();
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
 * @param {object} [options] Optional configuration: { isProvisional, documentType }
 * @returns {Promise<{ success: boolean, invoiceNumber: string, downloadUrl: string }>}
 */
async function generateAndUploadInvoice(orderId, clearTaxPayload = null, options = {}) {
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
    const isProvisional = Boolean(options && (options.isProvisional || options.documentType === 'PACKING_SLIP' || options.documentType === 'PROVISIONAL'));

    // Idempotency: For official tax invoices, if valid official invoiceUrl already exists, reuse it without re-generating/re-uploading
    if (!isProvisional && !options.forceRegenerate && (order.invoiceUrl || order.invoice?.pdfUrl)) {
        const existingUrl = order.invoiceUrl || order.invoice?.pdfUrl;
        const existingInvoiceNum = order.invoiceNumber || order.invoice?.invoiceNumber;
        console.log(`[invoiceService] Order ${orderId} already possesses official invoice PDF: ${existingUrl}`);
        return {
            success: true,
            alreadyGenerated: true,
            invoiceNumber: existingInvoiceNum,
            downloadUrl: existingUrl
        };
    }

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

    // 3. Order Metadata & Sequential Invoice Number Allocation
    let invoiceNumber = order.invoiceNumber || (order.invoice && order.invoice.invoiceNumber);

    if (isProvisional) {
        // Packing Slip / Dispatch Challan: does NOT consume official Rule 46 sequential invoice sequence
        invoiceNumber = `CHALLAN/${orderId.slice(-8).toUpperCase()}`;
    } else {
        // Official Statutory Tax Invoice: Must have official sequential Rule 46 number
        if (!invoiceNumber || String(invoiceNumber).startsWith('KV/SAM/')) {
            try {
                const { getOrCreateInvoiceNumberForOrder } = require('./sequentialInvoiceEngine');
                const alloc = await getOrCreateInvoiceNumberForOrder(orderId);
                invoiceNumber = alloc.invoiceNumber;
            } catch (allocErr) {
                // Fallback for mock environments without counters
                const year = new Date().getFullYear();
                invoiceNumber = `KV/SAM/${year}/${orderId.slice(-8).toUpperCase()}`;
            }
        }
    }

    const cleanInvoiceNumber = String(invoiceNumber).replace(/[^a-zA-Z0-9_-]/g, '_');
    const orderMeta = {
        invoiceNumber,
        orderId,
        dateStr: formatDate(order.createdAt),
        paymentMethod: (order.paymentMethod || 'COD').toUpperCase(),
        paymentStatus: order.paymentStatus || (order.isPaid ? 'PAID' : 'Pending'),
        isProvisional,
        documentTitle: isProvisional ? 'PACKING SLIP / CHALLAN' : 'TAX INVOICE'
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
    const updatePayload = {
        invoiceUrl: downloadUrl,
        invoice: {
            status: isProvisional ? 'PROVISIONAL_GENERATED' : 'GENERATED',
            invoiceNumber: invoiceNumber,
            pdfUrl: downloadUrl,
            storagePath: storagePath,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            irn: irnVal,
            isProvisional
        }
    };
    if (!isProvisional) {
        // Explicitly set root-level invoiceNumber for canonical reference across GSTR-1, GL & UI
        updatePayload.invoiceNumber = invoiceNumber;
    }
    await orderRef.update(updatePayload);

    console.log(`[invoiceService] Successfully generated and uploaded invoice for ${orderId}: ${downloadUrl}`);

    return {
        success: true,
        invoiceNumber,
        downloadUrl
    };
}

/**
 * Builds an in-memory PDF buffer for a CGST Rule 53 compliant Credit Note.
 * Conforms strictly to Section 34 of the CGST Act, 2017 & Rule 53.
 *
 * @param {object} creditNoteData
 * @returns {Promise<Buffer>}
 */
function buildCreditNotePdfBuffer(creditNoteData) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 36 });
            const buffers = [];

            doc.on('data', (chunk) => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', (err) => reject(err));

            const contentWidth = 523; // 595 - 2 * 36
            const leftMargin = 36;

            const cn = creditNoteData || {};
            const cnNo = cn.creditNoteNo || cn.creditNoteNumber || 'KVCN/26-27/00000';
            const originalInvNo = cn.originalInvoiceNo || 'N/A';
            const returnReason = cn.returnReason || 'CUSTOMER_RETURN';
            const dateStr = formatDate(cn.issuedAt || cn.createdAt || new Date());
            const invDateStr = formatDate(cn.originalInvoiceDate || cn.orderDate || cn.issuedAt || new Date());

            const supplier = cn.supplier || {
                name: 'KrishiVishal Private Limited',
                address: 'Main Road, Samastipur, Bihar - 848101',
                gstin: '10AAACK9821M1Z5',
                state: 'Bihar',
                stateCode: '10'
            };

            const recipient = cn.recipient || {
                name: cn.customerName || 'Valued Farmer / Customer',
                phone: cn.customerPhone || '',
                address: cn.shippingAddress || 'Samastipur, Bihar',
                state: cn.shippingState || 'Bihar',
                stateCode: (cn.shippingState && cn.shippingState.toLowerCase() !== 'bihar') ? '09' : '10'
            };

            // 1. Header: Brand & Document Type
            doc.fontSize(16).font('Helvetica-Bold').fillColor('#b71c1c').text('CREDIT NOTE', leftMargin, 36);
            doc.fontSize(7.5).font('Helvetica').fillColor('#555555').text('(Issued in accordance with Section 34 of the CGST Act, 2017 & Rule 53)', leftMargin, doc.y);

            // Document Meta in Header (Top Right)
            const metaX = 330;
            const metaWidth = 229;
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#b71c1c').text(`Credit Note No: ${cnNo}`, metaX, 36, { align: 'right', width: metaWidth });
            doc.fontSize(8.5).font('Helvetica').fillColor('#333333');
            doc.text(`Credit Note Date: ${dateStr}`, metaX, doc.y, { align: 'right', width: metaWidth });
            doc.text(`Original Tax Invoice No: ${originalInvNo}`, metaX, doc.y, { align: 'right', width: metaWidth });
            doc.text(`Original Invoice Date: ${invDateStr}`, metaX, doc.y, { align: 'right', width: metaWidth });
            doc.text(`Reason: ${returnReason}`, metaX, doc.y, { align: 'right', width: metaWidth });

            doc.y = 95;
            doc.strokeColor('#b71c1c').lineWidth(1.5).moveTo(leftMargin, doc.y).lineTo(leftMargin + contentWidth, doc.y).stroke();
            doc.y += 8;

            // 2. Supplier Block & Recipient Block (Two Columns)
            const blockTop = doc.y;
            const halfWidth = 250;

            // Supplier Block (Left)
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#222222').text('SUPPLIER (ISSUER):', leftMargin, blockTop);
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#111111').text(supplier.name, leftMargin, doc.y + 2);
            doc.font('Helvetica').fontSize(7.5).fillColor('#444444');
            doc.text(supplier.address, leftMargin, doc.y, { width: halfWidth });
            doc.text(`GSTIN: ${supplier.gstin} | State: ${supplier.state} (Code: ${supplier.stateCode})`, leftMargin, doc.y);

            // Recipient Block (Right)
            const recX = leftMargin + 273;
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#222222').text('RECIPIENT (CUSTOMER):', recX, blockTop);
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#111111').text(recipient.name, recX, doc.y + 2);
            doc.font('Helvetica').fontSize(7.5).fillColor('#444444');
            if (recipient.phone) doc.text(`Phone: ${recipient.phone}`, recX, doc.y);
            doc.text(`Address: ${recipient.address}`, recX, doc.y, { width: halfWidth });
            doc.text(`State: ${recipient.state} (Code: ${recipient.stateCode})`, recX, doc.y);

            doc.y = Math.max(doc.y, blockTop + 55);
            doc.strokeColor('#e0e0e0').lineWidth(0.75).moveTo(leftMargin, doc.y).lineTo(leftMargin + contentWidth, doc.y).stroke();
            doc.y += 6;

            // 3. Line Items Table (Rule 53 Compliance)
            const tableTop = doc.y;
            doc.rect(leftMargin, tableTop, contentWidth, 18).fill('#fbe9e7');

            const colX = {
                sno: leftMargin + 4,
                desc: leftMargin + 24,
                hsn: leftMargin + 160,
                qty: leftMargin + 205,
                rate: leftMargin + 240,
                taxable: leftMargin + 295,
                cgst: leftMargin + 355,
                sgst: leftMargin + 410,
                total: leftMargin + 465
            };

            doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#b71c1c');
            doc.text('S.No', colX.sno, tableTop + 5);
            doc.text('Item / SKU Description', colX.desc, tableTop + 5);
            doc.text('HSN', colX.hsn, tableTop + 5);
            doc.text('Qty', colX.qty, tableTop + 5, { width: 30, align: 'center' });
            doc.text('Unit Rate', colX.rate, tableTop + 5, { width: 50, align: 'right' });
            doc.text('Taxable Rev.', colX.taxable, tableTop + 5, { width: 55, align: 'right' });
            doc.text('CGST', colX.cgst, tableTop + 5, { width: 50, align: 'right' });
            doc.text('SGST', colX.sgst, tableTop + 5, { width: 50, align: 'right' });
            doc.text('Total Refund', colX.total, tableTop + 5, { width: 54, align: 'right' });

            let currentY = tableTop + 22;
            const rawItems = Array.isArray(cn.items) && cn.items.length > 0 ? cn.items : [{
                name: 'Returned Agri-Input Merchandise',
                hsn: '3808',
                quantity: 1,
                unitPrice: cn.taxableAmount || cn.totalRefundAmount || 0,
                taxableAmount: cn.taxableAmount || 0,
                cgstAmount: cn.cgstReversal || 0,
                sgstAmount: cn.sgstReversal || 0,
                grandTotal: cn.totalRefundAmount || 0
            }];

            let totalTaxableReversal = 0;
            let totalCgstReversal = 0;
            let totalSgstReversal = 0;
            let grandRefund = 0;

            rawItems.forEach((item, index) => {
                if (currentY > 700) {
                    doc.addPage();
                    currentY = 40;
                }

                const qty = Number(item.quantity || 1);
                const taxable = roundCurrency(Number(item.taxableAmount !== undefined ? item.taxableAmount : ((item.taxablePrice || item.unitPrice || 0) * qty)));
                const cgst = roundCurrency(Number(item.cgstAmount !== undefined ? item.cgstAmount : 0));
                const sgst = roundCurrency(Number(item.sgstAmount !== undefined ? item.sgstAmount : 0));
                const lineTotal = roundCurrency(Number(item.grandTotal !== undefined ? item.grandTotal : (taxable + cgst + sgst)));
                const unitRate = roundCurrency(Number(item.unitPrice || item.taxablePrice || (taxable / (qty || 1))));

                totalTaxableReversal += taxable;
                totalCgstReversal += cgst;
                totalSgstReversal += sgst;
                grandRefund += lineTotal;

                doc.fontSize(7).font('Helvetica').fillColor('#222222');
                doc.text(String(index + 1), colX.sno, currentY);
                doc.text(item.name || item.title || item.skuId || 'Agri Item', colX.desc, currentY, { width: 130, lineBreak: false });
                doc.text(String(item.hsn || item.hsnCode || '3808').slice(0, 4), colX.hsn, currentY);
                doc.text(String(qty), colX.qty, currentY, { width: 30, align: 'center' });
                doc.text(formatCurrency(unitRate), colX.rate, currentY, { width: 50, align: 'right' });
                doc.text(formatCurrency(taxable), colX.taxable, currentY, { width: 55, align: 'right' });
                doc.text(formatCurrency(cgst), colX.cgst, currentY, { width: 50, align: 'right' });
                doc.text(formatCurrency(sgst), colX.sgst, currentY, { width: 50, align: 'right' });
                doc.text(formatCurrency(lineTotal), colX.total, currentY, { width: 54, align: 'right' });

                currentY += 16;
                doc.strokeColor('#eeeeee').lineWidth(0.5).moveTo(leftMargin, currentY - 2).lineTo(leftMargin + contentWidth, currentY - 2).stroke();
            });

            // Fallback totals if document-level summary overrides
            if (cn.taxableAmount !== undefined) totalTaxableReversal = roundCurrency(Number(cn.taxableAmount));
            if (cn.cgstReversal !== undefined) totalCgstReversal = roundCurrency(Number(cn.cgstReversal));
            if (cn.sgstReversal !== undefined) totalSgstReversal = roundCurrency(Number(cn.sgstReversal));
            if (cn.totalRefundAmount !== undefined) grandRefund = roundCurrency(Number(cn.totalRefundAmount));

            // 4. Summary Box
            currentY += 8;
            if (currentY > 670) {
                doc.addPage();
                currentY = 40;
            }

            const totalsLeft = leftMargin + 250;
            const totalsWidth = contentWidth - 250;
            const labelWidth = 145;
            const valWidth = totalsWidth - labelWidth;

            doc.rect(totalsLeft, currentY, totalsWidth, 90).fillAndStroke('#fafafa', '#e0e0e0');

            let lineY = currentY + 8;
            const addSummaryLine = (label, val, bold = false, color = '#333333') => {
                doc.fontSize(8).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(color);
                doc.text(label, totalsLeft + 8, lineY, { width: labelWidth });
                doc.text(val, totalsLeft + labelWidth, lineY, { width: valWidth - 12, align: 'right' });
                lineY += 15;
            };

            addSummaryLine('Net Taxable Value Reversal:', formatCurrency(totalTaxableReversal));
            addSummaryLine('Total CGST Reversal:', `-${formatCurrency(totalCgstReversal)}`);
            addSummaryLine('Total SGST Reversal:', `-${formatCurrency(totalSgstReversal)}`);
            doc.strokeColor('#cccccc').lineWidth(0.5).moveTo(totalsLeft + 5, lineY - 2).lineTo(totalsLeft + totalsWidth - 5, lineY - 2).stroke();
            lineY += 3;
            addSummaryLine('Grand Refund Amount:', formatCurrency(grandRefund), true, '#b71c1c');

            // 5. Statutory Footer
            doc.y = Math.max(currentY + 105, doc.y + 15);
            if (doc.y > 760) {
                doc.addPage();
                doc.y = 750;
            }

            doc.strokeColor('#b71c1c').lineWidth(1).moveTo(leftMargin, doc.y).lineTo(leftMargin + contentWidth, doc.y).stroke();
            doc.y += 8;
            doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#b71c1c').text(
                'Computer generated credit note issued under Section 34 of the CGST Act, 2017. Tax liability and inventory have been adjusted accordingly.',
                leftMargin,
                doc.y,
                { align: 'center', width: contentWidth }
            );
            doc.fontSize(7).font('Helvetica').fillColor('#777777').text(
                'KrishiVishal Private Limited | Samastipur Central Hub | Help: 1800-123-5747',
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
 * Builds Credit Note PDF buffer, uploads to Cloud Storage at credit_notes/{creditNoteId}/CN_{cleanNo}.pdf,
 * and updates credit_notes/{creditNoteId} document with pdfUrl and storagePath.
 *
 * @param {string} creditNoteId
 * @returns {Promise<{ success: boolean, creditNoteNo: string, pdfUrl: string, storagePath: string }>}
 */
async function generateAndUploadCreditNotePdf(creditNoteId) {
    if (!creditNoteId) {
        throw new Error('Missing creditNoteId for Credit Note PDF generation.');
    }

    const cnRef = db.collection('credit_notes').doc(creditNoteId);
    const cnSnap = await cnRef.get();
    if (!cnSnap.exists) {
        throw new Error(`Credit Note not found: ${creditNoteId}`);
    }
    const cnData = cnSnap.data() || {};
    const creditNoteNo = cnData.creditNoteNo || cnData.creditNoteNumber || creditNoteId;
    const cleanNo = creditNoteNo.replace(/[^a-zA-Z0-9_-]/g, '_');

    // 1. Render PDF Buffer
    const pdfBuffer = await buildCreditNotePdfBuffer(cnData);

    // 2. Upload buffer to Firebase Cloud Storage
    const storagePath = `credit_notes/${creditNoteId}/CN_${cleanNo}.pdf`;
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

    // 3. Update Firestore Document
    await cnRef.update({
        pdfUrl: downloadUrl,
        storagePath: storagePath,
        pdfGeneratedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[invoiceService] Successfully generated and uploaded credit note PDF for ${creditNoteId}: ${downloadUrl}`);

    return {
        success: true,
        creditNoteNo,
        pdfUrl: downloadUrl,
        storagePath
    };
}

module.exports = {
    generateAndUploadInvoice,
    buildInvoicePdfBuffer,
    generateAndUploadCreditNotePdf,
    buildCreditNotePdfBuffer
};
