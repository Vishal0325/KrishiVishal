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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.company.krishivishal.core.model.Address
import com.company.krishivishal.core.model.User
import com.company.krishivishal.ui.navigation.Screen

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
                wishlistItems = wishlistItems
            )
        }

        item {
            MenuOptionsList(
                navController = navController,
                items = listOf(
                    MenuOption("Orders", Icons.Default.Inventory, Screen.Orders.route),
                    MenuOption("My Returns", Icons.Default.Refresh, Screen.MyReturns.route),
                    MenuOption("Saved Addresses", Icons.Default.LocationOn, Screen.Address.route),
                    MenuOption("Wishlist", Icons.Default.Favorite, Screen.Wishlist.route),
                    MenuOption("Notifications", Icons.Default.Notifications, Screen.Notifications.route),
                    MenuOption("Help & Support", Icons.AutoMirrored.Filled.Help, Screen.Support.route),
                    MenuOption("Settings", Icons.Default.Settings, Screen.Settings.route)
                )
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
}

@Composable
fun ProfileHeader(
    user: User?,
    defaultAddress: Address?,
    onEditClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (user == null) return

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
                    text = user.name.ifBlank { "Vishal Kumar" },
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = user.phone ?: "+91 95555 12345",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp)
                )
                
                val locationText = if (defaultAddress != null) {
                    val parts = listOfNotNull(
                        defaultAddress.district.ifBlank { null },
                        defaultAddress.state.ifBlank { null }
                    )
                    if (parts.isNotEmpty()) parts.joinToString(", ") else user.location
                } else {
                    user.location
                }
                
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
                label = "Wishlist Items",
                modifier = Modifier.weight(1f)
            )
        }

        HorizontalDivider(
            thickness = 0.5.dp,
            color = MaterialTheme.colorScheme.outlineVariant
        )
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
