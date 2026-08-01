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

    fun printOrderInvoice(context: Context, order: Order) {
        val webView = WebView(context)
        val htmlContent = generateInvoiceHtml(order)
        
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
        val df = SimpleDateFormat("dd MMM yyyy", Locale.getDefault())
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
                        <span class="order-id">ORD: #${order.id.takeLast(8).uppercase()}</span>
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

    private fun generateInvoiceHtml(order: Order): String {
        val df = SimpleDateFormat("dd MMM yyyy", Locale.getDefault())
        val itemsHtml = order.items.joinToString("") { item ->
            """
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">
                    ${item.productName}
                    ${if (!item.variantLabel.isNullOrBlank()) "<br/><small style='color: #666;'>Variant: ${item.variantLabel}</small>" else ""}
                </td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">₹${item.price}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">₹${item.price * item.quantity}</td>
            </tr>
            """.trimIndent()
        }

        val taxable = order.totalAmount / 1.05
        val gst = order.totalAmount - taxable

        return """
        <html>
        <head>
            <style>
                body { font-family: sans-serif; padding: 20px; color: #333; }
                .header { text-align: center; border-bottom: 2px solid #2D7D5F; padding-bottom: 10px; }
                .company-name { font-size: 24px; font-weight: bold; color: #2D7D5F; margin: 0; }
                .invoice-details { display: flex; justify-content: space-between; margin-top: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #f5f5f5; padding: 10px; text-align: left; border-bottom: 2px solid #ddd; }
                .totals { margin-top: 20px; text-align: right; }
                .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #777; }
            </style>
        </head>
        <body>
            <div class="header">
                <p class="company-name">KRISHI VISHAL</p>
                <p>Bihar's Leading Agricultural Store | GSTIN: 10AAAAA0000A1Z5</p>
            </div>
            
            <div class="invoice-details">
                <div style="float: left;">
                    <p><b>Billed To:</b><br/>
                    ${order.userName}<br/>
                    ${order.userPhone}<br/>
                    ${order.address}</p>
                </div>
                <div style="float: right; text-align: right;">
                    <p><b>TAX INVOICE</b><br/>
                    <b>Invoice No:</b> #${order.id.take(8).uppercase()}<br/>
                    <b>Date:</b> ${df.format(order.createdAt)}</p>
                </div>
                <div style="clear: both;"></div>
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
                    $itemsHtml
                </tbody>
            </table>

            <div class="totals">
                <p>Taxable Value: ₹${String.format("%.2f", taxable)}</p>
                <p>CGST (2.5%): ₹${String.format("%.2f", gst / 2)}</p>
                <p>SGST (2.5%): ₹${String.format("%.2f", gst / 2)}</p>
                <h2 style="color: #2D7D5F;">Grand Total: ₹${order.totalAmount}</h2>
            </div>

            <div class="footer">
                <p>This is a computer generated invoice. No signature required.</p>
                <p>Thank you for choosing Krishi Vishal for your farming needs!</p>
            </div>
        </body>
        </html>
        """.trimIndent()
    }
}
