import { formatCurrency, formatDateTime } from './formatters';

export const printShippingLabel = (order) => {
  const printWindow = window.open('', '_blank');
  const itemsList = order.items?.map(item => `<li>${item.productName} (x${item.quantity})</li>`).join('') || '';

  const htmlContent = `
    <html>
      <head>
        <title>Shipping Label - ${order.id}</title>
        <style>
          @page { size: auto; margin: 0; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #000; }
          .label-box { border: 3px solid #000; padding: 20px; width: 100%; max-width: 500px; margin: 0 auto; box-sizing: border-box; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
          .company-info { flex: 1; }
          .company-name { font-size: 24px; font-weight: 900; letter-spacing: -1px; margin-bottom: 5px; }
          .order-id { font-size: 16px; font-weight: bold; background: #000; color: #fff; padding: 2px 8px; border-radius: 4px; width: fit-content; }
          .qr-code { width: 100px; height: 100px; border: 1px solid #ddd; padding: 5px; background: #fff; }
          .address-section { margin-bottom: 25px; }
          .title { font-size: 14px; font-weight: bold; text-decoration: underline; margin-bottom: 8px; color: #555; }
          .address-details { font-size: 20px; font-weight: 800; line-height: 1.3; }
          .items-section { border-top: 1px solid #ddd; padding-top: 15px; font-size: 13px; color: #333; }
          .footer { margin-top: 20px; text-align: center; border-top: 2px solid #000; padding-top: 10px; font-size: 18px; font-weight: 900; text-transform: uppercase; }
          .payment-prepaid { color: #1b5e20; }
          .payment-cod { color: #b71c1c; }
        </style>
      </head>
      <body>
        <div class="label-box">
          <div class="header">
            <div class="company-info">
              <div class="company-name">KRISHI VISHAL</div>
              <div class="order-id">ORD: #${order.id.slice(-8).toUpperCase()}</div>
            </div>
            <img class="qr-code" src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${order.id}" alt="QR" />
          </div>

          <div class="address-section">
            <div class="title">SHIP TO:</div>
            <div class="address-details">
              ${(order.userName || order.address?.name || 'Customer').toUpperCase()}<br/>
              ${order.address && typeof order.address === 'string' ? order.address : [order.address?.village, order.address?.district].filter(Boolean).join(', ')}<br/>
              ${order.address?.state ? order.address.state + (order.address?.pincode ? ' - ' + order.address.pincode : '') : ''}
              TEL: ${order.userPhone || order.address?.phone || ''}
            </div>
          </div>

          <div class="items-section">
            <strong>Package Contents:</strong>
            <ul style="margin: 5px 0; padding-left: 20px;">
              ${itemsList}
            </ul>
          </div>

          <div class="footer ${order.paymentMethod === 'Online' ? 'payment-prepaid' : 'payment-cod'}">
            ${order.paymentMethod === 'Online' ? 'PAID ONLINE - PREPAID' : `CASH ON DELIVERY: ${formatCurrency(order.totalAmount)}`}
          </div>
        </div>
        <script>
          window.onload = () => {
            window.print();
            window.onafterprint = () => window.close();
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
};

export const printInvoice = (order) => {
  const printWindow = window.open('', '_blank');
  const itemsHtml = order.items?.map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.productName}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.price)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.price * item.quantity)}</td>
    </tr>
  `).join('') || '';

  const htmlContent = `
    <html>
      <head>
        <title>Invoice - ${order.id}</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #333; }
          .header { display: flex; justify-content: space-between; border-bottom: 3px solid #1b5e20; padding-bottom: 20px; }
          .company-info h1 { margin: 0; color: #1b5e20; font-size: 28px; }
          .invoice-meta { text-align: right; }
          .billing-info { display: flex; justify-content: space-between; margin-top: 30px; }
          table { width: 100%; border-collapse: collapse; margin-top: 30px; }
          th { background: #f9f9f9; padding: 12px; text-align: left; border-bottom: 2px solid #eee; font-size: 13px; text-transform: uppercase; }
          .totals { margin-top: 30px; text-align: right; }
          .total-row { font-size: 20px; font-weight: bold; color: #1b5e20; }
          .footer { margin-top: 100px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
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
            <p><strong>Order ID:</strong> #${order.id.slice(-8).toUpperCase()}<br/>
            <strong>Date:</strong> ${formatDateTime(order.createdAt)}</p>
          </div>
        </div>

        <div class="billing-info">
          <div>
            <h4 style="margin-bottom: 5px; color: #666;">BILLED TO:</h4>
            <p><strong>${order.userName || order.address?.name || 'Customer'}</strong><br/>
            ${order.address && typeof order.address === 'string' ? order.address : [order.address?.village, order.address?.district].filter(Boolean).join(', ')}<br/>
            ${order.address?.state ? order.address.state + (order.address?.pincode ? ' - ' + order.address.pincode : '') : ''}<br/>
            Phone: ${order.userPhone || order.address?.phone || ''}</p>
          </div>
          <div style="text-align: right;">
            <h4 style="margin-bottom: 5px; color: #666;">PAYMENT:</h4>
            <p><strong>Method:</strong> ${order.paymentMethod || 'COD'}<br/>
            <strong>Status:</strong> ${order.paymentStatus || 'Pending'}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Item Description</th>
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
          <p>Subtotal (MRP): ${formatCurrency(order.subtotal || order.totalAmount)}</p>
          ${order.totalDiscount > 0 ? `<p style="color: #1b5e20;">Discount: -${formatCurrency(order.totalDiscount)}</p>` : ''}
          <p>Taxable Value: ${formatCurrency(order.taxableTotal || order.totalAmount)}</p>
          <p>GST (Bihar): +${formatCurrency(order.totalTax || 0)}</p>
          <p>Delivery Charges: ${order.deliveryCharges > 0 ? formatCurrency(order.deliveryCharges) : '<span style="color: #1b5e20;">FREE</span>'}</p>
          ${order.platformFee > 0 ? `<p style="font-size: 11px; color: #999;">Platform Fee: ${formatCurrency(order.platformFee)}</p>` : ''}
          <div class="total-row">Grand Total: ${formatCurrency(order.totalAmount)}</div>
        </div>

        <div class="footer">
          <p>This is a computer generated invoice and does not require a signature.</p>
          <p>Thank you for shopping with Krishi Vishal!</p>
        </div>

        <script>
          window.onload = () => {
            window.print();
            window.onafterprint = () => window.close();
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
};
