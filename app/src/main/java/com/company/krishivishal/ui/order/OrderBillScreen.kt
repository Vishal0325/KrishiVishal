package com.company.krishivishal.ui.order

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.company.krishivishal.R
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.utils.PrintHelper
import java.text.SimpleDateFormat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderBillScreen(
    order: Order,
    onBack: () -> Unit,
    template: String = "standard"
) {
    val context = LocalContext.current
    val dateFormat = remember { SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault()) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Tax Invoice", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { PrintHelper.printOrderInvoice(context, order) }) {
                        Icon(Icons.Default.Share, contentDescription = "Share")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(if (template == "elegant") Color(0xFF1A1A1A) else Color.White)
                .verticalScroll(rememberScrollState())
        ) {
            when (template) {
                "modern" -> ModernTemplate(order, dateFormat)
                "compact" -> CompactTemplate(order, dateFormat)
                "elegant" -> ElegantTemplate(order, dateFormat)
                "detailed" -> DetailedTaxTemplate(order, dateFormat)
                else -> StandardTemplate(order, dateFormat)
            }
            
            Spacer(modifier = Modifier.height(24.dp))
            
            Button(
                onClick = { PrintHelper.printOrderInvoice(context, order) },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (template == "elegant") Color.White else Color.Black,
                    contentColor = if (template == "elegant") Color.Black else Color.White
                ),
                shape = RoundedCornerShape(12.dp)
            ) {
                Icon(Icons.Default.Print, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(stringResource(R.string.download_print_invoice), fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun StandardTemplate(order: Order, dateFormat: SimpleDateFormat) {
    Column(modifier = Modifier.padding(24.dp)) {
        Text("KRISHI VISHAL", fontSize = 26.sp, fontWeight = FontWeight.Black, color = PrimaryGreen)
        Text("GSTIN: 10AAAAA0000A1Z5 | Bihar (10)", fontSize = 11.sp, color = Color.Gray)
        
        HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp), thickness = 0.5.dp)
        
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Billed To:", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color.Black)
                Spacer(modifier = Modifier.height(4.dp))
                Text(order.address, fontSize = 12.sp, color = Color.DarkGray, lineHeight = 18.sp)
            }
            Spacer(modifier = Modifier.width(24.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text("Invoice ID", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color.Black)
                Text("#${order.id.take(8).uppercase()}", fontWeight = FontWeight.Medium, fontSize = 14.sp)
                Spacer(modifier = Modifier.height(8.dp))
                Text("Date", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color.Black)
                Text(dateFormat.format(order.createdAt), fontSize = 12.sp, color = Color.DarkGray)
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        TableSection(order)
        
        Spacer(modifier = Modifier.height(16.dp))
        TaxSummary(order.totalAmount)
        
        Spacer(modifier = Modifier.height(24.dp))
        Text("Authorized Signatory", modifier = Modifier.align(Alignment.End), fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun ModernTemplate(order: Order, dateFormat: SimpleDateFormat) {
    Column(modifier = Modifier.padding(24.dp)) {
        Surface(color = PrimaryGreen, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(24.dp)) {
                Text("TAX INVOICE", color = Color.White, fontWeight = FontWeight.Thin, fontSize = 34.sp)
                Text("Krishi Vishal - Bihar Region", color = Color.White.copy(0.8f))
            }
        }
        Spacer(modifier = Modifier.height(24.dp))
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F3F5)),
            shape = RoundedCornerShape(16.dp)
        ) {
             Row(modifier = Modifier.padding(20.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                 Column {
                     Text("Grand Total", fontSize = 14.sp, color = Color.Gray)
                     Text("₹${order.totalAmount}", fontSize = 24.sp, fontWeight = FontWeight.Black, color = PrimaryGreen)
                 }
                 Surface(color = Color.White, shape = CircleShape) {
                     Text(order.paymentStatus, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp), color = PrimaryGreen, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                 }
             }
        }
        Spacer(modifier = Modifier.height(24.dp))
        TableSection(order)
    }
}

@Composable
fun CompactTemplate(order: Order, dateFormat: SimpleDateFormat) {
    Column(modifier = Modifier.padding(12.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("KV-BIHAR", fontWeight = FontWeight.Black, fontSize = 16.sp, color = PrimaryGreen)
            Text("#${order.id.take(6).uppercase()}", fontWeight = FontWeight.Bold)
        }
        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
        order.items.forEach { 
            Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                val itemText = "${it.quantity}x ${it.productName}${if (!it.variantLabel.isNullOrBlank()) " (${it.variantLabel})" else ""}"
                Text(itemText, fontSize = 12.sp, modifier = Modifier.weight(1f))
                Text("₹${it.price * it.quantity}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("TOTAL", fontWeight = FontWeight.Black)
            Text("₹${order.totalAmount}", fontWeight = FontWeight.Black, color = PrimaryGreen)
        }
    }
}

@Composable
fun ElegantTemplate(order: Order, dateFormat: SimpleDateFormat) {
    Column(modifier = Modifier.padding(32.dp)) {
        Text("KRISHI VISHAL", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.ExtraLight)
        Spacer(modifier = Modifier.height(48.dp))
        Text("CUSTOMER RECEIPT", color = Color.White.copy(0.5f), fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Spacer(modifier = Modifier.height(8.dp))
        Text(order.address, color = Color.White, fontSize = 16.sp, lineHeight = 24.sp)
        Spacer(modifier = Modifier.height(32.dp))
        TableSectionDark(order)
    }
}

@Composable
fun DetailedTaxTemplate(order: Order, dateFormat: SimpleDateFormat) {
    val taxableValue = order.totalAmount / 1.05 
    val gstAmount = order.totalAmount - taxableValue
    val cgst = gstAmount / 2
    val sgst = gstAmount / 2

    Column(modifier = Modifier.padding(24.dp)) {
        Text("TAX INVOICE", fontWeight = FontWeight.Black, fontSize = 24.sp)
        Text("State: Bihar | State Code: 10", fontSize = 13.sp, color = Color.Gray)
        Spacer(modifier = Modifier.height(24.dp))
        
        Column(modifier = Modifier.border(1.dp, Color.Black)) {
            Row(Modifier.background(Color(0xFFE9ECEF)).padding(8.dp)) {
                Text("Description", Modifier.weight(2.5f), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text("HSN", Modifier.weight(1f), fontSize = 11.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                Text("GST %", Modifier.weight(1f), fontSize = 11.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                Text("Amount", Modifier.weight(1.5f), fontSize = 11.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.End)
            }
            order.items.forEach { 
                Row(Modifier.padding(8.dp)) {
                    Column(Modifier.weight(2.5f)) {
                        val label = it.variantLabel
                        if (!label.isNullOrBlank()) {
                            Text(label, fontSize = 9.sp, color = Color.Gray)
                        }
                    }
                    Text("3101", Modifier.weight(1f), fontSize = 11.sp, textAlign = TextAlign.Center)
                    Text("5%", Modifier.weight(1f), fontSize = 11.sp, textAlign = TextAlign.Center)
                    Text("₹${it.price * it.quantity}", Modifier.weight(1.5f), fontSize = 11.sp, textAlign = TextAlign.End)
                }
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        Column(modifier = Modifier.align(Alignment.End)) {
            TotalBreakdownRow("Taxable Value", "₹${String.format("%.2f", taxableValue)}")
            TotalBreakdownRow("CGST (2.5%)", "₹${String.format("%.2f", cgst)}")
            TotalBreakdownRow("SGST (2.5%)", "₹${String.format("%.2f", sgst)}")
            HorizontalDivider(Modifier.width(200.dp).padding(vertical = 8.dp), thickness = 1.dp, color = Color.Black)
            Row(Modifier.width(200.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Total Amount", fontWeight = FontWeight.Black, fontSize = 18.sp)
                Text("₹${order.totalAmount}", fontWeight = FontWeight.Black, fontSize = 18.sp, color = PrimaryGreen)
            }
        }
    }
}

@Composable
fun TotalBreakdownRow(label: String, value: String) {
    Row(Modifier.width(200.dp).padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontSize = 12.sp, color = Color.Gray)
        Text(value, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun TaxSummary(total: Double) {
    val taxable = total / 1.05
    val gst = total - taxable
    Column(modifier = Modifier.fillMaxWidth().padding(top = 16.dp), horizontalAlignment = Alignment.End) {
        Text("Includes estimated CGST & SGST (5%): ₹${String.format("%.2f", gst)}", fontSize = 11.sp, color = Color.Gray, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun TableSectionDark(order: Order) {
    Column {
        order.items.forEach { item ->
            Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(modifier = Modifier.weight(1f)) {
                    val label = item.variantLabel
                    if (!label.isNullOrBlank()) {
                        Text(label, color = Color.White.copy(0.7f), fontSize = 12.sp)
                    }
                }
                Text("₹${item.price * item.quantity}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
            HorizontalDivider(color = Color.White.copy(0.1f))
        }
        Spacer(modifier = Modifier.height(24.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            Text("TOTAL PAYABLE", color = Color.White.copy(0.6f), fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text("₹${order.totalAmount}", color = PrimaryGreen, fontSize = 32.sp, fontWeight = FontWeight.Thin)
        }
    }
}


@Composable
fun TableSection(order: Order) {
    Column(modifier = Modifier.border(0.5.dp, Color.LightGray)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFF8F9FA))
                .padding(12.dp)
        ) {
            Text("Description", modifier = Modifier.weight(3f), fontWeight = FontWeight.Bold, fontSize = 13.sp)
            Text("Qty", modifier = Modifier.weight(1f), fontWeight = FontWeight.Bold, fontSize = 13.sp, textAlign = TextAlign.Center)
            Text("Total", modifier = Modifier.weight(1.5f), fontWeight = FontWeight.Bold, fontSize = 13.sp, textAlign = TextAlign.End)
        }

        order.items.forEach { item ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp)
            ) {
                Column(modifier = Modifier.weight(3f)) {
                    val label = item.variantLabel
                    if (!label.isNullOrBlank()) {
                        Text(label, fontSize = 11.sp, color = Color.Gray)
                    }
                }
                Text("${item.quantity}", modifier = Modifier.weight(1f), fontSize = 13.sp, textAlign = TextAlign.Center)
                Text("₹${item.price * item.quantity}", modifier = Modifier.weight(1.5f), fontSize = 13.sp, textAlign = TextAlign.End, fontWeight = FontWeight.SemiBold)
            }
            HorizontalDivider(color = Color(0xFFF1F3F5), thickness = 0.5.dp)
        }
    }
}
