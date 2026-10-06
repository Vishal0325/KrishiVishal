package com.company.krishivishal.ui.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Help
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.company.krishivishal.core.model.Address
import com.company.krishivishal.core.model.User
import com.company.krishivishal.ui.navigation.Screen
import android.widget.Toast
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString

@Composable
fun ProfileScreen(
    navController: NavController,
    modifier: Modifier = Modifier,
    profileViewModel: ProfileViewModel = hiltViewModel()
) {
    val userProfile by profileViewModel.userProfile.collectAsState()
    val defaultAddress by profileViewModel.defaultAddress.collectAsState()
    val totalOrders by profileViewModel.totalOrdersCount.collectAsState()
    val wishlistItems by profileViewModel.wishlistItemsCount.collectAsState()
    val isAdmin by profileViewModel.isAdmin.collectAsState()
    val walletBalanceRes by profileViewModel.walletBalance.collectAsState()
    val walletBalance = (walletBalanceRes as? com.company.krishivishal.core.util.Resource.Success)?.data ?: 0.0
    val vleProfile by profileViewModel.vleProfile.collectAsState()
    val isVleLoading by profileViewModel.isVleLoading.collectAsState()
    var showVleDialog by remember { mutableStateOf(false) }
    val context = LocalContext.current

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface)
    ) {
        item {
            ProfileHeader(
                user = userProfile,
                defaultAddress = defaultAddress,
                onEditClick = { navController.navigate("editProfile") }
            )
        }

        item {
            QuickStatsRow(
                totalOrders = totalOrders,
                wishlistItems = wishlistItems,
                walletBalance = walletBalance,
                onWalletClick = { navController.navigate(Screen.Wallet.route) }
            )
        }

        item {
            FarmProfileSummaryCard(
                user = userProfile,
                onClick = { navController.navigate(Screen.FarmProfile.route) }
            )
        }

        item {
            KisanMitraSummaryCard(
                vleProfile = vleProfile,
                onClick = { showVleDialog = true }
            )
        }

        item {
            val menuItems = remember(isAdmin) {
                val baseItems = mutableListOf(
                    MenuOption("Mera Khet & Fasal (Farm Profile)", Icons.Default.Agriculture, Screen.FarmProfile.route),
                    MenuOption("My Wallet", Icons.Default.AccountBalanceWallet, Screen.Wallet.route),
                    MenuOption("Refer & Earn", Icons.Default.CardGiftcard, Screen.Referral.route),
                    MenuOption("Orders", Icons.Default.Inventory, Screen.Orders.route),
                    MenuOption("My Returns", Icons.Default.Refresh, Screen.MyReturns.route),
                    MenuOption("Saved Addresses", Icons.Default.LocationOn, Screen.Address.route),
                    MenuOption("Wishlist", Icons.Default.Favorite, Screen.Wishlist.route),
                    MenuOption("Notifications", Icons.Default.Notifications, Screen.Notifications.route),
                    MenuOption("Help & Support", Icons.AutoMirrored.Filled.Help, Screen.Support.route),
                    MenuOption("Settings", Icons.Default.Settings, Screen.Settings.route)
                )
                baseItems
            }
            MenuOptionsList(
                navController = navController,
                items = menuItems
            )
        }

        item {
            LogoutButton(
                onLogoutConfirm = {
                    profileViewModel.logout()
                    navController.navigate("login") {
                        popUpTo(0) // Clear back stack
                    }
                }
            )
        }
    }

    if (showVleDialog) {
        KisanMitraRegistrationDialog(
            vleProfile = vleProfile,
            isLoading = isVleLoading,
            defaultPincode = defaultAddress?.pincode ?: "",
            onDismiss = { showVleDialog = false },
            onRegister = { village, panchayat, pin, hub, acc, ifsc, pan ->
                profileViewModel.registerAsKisanMitra(village, panchayat, pin, hub, acc, ifsc, pan) { success, msg ->
                    Toast.makeText(context, msg ?: if (success) "सफल!" else "त्रुटि", Toast.LENGTH_LONG).show()
                }
            }
        )
    }
}

@Composable
fun ProfileHeader(
    user: User?,
    defaultAddress: Address?,
    onEditClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val displayName = user?.name?.takeIf { it.isNotBlank() } ?: "KrishiVishal User"
    val displayPhone = user?.phone?.takeIf { it.isNotBlank() } ?: "Phone not registered"
    val locationText = if (defaultAddress != null) {
        val parts = listOfNotNull(
            defaultAddress.district.ifBlank { null },
            defaultAddress.state.ifBlank { null }
        )
        if (parts.isNotEmpty()) parts.joinToString(", ") else (user?.location?.ifBlank { "Bihar, India" } ?: "Bihar, India")
    } else {
        user?.location?.takeIf { it.isNotBlank() } ?: "Bihar, India"
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Avatar (56dp circle)
            Surface(
                modifier = Modifier.size(56.dp),
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primary
            ) {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = null,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(14.dp),
                    tint = MaterialTheme.colorScheme.onPrimary
                )
            }

            // User Info (Column)
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = displayName,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = displayPhone,
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp)
                )
                
                Text(
                    text = locationText,
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }

            // Edit Button (32dp square)
            IconButton(
                onClick = onEditClick,
                modifier = Modifier
                    .size(32.dp)
                    .border(0.5.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(0.dp))
            ) {
                Icon(
                    imageVector = Icons.Default.Edit,
                    contentDescription = "Edit profile",
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurface
                )
            }
        }

        HorizontalDivider(
            thickness = 0.5.dp,
            color = MaterialTheme.colorScheme.outlineVariant
        )
    }
}

@Composable
fun QuickStatsRow(
    totalOrders: Int,
    wishlistItems: Int,
    walletBalance: Double = 0.0,
    onWalletClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp, horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            StatCard(
                number = totalOrders.toString(),
                label = "Total Orders",
                modifier = Modifier.weight(1f)
            )
            StatCard(
                number = wishlistItems.toString(),
                label = "Wishlist",
                modifier = Modifier.weight(1f)
            )
            // Wallet balance chip — clickable
            Surface(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { onWalletClick() },
                color = androidx.compose.ui.graphics.Color(0xFFE8F5E9),
                shape = RoundedCornerShape(8.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "₹${String.format("%.0f", walletBalance)}",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Medium,
                        color = androidx.compose.ui.graphics.Color(0xFF2E7D32)
                    )
                    Text(
                        text = "Wallet",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
        }

        HorizontalDivider(
            thickness = 0.5.dp,
            color = MaterialTheme.colorScheme.outlineVariant
        )
    }
}

@Composable
fun FarmProfileSummaryCard(
    user: User?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val totalLand = user?.totalLand ?: 0.0
    val unit = user?.landUnit?.ifBlank { "Katha" } ?: "Katha"
    val crops = user?.cropAllocations ?: emptyList()
    val totalAllocated = crops.sumOf { it.allocatedArea }
    val hasData = totalLand > 0.0 || crops.isNotEmpty()

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 8.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFFF1F8E9) // Soft light green
        ),
        border = BorderStroke(1.dp, Color(0xFFC8E6C9))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFF2E7D32),
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Agriculture,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier
                                .padding(8.dp)
                                .fillMaxSize()
                        )
                    }
                    Column {
                        Text(
                            text = "मेरा खेत और फसल",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = Color(0xFF1B5E20)
                        )
                        Text(
                            text = "Farm & Crop Profile",
                            fontSize = 11.sp,
                            color = Color(0xFF388E3C)
                        )
                    }
                }

                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = "Open Farm Profile",
                    tint = Color(0xFF2E7D32),
                    modifier = Modifier.size(20.dp)
                )
            }

            if (hasData) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = Color.White.copy(alpha = 0.85f),
                        modifier = Modifier.weight(1f)
                    ) {
                        Column(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Text("Total Land", fontSize = 10.sp, color = Color(0xFF558B2F))
                            Text(
                                text = "${String.format("%.1f", totalLand)} $unit",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = Color(0xFF1B5E20)
                            )
                        }
                    }

                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = Color.White.copy(alpha = 0.85f),
                        modifier = Modifier.weight(1f)
                    ) {
                        Column(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Text("Crops Registered", fontSize = 10.sp, color = Color(0xFF558B2F))
                            Text(
                                text = "${crops.size} Crops (${String.format("%.1f", totalAllocated)} $unit)",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = Color(0xFF1B5E20),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
            } else {
                Text(
                    text = "ज़मीन और बोई गई फसलें जोड़ें — मौसम व कीट संबंधित सटीक सलाह पाएं →",
                    fontSize = 12.sp,
                    color = Color(0xFF2E7D32),
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@Composable
fun StatCard(
    number: String,
    label: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp)),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f), // Light surface
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = number,
                fontSize = 20.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = label,
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp)
            )
        }
    }
}

@Composable
fun MenuOptionsList(
    navController: NavController,
    items: List<MenuOption>,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 16.dp)
    ) {
        items.forEachIndexed { index, item ->
            MenuOptionItem(
                icon = item.icon,
                label = item.label,
                onClick = {
                    navController.navigate(item.route)
                },
                showBorder = index < items.size - 1
            )
        }

        HorizontalDivider(
            thickness = 0.5.dp,
            color = MaterialTheme.colorScheme.outlineVariant,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
fun MenuOptionItem(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    showBorder: Boolean = true,
    modifier: Modifier = Modifier
) {
    Column {
        Row(
            modifier = modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(vertical = 12.dp, horizontal = 20.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = label,
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Normal
                )
            }

            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = MaterialTheme.colorScheme.outline
            )
        }

        if (showBorder) {
            HorizontalDivider(
                modifier = Modifier.fillMaxWidth(),
                thickness = 0.5.dp,
                color = MaterialTheme.colorScheme.outlineVariant
            )
        }
    }
}

@Composable
fun LogoutButton(
    onLogoutConfirm: () -> Unit,
    modifier: Modifier = Modifier
) {
    var showDialog by remember { mutableStateOf(false) }

    if (showDialog) {
        AlertDialog(
            onDismissRequest = { showDialog = false },
            title = { Text("Logout?") },
            text = { Text("Are you sure you want to logout?") },
            confirmButton = {
                TextButton(onClick = {
                    showDialog = false
                    onLogoutConfirm()
                }) {
                    Text("Logout", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        OutlinedButton(
            onClick = { showDialog = true },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(
                containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.1f), // --bg-danger red tint
                contentColor = MaterialTheme.colorScheme.error // --text-danger
            ),
            border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.5f)), // --border-danger
            shape = RoundedCornerShape(8.dp),
            contentPadding = PaddingValues(vertical = 10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Logout,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Logout",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

data class MenuOption(
    val label: String,
    val icon: ImageVector,
    val route: String
)

@Composable
fun KisanMitraSummaryCard(
    vleProfile: Map<String, Any>?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val clipboardManager = LocalClipboardManager.current
    val context = LocalContext.current

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        color = if (vleProfile != null) Color(0xFFF1F8E9) else Color(0xFFFFF8E1),
        border = BorderStroke(
            1.dp,
            if (vleProfile != null) Color(0xFFAED581) else Color(0xFFFFD54F)
        ),
        shadowElevation = 1.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = if (vleProfile != null) Color(0xFFDCEDC8) else Color(0xFFFFECB3),
                        modifier = Modifier.size(38.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Default.VolunteerActivism,
                                contentDescription = null,
                                tint = if (vleProfile != null) Color(0xFF2E7D32) else Color(0xFFF57F17),
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }

                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = if (vleProfile != null) "किसान मित्र पार्टनर" else "किसान मित्र बनें",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = if (vleProfile != null) Color(0xFF1B5E20) else Color(0xFFE65100)
                            )
                            if (vleProfile != null) {
                                val kyc = vleProfile["kycStatus"] as? String ?: "PENDING"
                                Spacer(modifier = Modifier.width(6.dp))
                                Surface(
                                    color = if (kyc == "VERIFIED") Color(0xFFC8E6C9) else Color(0xFFFFE0B2),
                                    shape = RoundedCornerShape(4.dp)
                                ) {
                                    Text(
                                        text = kyc,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = if (kyc == "VERIFIED") Color(0xFF2E7D32) else Color(0xFFE65100)
                                    )
                                }
                            }
                        }
                        Text(
                            text = if (vleProfile != null)
                                "गाँव स्तर पर कमीशन व आर्डर पार्टनर"
                            else
                                "2% से 5% तक रिकरिंग कमीशन कमाएं",
                            fontSize = 11.sp,
                            color = if (vleProfile != null) Color(0xFF388E3C) else Color(0xFFF57F17)
                        )
                    }
                }

                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = "Details",
                    tint = if (vleProfile != null) Color(0xFF2E7D32) else Color(0xFFE65100),
                    modifier = Modifier.size(20.dp)
                )
            }

            if (vleProfile != null) {
                val code = vleProfile["vleCode"] as? String ?: ""
                val gmv = (vleProfile["totalGmvGenerated"] as? Number)?.toDouble() ?: 0.0
                val comm = (vleProfile["totalCommissionEarned"] as? Number)?.toDouble() ?: 0.0

                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = Color.White.copy(alpha = 0.9f),
                        modifier = Modifier.weight(1.2f).clickable {
                            clipboardManager.setText(AnnotatedString(code))
                            Toast.makeText(context, "कोड कॉपी हो गया: $code", Toast.LENGTH_SHORT).show()
                        }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text("आपका कोड", fontSize = 9.sp, color = Color.Gray)
                                Text(code, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp, color = Color(0xFF1B5E20))
                            }
                            Icon(Icons.Default.ContentCopy, contentDescription = "Copy", tint = Color(0xFF2E7D32), modifier = Modifier.size(16.dp))
                        }
                    }

                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = Color.White.copy(alpha = 0.9f),
                        modifier = Modifier.weight(1f)
                    ) {
                        Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)) {
                            Text("कुल GMV", fontSize = 9.sp, color = Color.Gray)
                            Text("₹${gmv.toInt()}", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color.DarkGray)
                        }
                    }

                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = Color.White.copy(alpha = 0.9f),
                        modifier = Modifier.weight(1f)
                    ) {
                        Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)) {
                            Text("कमीशन", fontSize = 9.sp, color = Color.Gray)
                            Text("₹${comm.toInt()}", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color(0xFF2E7D32))
                        }
                    }
                }
            } else {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "अपने गाँव के किसानों को बीज व खाद मंगवाने में मदद करें। अभी रजिस्टर करें →",
                    fontSize = 11.sp,
                    color = Color(0xFFE65100),
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@Composable
fun KisanMitraRegistrationDialog(
    vleProfile: Map<String, Any>?,
    isLoading: Boolean,
    defaultPincode: String,
    onDismiss: () -> Unit,
    onRegister: (village: String, panchayat: String, pincode: String, hubId: String, bankAccountNo: String, ifscCode: String, panNumber: String) -> Unit
) {
    var village by remember { mutableStateOf("") }
    var panchayat by remember { mutableStateOf("") }
    var pincode by remember { mutableStateOf(defaultPincode) }
    var hubId by remember { mutableStateOf("hub_central_samastipur") }
    var bankAccountNo by remember { mutableStateOf("") }
    var ifscCode by remember { mutableStateOf("") }
    var panNumber by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.VolunteerActivism, contentDescription = null, tint = Color(0xFF2E7D32))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    if (vleProfile != null) "किसान मित्र प्रोफाइल" else "किसान मित्र पार्टनर रजिस्ट्रेशन",
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        },
        text = {
            if (vleProfile != null) {
                // View Profile Details
                val code = vleProfile["vleCode"] as? String ?: ""
                val kyc = vleProfile["kycStatus"] as? String ?: "PENDING"
                val villageVal = vleProfile["village"] as? String ?: ""
                val panchayatVal = vleProfile["panchayat"] as? String ?: ""
                val hubVal = vleProfile["hubId"] as? String ?: ""
                val bank = (vleProfile["bankAccountNo"] as? String)?.takeLast(4) ?: "XXXX"

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Surface(
                        color = Color(0xFFE8F5E9),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text("पार्टनर कोड: $code", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color(0xFF1B5E20))
                            Text("KYC स्टेटस: $kyc", fontWeight = FontWeight.SemiBold, fontSize = 12.sp, color = if (kyc == "VERIFIED") Color(0xFF2E7D32) else Color(0xFFE65100))
                        }
                    }

                    Text("📍 गाँव / पंचायत: $villageVal, $panchayatVal", fontSize = 13.sp)
                    Text("🏢 असाइन्ड हब: $hubVal", fontSize = 13.sp)
                    Text("🏦 बैंक खाता: Ending with ****$bank", fontSize = 13.sp)
                    Text(
                        "हर सोमवार परिपक्व कमीशन सीधे आपके बैंक खाते में भेजा जाता है।",
                        fontSize = 11.sp,
                        color = Color.Gray
                    )
                }
            } else {
                // Registration Form
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        "खाद पर 1.5%, बीज पर 3.5%, व कीटनाशक पर 5% तक आजीवन कमीशन पाएं।",
                        fontSize = 11.sp,
                        color = Color(0xFF2E7D32),
                        fontWeight = FontWeight.Medium
                    )

                    OutlinedTextField(
                        value = village,
                        onValueChange = { village = it },
                        label = { Text("गाँव (Village)", fontSize = 12.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = panchayat,
                        onValueChange = { panchayat = it },
                        label = { Text("पंचायत (Panchayat)", fontSize = 12.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = pincode,
                        onValueChange = { pincode = it },
                        label = { Text("पिनकोड (Pincode)", fontSize = 12.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = bankAccountNo,
                        onValueChange = { bankAccountNo = it },
                        label = { Text("बैंक खाता संख्या (A/C No.)", fontSize = 12.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = ifscCode,
                        onValueChange = { ifscCode = it.uppercase() },
                        label = { Text("IFSC कोड", fontSize = 12.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = panNumber,
                        onValueChange = { panNumber = it.uppercase() },
                        label = { Text("पैन कार्ड संख्या (PAN)", fontSize = 12.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }
            }
        },
        confirmButton = {
            if (vleProfile == null) {
                val canSubmit = village.isNotBlank() && panchayat.isNotBlank() &&
                        bankAccountNo.isNotBlank() && ifscCode.isNotBlank() && !isLoading
                Button(
                    onClick = {
                        onRegister(village, panchayat, pincode, hubId, bankAccountNo, ifscCode, panNumber)
                        onDismiss()
                    },
                    enabled = canSubmit,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                    } else {
                        Text("रजिस्टर करें")
                    }
                }
            } else {
                Button(onClick = onDismiss, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))) {
                    Text("ठीक है")
                }
            }
        },
        dismissButton = {
            if (vleProfile == null) {
                TextButton(onClick = onDismiss) {
                    Text("रद्द करें")
                }
            }
        }
    )
}

