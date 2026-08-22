package com.company.krishivishal.ui.support

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.company.krishivishal.R
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.SupportUtils
import java.net.URLEncoder

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupportScreen(
    onBack: () -> Unit,
    viewModel: SupportViewModel = hiltViewModel()
) {
    val configResource by viewModel.config.collectAsState()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Help & Support", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Contact Cards
            item {
                Text(
                    text = "Contact Us",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )
            }

            item {
                val config = (configResource as? Resource.Success)?.data
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    ContactCard(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.Chat,
                        title = "WhatsApp",
                        color = Color(0xFF25D366),
                        onClick = { 
                            if (config != null && config.whatsappNumber.isNotEmpty()) {
                                SupportUtils.openWhatsApp(context, config.whatsappNumber, context.getString(R.string.whatsapp_msg))
                            } else {
                                Toast.makeText(context, "WhatsApp support not available", Toast.LENGTH_SHORT).show()
                            }
                        }
                    )
                    ContactCard(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.Email,
                        title = "Email",
                        color = Color(0xFFEA4335),
                        onClick = { 
                            if (config != null && config.supportEmail.isNotEmpty()) {
                                SupportUtils.openEmail(context, config.supportEmail)
                            } else {
                                Toast.makeText(context, "Email support not available", Toast.LENGTH_SHORT).show()
                            }
                        }
                    )
                    ContactCard(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.Call,
                        title = "Call",
                        color = PrimaryGreen,
                        onClick = { 
                            if (config != null && config.supportCallNumber.isNotEmpty()) {
                                SupportUtils.makeCall(context, config.supportCallNumber)
                            } else {
                                Toast.makeText(context, "Call support not available", Toast.LENGTH_SHORT).show()
                            }
                        }
                    )
                }
            }

            // FAQs Section
            item {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Frequently Asked Questions",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )
            }

            val faqs = listOf(
                "How to track my order?" to "You can track your order in the 'My Orders' section of your profile.",
                "How can I return a product?" to "Returns can be initiated within 7 days of delivery from the order details page.",
                "What are the shipping charges?" to "Shipping is free for orders above ₹499. For others, a flat fee of ₹40 applies.",
                "Payment methods available?" to "We accept Cash on Delivery (COD), UPI, Credit/Debit cards, and Net Banking.",
                "Is there a warranty on seeds?" to "Seeds are perishable items and don't have a traditional warranty, but we guarantee 90%+ germination rate."
            )

            items(faqs) { faq ->
                FaqItem(question = faq.first, answer = faq.second)
            }

            item {
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }
}

@Composable
fun ContactCard(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    title: String,
    color: Color,
    onClick: () -> Unit
) {
    Card(
        modifier = modifier
            .height(90.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = color, modifier = Modifier.size(28.dp))
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = title, fontSize = 12.sp, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
fun FaqItem(question: String, answer: String) {
    var expanded by remember { mutableStateOf(false) }
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { expanded = !expanded },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = question,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                Icon(
                    imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = null,
                    tint = Color.Gray
                )
            }
            if (expanded) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = answer,
                    fontSize = 14.sp,
                    color = Color.DarkGray,
                    lineHeight = 20.sp
                )
            }
        }
    }
}
