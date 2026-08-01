package com.company.krishivishal.ui.profile

import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import androidx.compose.ui.res.stringResource
import com.company.krishivishal.R
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.utils.ShareUtils
import com.company.krishivishal.core.util.Resource
import androidx.compose.ui.graphics.Brush
import com.company.krishivishal.ui.theme.SecondaryOrange

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onEditProfileClick: () -> Unit,
    onOrdersClick: () -> Unit,
    onAddressesClick: () -> Unit,
    onWishlistClick: () -> Unit,
    onLogoutClick: () -> Unit,
    onLoginClick: () -> Unit,
    onSupportClick: () -> Unit,
    onSettingsClick: () -> Unit,
    onAdminClick: () -> Unit = {},
    isAdmin: Boolean = false,
    viewModel: ProfileViewModel = hiltViewModel()
) {
    val user by viewModel.user.collectAsState()
    val walletBalanceRes by viewModel.walletBalance.collectAsState()
    val context = LocalContext.current
    var showEditDialog by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.deleteAccountResult.collect { resource ->
            when (resource) {
                is Resource.Success -> {
                    Toast.makeText(context, context.getString(R.string.account_deleted_success), Toast.LENGTH_LONG).show()
                    onLogoutClick()
                }
                is Resource.Error -> {
                    val message = if (resource.message?.contains("recent login", ignoreCase = true) == true) {
                        context.getString(R.string.delete_account_reauth_error)
                    } else {
                        resource.message ?: context.getString(R.string.something_went_wrong)
                    }
                    Toast.makeText(context, message, Toast.LENGTH_LONG).show()
                }
                is Resource.Loading -> {
                    // Show progress if needed
                }
                is Resource.Idle -> {
                    // Nothing to do
                }
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.farmer_profile), fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF5F5F5))
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Profile Header
            Spacer(modifier = Modifier.height(24.dp))
            ProfileHeader(user = user)
            
            if (user == null) {
                Spacer(modifier = Modifier.height(16.dp))
                Button(
                    onClick = onLoginClick,
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(stringResource(R.string.login_register), modifier = Modifier.padding(horizontal = 16.dp))
                }
            } else {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    color = PrimaryGreen.copy(alpha = 0.1f),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Text(
                        text = user?.tier ?: stringResource(R.string.standard_member),
                        color = PrimaryGreen,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
                    )
                }
            }
            
            if (user != null) {
                Spacer(modifier = Modifier.height(16.dp))
                WalletCard(walletBalanceRes)
            }
            
            Spacer(modifier = Modifier.height(32.dp))

            // Referral Card
            if (user != null) {
                ReferralCard(referralCode = user?.referralCode ?: "KRISHI50")
                Spacer(modifier = Modifier.height(24.dp))
            }
            
            // Section 1: Activities
            SectionTitle(stringResource(R.string.my_activity))
            Card(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White)
            ) {
                Column {
                    ProfileOptionItem(Icons.Default.ShoppingBag, stringResource(R.string.orders_history), onOrdersClick)
                    Divider(modifier = Modifier.padding(horizontal = 16.dp), thickness = 0.5.dp)
                    ProfileOptionItem(Icons.Default.Favorite, stringResource(R.string.my_wishlist), onWishlistClick)
                    Divider(modifier = Modifier.padding(horizontal = 16.dp), thickness = 0.5.dp)
                    ProfileOptionItem(Icons.Default.LocationOn, stringResource(R.string.farm_home_addresses), onAddressesClick)
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
            
            // Section 2: Account Settings
            SectionTitle(stringResource(R.string.account_settings))
            Card(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White)
            ) {
                Column {
                    ProfileOptionItem(Icons.Default.Person, stringResource(R.string.edit_account_info)) {
                        if (user != null) showEditDialog = true else onLoginClick()
                    }
                    if (isAdmin) {
                        Divider(modifier = Modifier.padding(horizontal = 16.dp), thickness = 0.5.dp)
                        ProfileOptionItem(Icons.Default.AdminPanelSettings, stringResource(R.string.admin_control_panel), onAdminClick)
                    }
                    Divider(modifier = Modifier.padding(horizontal = 16.dp), thickness = 0.5.dp)
                    ProfileOptionItem(Icons.Default.Settings, stringResource(R.string.app_preferences), onSettingsClick)
                    if (user != null) {
                        Divider(modifier = Modifier.padding(horizontal = 16.dp), thickness = 0.5.dp)
                        ProfileOptionItem(
                            icon = Icons.Default.DeleteForever,
                            title = stringResource(R.string.delete_account_data),
                            onClick = { showDeleteConfirm = true }
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
            
            // Section 3: Support
            SectionTitle(stringResource(R.string.support))
            Card(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White)
            ) {
                Column {
                    ProfileOptionItem(Icons.Default.HeadsetMic, stringResource(R.string.help_center), onSupportClick)
                    Divider(modifier = Modifier.padding(horizontal = 16.dp), thickness = 0.5.dp)
                    ProfileOptionItem(Icons.Default.Share, stringResource(R.string.share_app)) {
                        ShareUtils.shareApp(context)
                    }
                    Divider(modifier = Modifier.padding(horizontal = 16.dp), thickness = 0.5.dp)
                    ProfileOptionItem(Icons.Default.Info, stringResource(R.string.about_app)) { }
                }
            }

            if (user != null) {
                Spacer(modifier = Modifier.height(32.dp))
                TextButton(
                    onClick = {
                        viewModel.logout()
                        onLogoutClick()
                    },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    colors = ButtonDefaults.textButtonColors(contentColor = Color.Red)
                ) {
                    Icon(Icons.Default.Logout, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(stringResource(R.string.secure_logout), fontWeight = FontWeight.Bold)
                }
            }
            
            Spacer(modifier = Modifier.height(48.dp))
        }

        if (showEditDialog && user != null) {
            EditProfileDialog(
                user = user!!,
                onDismiss = { showEditDialog = false },
                onSave = { name, email, phone ->
                    viewModel.updateProfile(name, email, phone)
                    showEditDialog = false
                }
            )
        }

        if (showDeleteConfirm) {
            AlertDialog(
                onDismissRequest = { showDeleteConfirm = false },
                title = { Text(stringResource(R.string.delete_account_confirm_title)) },
                text = { Text(stringResource(R.string.delete_account_confirm_msg)) },
                confirmButton = {
                    Button(
                        onClick = {
                            viewModel.deleteAccount()
                            showDeleteConfirm = false
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color.Red)
                    ) {
                        Text(stringResource(R.string.delete_account))
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showDeleteConfirm = false }) {
                        Text(stringResource(R.string.cancel))
                    }
                }
            )
        }
    }
}

@Composable
fun ProfileHeader(user: com.company.krishivishal.core.model.User?) {
    Box(
        modifier = Modifier
            .size(110.dp)
            .clip(CircleShape)
            .background(Color.White)
            .padding(4.dp)
            .clip(CircleShape)
            .background(Color(0xFFEEEEEE)),
        contentAlignment = Alignment.Center
    ) {
        if (user?.imageUrl != null) {
            AsyncImage(
                model = user.imageUrl,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        } else {
            Icon(Icons.Default.Person, contentDescription = null, modifier = Modifier.size(60.dp), tint = Color.LightGray)
        }
        
        // Edit Icon Overlay
        Surface(
            modifier = Modifier.align(Alignment.BottomEnd).offset(x = (-4).dp, y = (-4).dp),
            shape = CircleShape,
            color = PrimaryGreen,
            shadowElevation = 4.dp
        ) {
            Icon(
                Icons.Default.CameraAlt,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.padding(6.dp).size(14.dp)
            )
        }
    }
    
    Spacer(modifier = Modifier.height(16.dp))
    Text(
        text = if (user != null && user.name.isNotEmpty()) user.name else "Kisan Guest",
        fontSize = 22.sp,
        fontWeight = FontWeight.Bold
    )
    Text(
        text = user?.email ?: user?.phone ?: "Krishi Vishal Member",
        fontSize = 14.sp,
        color = Color.Gray
    )
}

@Composable
fun SectionTitle(title: String) {
    Text(
        text = title,
        fontSize = 14.sp,
        fontWeight = FontWeight.Bold,
        color = Color.Gray,
        modifier = Modifier.fillMaxWidth().padding(start = 24.dp, bottom = 8.dp)
    )
}

@Composable
fun ProfileOptionItem(icon: ImageVector, title: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable { onClick() }.padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(
            color = PrimaryGreen.copy(alpha = 0.1f),
            shape = RoundedCornerShape(8.dp)
        ) {
            Icon(icon, contentDescription = null, tint = PrimaryGreen, modifier = Modifier.padding(8.dp).size(20.dp))
        }
        Spacer(modifier = Modifier.width(16.dp))
        Text(text = title, fontSize = 15.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Color.LightGray)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReferralCard(referralCode: String) {
    val context = LocalContext.current
    val gradient = Brush.horizontalGradient(listOf(PrimaryGreen, Color(0xFF388E3C)))

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(4.dp)
    ) {
        Column(
            modifier = Modifier
                .background(gradient)
                .padding(16.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CardGiftcard, null, tint = Color.White, modifier = Modifier.size(32.dp))
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        stringResource(R.string.refer_earn),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                    Text(
                        stringResource(R.string.refer_desc),
                        color = Color.White.copy(alpha = 0.9f),
                        fontSize = 12.sp,
                        lineHeight = 16.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
                    .border(1.dp, Color.White.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
                    .padding(8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(stringResource(R.string.refer_code_label), color = Color.White.copy(alpha = 0.8f), fontSize = 10.sp)
                    Text(referralCode, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                }
                Row {
                    TextButton(
                        onClick = {
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            val clip = android.content.ClipData.newPlainText("Referral Code", referralCode)
                            clipboard.setPrimaryClip(clip)
                        }
                    ) {
                        Text(stringResource(R.string.copy_code), color = Color.White, fontWeight = FontWeight.Bold)
                    }
                    Button(
                        onClick = {
                            val msg = context.getString(R.string.referral_msg, referralCode)
                            val sendIntent: android.content.Intent = android.content.Intent().apply {
                                action = android.content.Intent.ACTION_SEND
                                putExtra(android.content.Intent.EXTRA_TEXT, msg)
                                type = "text/plain"
                            }
                            val shareIntent = android.content.Intent.createChooser(sendIntent, null)
                            context.startActivity(shareIntent)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = SecondaryOrange),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(stringResource(R.string.share_code), fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditProfileDialog(
    user: com.company.krishivishal.core.model.User,
    onDismiss: () -> Unit,
    onSave: (String, String, String) -> Unit
) {
    var name by remember { mutableStateOf(user.name) }
    var email by remember { mutableStateOf(user.email ?: "") }
    var phone by remember { mutableStateOf(user.phone ?: "") }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Text(stringResource(R.string.edit_information), fontWeight = FontWeight.Bold, fontSize = 20.sp)
                Spacer(modifier = Modifier.height(16.dp))
                
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(stringResource(R.string.full_name)) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text(stringResource(R.string.email_address)) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text(stringResource(R.string.mobile_number)) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )
                
                Spacer(modifier = Modifier.height(24.dp))
                
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
                    Button(
                        onClick = { onSave(name, email, phone) },
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(stringResource(R.string.update_profile))
                    }
                }
            }
        }
    }
}


@Composable
fun WalletCard(balanceRes: Resource<Double>) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1B5E20))
    ) {
        Row(
            modifier = Modifier.padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text("Krishi Wallet", color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp)
                when (balanceRes) {
                    is Resource.Success<Double> -> {
                        Text("₹${balanceRes.data?.toInt() ?: 0}", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black)
                    }
                    is Resource.Loading -> {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                    }
                    else -> {
                        Text("₹0", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black)
                    }
                }
            }
            Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = Color.White, modifier = Modifier.size(40.dp))
        }
    }
}
