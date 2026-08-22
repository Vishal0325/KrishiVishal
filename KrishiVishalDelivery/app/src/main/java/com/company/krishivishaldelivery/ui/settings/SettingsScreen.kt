package com.company.krishivishaldelivery.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onNavigateBack: () -> Unit) {
    var notificationsEnabled by remember { mutableStateOf(true) }
    var locationSharing by remember { mutableStateOf(true) }
    var selectedLanguage by remember { mutableStateOf("English") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("App Settings", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF2E7D32),
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            item {
                SettingsHeader("General")
            }
            item {
                SettingsSwitchItem(
                    icon = Icons.Default.Notifications,
                    title = "Push Notifications",
                    subtitle = "Get updates about new orders",
                    checked = notificationsEnabled,
                    onCheckedChange = { notificationsEnabled = it }
                )
            }
            item {
                SettingsSwitchItem(
                    icon = Icons.Default.MyLocation,
                    title = "Background Location",
                    subtitle = "Allow tracking while online",
                    checked = locationSharing,
                    onCheckedChange = { locationSharing = it }
                )
            }

            item {
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                SettingsHeader("Preferences")
            }
            item {
                SettingsClickItem(
                    icon = Icons.Default.Language,
                    title = "App Language",
                    value = selectedLanguage,
                    onClick = { /* Logic to show language picker */ }
                )
            }
            item {
                SettingsClickItem(
                    icon = Icons.Default.Brightness6,
                    title = "Theme",
                    value = "System Default",
                    onClick = { /* Logic to change theme */ }
                )
            }

            item {
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                SettingsHeader("About")
            }
            item {
                SettingsClickItem(
                    icon = Icons.Default.Info,
                    title = "App Version",
                    value = "v1.0.4",
                    onClick = {}
                )
            }
            item {
                SettingsClickItem(
                    icon = Icons.Default.PrivacyTip,
                    title = "Privacy Policy",
                    value = "",
                    onClick = {}
                )
            }
            
            item {
                Spacer(modifier = Modifier.height(32.dp))
                Text(
                    "Made with ❤️ in India for Krishi Vishal",
                    modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    color = Color.Gray,
                    fontSize = 12.sp
                )
            }
        }
    }
}

@Composable
fun SettingsHeader(title: String) {
    Text(
        text = title,
        color = Color(0xFF2E7D32),
        fontWeight = FontWeight.Bold,
        fontSize = 14.sp,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)
    )
}

@Composable
fun SettingsSwitchItem(
    icon: ImageVector,
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    ListItem(
        headlineContent = { Text(title, fontWeight = FontWeight.Medium) },
        supportingContent = { Text(subtitle, fontSize = 12.sp, color = Color.Gray) },
        leadingContent = { Icon(icon, contentDescription = null, tint = Color.Gray) },
        trailingContent = {
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = Color(0xFF2E7D32))
            )
        }
    )
}

@Composable
fun SettingsClickItem(
    icon: ImageVector,
    title: String,
    value: String,
    onClick: () -> Unit
) {
    ListItem(
        modifier = Modifier.clickable { onClick() },
        headlineContent = { Text(title, fontWeight = FontWeight.Medium) },
        leadingContent = { Icon(icon, contentDescription = null, tint = Color.Gray) },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (value.isNotEmpty()) {
                    Text(value, color = Color.Gray, fontSize = 14.sp, modifier = Modifier.padding(end = 8.dp))
                }
                Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Color.LightGray)
            }
        }
    )
}
