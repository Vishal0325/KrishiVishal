package com.company.krishivishaldelivery.ui.order_detail.components

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import coil.compose.AsyncImage
import java.net.URLEncoder

@Composable
fun DynamicUpiQrDialog(
    orderId: String,
    farmerName: String,
    amount: Double,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val upiVpa = "krishivishal@icici"
    val merchantName = "Krishi Vishal Agrotech"
    val txnNote = "Order-${orderId.takeLast(6).uppercase()}"
    
    // Standard NPCI UPI URI
    val upiUriString = "upi://pay?pa=$upiVpa&pn=${URLEncoder.encode(merchantName, "UTF-8")}&am=$amount&cu=INR&tn=${URLEncoder.encode(txnNote, "UTF-8")}"
    val qrApiUrl = "https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${URLEncoder.encode(upiUriString, "UTF-8")}"

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.QrCode,
                            contentDescription = null,
                            tint = Color(0xFF2E7D32),
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            "UPI QR कलेक्शन",
                            fontWeight = FontWeight.Black,
                            fontSize = 18.sp,
                            color = Color(0xFF1B5E20)
                        )
                    }
                    IconButton(onClick = onDismiss, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.Gray)
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Farmer & Order Banner
                Surface(
                    color = Color(0xFFF1F8E9),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = farmerName,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = Color(0xFF33691E)
                        )
                        Text(
                            text = "Order #${orderId.takeLast(8).uppercase()}",
                            fontSize = 12.sp,
                            color = Color(0xFF558B2F),
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "देय राशि: ₹${"%.2f".format(amount)}",
                            fontWeight = FontWeight.Black,
                            fontSize = 22.sp,
                            color = Color(0xFFE65100)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // QR Code Image Container
                Box(
                    modifier = Modifier
                        .size(230.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color(0xFFFAFAFA))
                        .padding(8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    AsyncImage(
                        model = qrApiUrl,
                        contentDescription = "Dynamic UPI QR",
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Fit
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Supported Apps Text
                Text(
                    text = "PhonePe • Google Pay • Paytm • BHIM",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF5D4037),
                    textAlign = TextAlign.Center
                )

                Text(
                    text = "किसान से कहें कि अपने फोन से इस QR को स्कैन करें",
                    fontSize = 11.sp,
                    color = Color.Gray,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 2.dp)
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Open in UPI App / Share
                Button(
                    onClick = {
                        try {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(upiUriString))
                            val chooser = Intent.createChooser(intent, "UPI भुगतान ऐप चुनें")
                            context.startActivity(chooser)
                        } catch (e: Exception) {
                            Toast.makeText(context, "कोई UPI ऐप नहीं मिला", Toast.LENGTH_SHORT).show()
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("UPI ऐप में खोलें / शेयर करें", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
