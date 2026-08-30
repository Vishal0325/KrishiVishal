package com.company.krishivishal.utils

import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import com.company.krishivishal.core.model.Order
import java.text.SimpleDateFormat
import java.util.Locale

object PrintHelper {

    fun printOrderInvoice(context: Context, order: Order, appConfig: com.company.krishivishal.core.model.AppConfig) {
        val webView = WebView(context)
        val htmlContent = generateInvoiceHtml(order, appConfig)
        
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                val printManager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
                val printAdapter = webView.createPrintDocumentAdapter("Invoice_${order.id}")
                val jobName = "KrishiVishal_Invoice_${order.id}"
                printManager.print(jobName, printAdapter, PrintAttributes.Builder().build())
            }
        }

        webView.loadDataWithBaseURL(null, htmlContent, "text/html", "UTF-8", null)
    }

    fun printShippingLabel(context: Context, order: Order) {
        val webView = WebView(context)
        val htmlContent = generateShippingLabelHtml(order)
        
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                val printManager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
                val printAdapter = webView.createPrintDocumentAdapter("Label_${order.id}")
                val jobName = "KrishiVishal_Label_${order.id}"
                printManager.print(jobName, printAdapter, PrintAttributes.Builder().build())
            }
        }

        webView.loadDataWithBaseURL(null, htmlContent, "text/html", "UTF-8", null)
    }

    private fun generateShippingLabelHtml(order: Order): String {
        val df = SimpleDateFormat("dd MMM yyyy", Locale.US)
        val itemsList = order.items.joinToString(", ") { "${it.productName} (x${it.quantity})" }

        return """
        <html>
        <head>
            <style>
                body { font-family: sans-serif; padding: 10px; color: #000; }
                .label-box { border: 2px dashed #000; padding: 15px; width: 100%; box-sizing: border-box; }
                .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
                .company-info { flex: 1; }
                .company-name { font-size: 18px; font-weight: 900; margin: 0; }
                .order-id { font-size: 16px; font-weight: bold; background: #000; color: #fff; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 5px; }
                .qr-code { width: 80px; height: 80px; border: 1px solid #eee; }
                .address-box { margin-bottom: 20px; }
                .address-title { font-size: 14px; font-weight: bold; text-decoration: underline; margin-bottom: 5px; }
                .address-text { font-size: 18px; font-weight: bold; line-height: 1.4; }
                .items-box { font-size: 12px; border-top: 1px solid #000; padding-top: 10px; color: #444; }
                .footer { margin-top: 15px; font-size: 14px; font-weight: bold; text-align: center; background: #eee; padding: 5px; }
            </style>
        </head>
        <body>
            <div class="label-box">
                <div class="header">
                    <div class="company-info">
                        <p class="company-name">KRISHI VISHAL</p>
                        <span class="order-id">ORD: #${order.id.takeLast(6).uppercase()}</span>
                    </div>
                    <img class="qr-code" src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${order.id}" />
                </div>
                
                <div class="address-box">
                    <div class="address-title">DELIVER TO:</div>
                    <div class="address-text">
                        ${order.userName.uppercase()}<br/>
                        ${order.address}<br/>
                        Ph: ${order.userPhone}
                    </div>
                </div>

                <div class="items-box">
                    <b>Contents:</b> $itemsList
                </div>

                <div class="footer">
                    ${if (order.isCOD) "CASH ON DELIVERY: ₹${order.totalAmount}" else "PREPAID - PAID ONLINE"}
                </div>
            </div>
        </body>
        </html>
        """.trimIndent()
    }

    private fun generateInvoiceHtml(order: Order, appConfig: com.company.krishivishal.core.model.AppConfig): String {
        val df = SimpleDateFormat("dd MMM yyyy", Locale.US)
        val itemsHtml = order.items.joinToString("") { item ->
            """
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">
                    ${item.productName}
                    ${if (!item.variantLabel.isNullOrBlank()) "<br/><small style='color: #666;'>Variant: ${item.variantLabel}</small>" else ""}
                </td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.hsnCode.ifBlank { "N/A" }}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">₹${String.format(Locale.US, "%.2f", item.price)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">₹${String.format(Locale.US, "%.2f", item.price * item.quantity)}</td>
            </tr>
            """.trimIndent()
        }

        val taxableTotal = order.taxableTotal.takeIf { it > 0 } ?: order.totalAmount
        val totalTax = order.totalTax
        val cgst = order.cgst
        val sgst = order.sgst
        val igst = order.igst

        return """
        <html>
        <head>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; line-height: 1.6; }
                .header { text-align: center; border-bottom: 3px solid #1b5e20; padding-bottom: 15px; margin-bottom: 20px; }
                .company-name { font-size: 28px; font-weight: 900; color: #1b5e20; margin: 0; letter-spacing: -1px; }
                .gstin-text { font-size: 12px; font-weight: bold; color: #666; }
                .invoice-details { display: flex; justify-content: space-between; margin-top: 20px; margin-bottom: 30px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #f8f9fa; padding: 12px 10px; text-align: left; border-bottom: 2px solid #1b5e20; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
                td { padding: 10px; font-size: 13px; }
                .totals-box { margin-top: 30px; float: right; width: 300px; background: #f8f9fa; padding: 20px; border-radius: 12px; }
                .total-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
                .grand-total { border-top: 2px solid #ddd; padding-top: 10px; margin-top: 10px; font-size: 20px; font-weight: 900; color: #1b5e20; }
                .footer { margin-top: 100px; text-align: center; font-size: 11px; color: #999; clear: both; border-top: 1px solid #eee; padding-top: 20px; }
                .stamp { position: absolute; bottom: 150px; right: 50px; opacity: 0.1; }
            </style>
        </head>
        <body>
            <div class="header">
                <p class="company-name">KRISHI VISHAL</p>
                <p class="gstin-text">Agriculture Redefined | GSTIN: ${appConfig.gstin.ifBlank { "REGISTRATION PENDING" }}</p>
                <p style="font-size: 10px; margin: 5px 0;">Reg. Off: Main Road, Near Block Chowk, Bihar</p>
            </div>
            
            <div class="invoice-details">
                <div style="float: left; width: 60%;">
                    <p style="margin: 0; font-size: 11px; color: #999; text-transform: uppercase; font-weight: bold;">Billed To:</p>
                    <p style="margin: 5px 0; font-size: 16px; font-weight: 900;">${order.userName}</p>
                    <p style="margin: 0; font-size: 13px; color: #444;">${order.userPhone}</p>
                    <p style="margin: 5px 0; font-size: 13px; color: #666; max-width: 250px;">${order.address}</p>
                </div>
                <div style="float: right; text-align: right; width: 40%;">
                    <p style="margin: 0; font-size: 20px; font-weight: 900; color: #1b5e20;">TAX INVOICE</p>
                    <p style="margin: 5px 0; font-size: 13px;"><b>Invoice No:</b> #${order.id.takeLast(6).uppercase()}</p>
                    <p style="margin: 0; font-size: 13px;"><b>Date:</b> ${df.format(order.createdAt)}</p>
                </div>
                <div style="clear: both;"></div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width: 40%;">Item Description</th>
                        <th style="text-align: center;">HSN</th>
                        <th style="text-align: center;">Qty</th>
                        <th style="text-align: right;">Unit Price</th>
                        <th style="text-align: right;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    $itemsHtml
                </tbody>
            </table>

            <div class="totals-box">
                <div class="total-row">
                    <span>Subtotal (MRP):</span>
                    <span>₹${String.format(Locale.US, "%.2f", order.subtotal)}</span>
                </div>
                ${if (order.totalDiscount > 0) """
                <div class="total-row" style="color: #2e7d32;">
                    <span>Product Discount:</span>
                    <span>-₹${String.format(Locale.US, "%.2f", order.totalDiscount)}</span>
                </div>
                """.trimIndent() else ""}
                <div class="total-row">
                    <span>Taxable Value:</span>
                    <span>₹${String.format(Locale.US, "%.2f", order.taxableTotal)}</span>
                </div>
                ${if (cgst > 0) """
                <div class="total-row" style="color: #666; font-size: 12px;">
                    <span>CGST (Bihar):</span>
                    <span>₹${String.format(Locale.US, "%.2f", cgst)}</span>
                </div>
                """.trimIndent() else ""}
                ${if (sgst > 0) """
                <div class="total-row" style="color: #666; font-size: 12px;">
                    <span>SGST (Bihar):</span>
                    <span>₹${String.format(Locale.US, "%.2f", sgst)}</span>
                </div>
                """.trimIndent() else ""}
                
                <div class="total-row" style="font-weight: bold; margin-top: 5px;">
                    <span>Total Tax:</span>
                    <span>+₹${String.format(Locale.US, "%.2f", totalTax)}</span>
                </div>

                <div class="total-row">
                    <span>Delivery Charges:</span>
                    <span>${if (order.deliveryCharges > 0) "₹" + String.format(Locale.US, "%.2f", order.deliveryCharges) else "FREE"}</span>
                </div>

                ${if (order.platformFee > 0) """
                <div class="total-row" style="font-size: 11px; color: #777;">
                    <span>Platform Fee:</span>
                    <span>₹${String.format(Locale.US, "%.2f", order.platformFee)}</span>
                </div>
                """.trimIndent() else ""}

                <div class="total-row grand-total">
                    <span>Grand Total:</span>
                    <span>₹${String.format(Locale.US, "%.2f", order.totalAmount)}</span>
                </div>
                <p style="font-size: 10px; color: #999; margin-top: 15px; font-style: italic;">
                    Amount in words: ${convertAmountToWords(order.totalAmount)} Rupees Only
                </p>
            </div>

            <div class="footer">
                <p>CERTIFIED that the particulars given above are true and correct.</p>
                <p style="font-weight: bold;">For KRISHI VISHAL</p>
                <br/><br/>
                <p>Authorized Signatory</p>
                <p style="font-size: 9px; margin-top: 20px;">This is a computer generated invoice and does not require a physical signature.</p>
            </div>
        </body>
        </html>
        """.trimIndent()
    }

    private fun convertAmountToWords(amount: Double): String {
        // Simple placeholder for now - in production use a library or full implementation
        return "${amount.toInt()} "
    }
}
