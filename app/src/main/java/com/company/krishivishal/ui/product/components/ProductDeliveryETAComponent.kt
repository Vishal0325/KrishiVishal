package com.company.krishivishal.ui.product.components

import android.content.Context
import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.company.krishivishal.ui.theme.PrimaryGreen
import java.util.Calendar

private const val PREFS_NAME = "krishivishal_delivery_prefs"
private const val KEY_SAVED_PINCODE = "saved_delivery_pincode"

// District hub names for primary serviceable Bihar Pincodes
private val HUB_MAPPINGS = mapOf(
    "854301" to "पूर्णिया सेंट्रल हब (Purnea Central Hub)",
    "854302" to "गुलाबबाग मंडी हब (Gulabbagh Hub)",
    "854303" to "बनमनखी हब (Banmankhi Hub)",
    "854304" to "धमदाहा हब (Dhamdaha Hub)",
    "854305" to "कसबा हब (Kasba Hub)",
    "854205" to "कटिहार हब (Katihar Hub)",
    "854315" to "अररिया हब (Araria Hub)",
    "854326" to "किशनगंज हब (Kishanganj Hub)",
    "852201" to "सहरसा हब (Saharsa Hub)",
    "852131" to "सुपौल हब (Supaul Hub)",
    "852113" to "मधेपुरा हब (Madhepura Hub)"
)

@Composable
fun ProductDeliveryETASection(
    modifier: Modifier = Modifier,
    isOutOfStock: Boolean = false
) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val prefs = remember { context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }
    
    var pincodeInput by remember { 
        mutableStateOf(prefs.getString(KEY_SAVED_PINCODE, "854301") ?: "854301") 
    }
    var appliedPincode by remember { 
        mutableStateOf(prefs.getString(KEY_SAVED_PINCODE, "854301") ?: "854301") 
    }
    var isEditing by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // Delivery calculation
    val isServiceable = appliedPincode.length == 6 && (
        appliedPincode.startsWith("85") || appliedPincode.startsWith("84") || appliedPincode.startsWith("80")
    )

    val currentHour = remember { Calendar.getInstance().get(Calendar.HOUR_OF_DAY) }
    val isSameDayAvailable = currentHour < 14 // Before 2:00 PM
    val hubName = HUB_MAPPINGS[appliedPincode] ?: "स्थानीय कृषि विशाल हब (Regional Agri Hub)"

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFFF8FAF8)
        ),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Header Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFE8F5E9)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.LocalShipping,
                            contentDescription = "Delivery",
                            tint = PrimaryGreen,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = "डिलीवरी एवं पिनकोड (Delivery ETA)",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = Color(0xFF1B381E)
                        )
                        Text(
                            text = "पिनकोड दर्ज करें और डिलीवरी का समय देखें",
                            fontSize = 11.sp,
                            color = Color(0xFF64748B)
                        )
                    }
                }

                if (!isEditing) {
                    TextButton(
                        onClick = { isEditing = true },
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = "बदलें (Change)",
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                            color = PrimaryGreen
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Pincode Input / Display Row
            if (isEditing) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = pincodeInput,
                        onValueChange = { 
                            if (it.length <= 6 && it.all { char -> char.isDigit() }) {
                                pincodeInput = it
                                errorMessage = null
                            }
                        },
                        placeholder = { Text("6 अंकों का पिनकोड (e.g. 854301)", fontSize = 12.sp) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = {
                                if (pincodeInput.length == 6) {
                                    appliedPincode = pincodeInput
                                    prefs.edit().putString(KEY_SAVED_PINCODE, pincodeInput).apply()
                                    isEditing = false
                                    focusManager.clearFocus()
                                } else {
                                    errorMessage = "कृपया सही 6 अंकों का पिनकोड दर्ज करें"
                                }
                            }
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PrimaryGreen,
                            unfocusedBorderColor = Color(0xFFCBD5E1),
                            focusedContainerColor = Color.White,
                            unfocusedContainerColor = Color.White
                        )
                    )

                    Spacer(modifier = Modifier.width(8.dp))

                    Button(
                        onClick = {
                            if (pincodeInput.length == 6) {
                                appliedPincode = pincodeInput
                                prefs.edit().putString(KEY_SAVED_PINCODE, pincodeInput).apply()
                                isEditing = false
                                focusManager.clearFocus()
                            } else {
                                errorMessage = "कृपया सही 6 अंकों का पिनकोड दर्ज करें"
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.height(52.dp)
                    ) {
                        Text("चेक करें", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                }

                errorMessage?.let { error ->
                    Text(
                        text = error,
                        color = Color.Red,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(top = 4.dp, start = 4.dp)
                    )
                }
            } else {
                // Applied Pincode Badge
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFFEFF8F1))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.LocationOn,
                        contentDescription = "Location",
                        tint = PrimaryGreen,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "पिनकोड: $appliedPincode",
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = PrimaryGreen
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "• $hubName",
                        fontSize = 12.sp,
                        color = Color(0xFF475569)
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Delivery Status & Details
            if (isOutOfStock) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Info, null, tint = Color(0xFFE65100), modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "यह उत्पाद वर्तमान में आउट ऑफ स्टॉक है (स्टॉक आते ही उपलब्ध होगा)",
                        fontSize = 12.sp,
                        color = Color(0xFFE65100),
                        fontWeight = FontWeight.SemiBold
                    )
                }
            } else if (isServiceable) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    // Estimated Delivery Time Box
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color.White)
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(CircleShape)
                                .background(if (isSameDayAvailable) Color(0xFFDCFCE7) else Color(0xFFDBEAFE)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = if (isSameDayAvailable) Icons.Default.Bolt else Icons.Default.Schedule,
                                contentDescription = null,
                                tint = if (isSameDayAvailable) Color(0xFF166534) else Color(0xFF1E40AF),
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        Spacer(modifier = Modifier.width(10.dp))

                        Column {
                            Text(
                                text = if (isSameDayAvailable) "⚡ आज शाम 5:00 बजे तक डिलीवरी (Today Express Delivery)" else "🚚 कल सुबह 10:00 बजे तक डिलीवरी (Tomorrow Morning)",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = if (isSameDayAvailable) Color(0xFF15803D) else Color(0xFF1E3A8A)
                            )
                            Text(
                                text = if (isSameDayAvailable) "दोपहर 2 बजे से पहले ऑर्डर करने पर आज ही उपलब्ध" else "फास्ट वेयरहाउस डिस्पैच गारंटी के साथ",
                                fontSize = 11.sp,
                                color = Color(0xFF64748B)
                            )
                        }
                    }

                    // Key Badges
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // COD Available
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color.White)
                                .padding(horizontal = 8.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.Payments,
                                contentDescription = null,
                                tint = PrimaryGreen,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "कैश ऑन डिलीवरी (COD)",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF334155)
                            )
                        }

                        // Free Delivery
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color.White)
                                .padding(horizontal = 8.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.Verified,
                                contentDescription = null,
                                tint = PrimaryGreen,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "₹499+ पर फ्री डिलीवरी",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF334155)
                            )
                        }
                    }
                }
            } else {
                // Non-serviceable warning
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFFFEF2F2))
                        .padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = null,
                        tint = Color.Red,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "वर्तमान में इस पिनकोड पर डिलीवरी सेवा उपलब्ध नहीं है। कृपया दूसरा पिनकोड चेक करें।",
                        fontSize = 12.sp,
                        color = Color(0xFFB91C1C),
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}
