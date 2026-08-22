package com.company.krishivishal.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.appcompat.app.AppCompatDelegate
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.utils.LocaleManager

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    var notificationsEnabled by remember { mutableStateOf(true) }
    val isDarkMode by viewModel.isDarkMode.collectAsState()
    
    val currentLocale = AppCompatDelegate.getApplicationLocales().get(0)?.language ?: "en"
    var selectedLanguage by remember { mutableStateOf(if (currentLocale == "hi") "Hindi (हिंदी)" else "English") }
    var showLanguageDialog by remember { mutableStateOf(false) }

    if (showLanguageDialog) {
        LanguageSelectionDialog(
            currentLanguage = currentLocale,
            onDismiss = { showLanguageDialog = false },
            onLanguageSelected = { langCode ->
                com.company.krishivishal.utils.LocaleManager.setLocale(context, langCode)
                selectedLanguage = if (langCode == "hi") "Hindi (हिंदी)" else "English"
                showLanguageDialog = false
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings & Preferences", fontWeight = FontWeight.Bold) },
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
        ) {
            item {
                SettingsHeader("App Notifications")
            }
            item {
                SettingsSwitchItem(
                    icon = Icons.Default.Notifications,
                    title = "Order Updates",
                    subtitle = "Get notified about your orders",
                    checked = notificationsEnabled,
                    onCheckedChange = { notificationsEnabled = it }
                )
            }
            item {
                SettingsSwitchItem(
                    icon = Icons.Default.Campaign,
                    title = "Promotions & Offers",
                    subtitle = "Learn about new harvest and deals",
                    checked = true,
                    onCheckedChange = { }
                )
            }

            item {
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                SettingsHeader("Display & Content")
            }
            item {
                SettingsClickItem(
                    icon = Icons.Default.Language,
                    title = "Preferred Language",
                    value = selectedLanguage,
                    onClick = { showLanguageDialog = true }
                )
            }
            item {
                SettingsSwitchItem(
                    icon = Icons.Default.DarkMode,
                    title = "Dark Mode",
                    subtitle = "Turn on dark theme for a better night experience",
                    checked = isDarkMode,
                    onCheckedChange = { viewModel.toggleDarkMode(it) }
                )
            }

            item {
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                SettingsHeader("Support & Safety")
            }
            item {
                val context = androidx.compose.ui.platform.LocalContext.current
                SettingsClickItem(
                    icon = Icons.Default.History,
                    title = "Data Usage & Privacy",
                    value = "",
                    onClick = { android.widget.Toast.makeText(context, "Your data is encrypted and secure with Firebase Cloud", android.widget.Toast.LENGTH_LONG).show() }
                )
            }
            item {
                val context = androidx.compose.ui.platform.LocalContext.current
                SettingsClickItem(
                    icon = Icons.Default.VerifiedUser,
                    title = "Version Details",
                    value = "v2.1.0",
                    onClick = { android.widget.Toast.makeText(context, "Krishi Vishal v2.1.0 (Latest Release)", android.widget.Toast.LENGTH_SHORT).show() }
                )
            }
            
            item {
                Spacer(modifier = Modifier.height(48.dp))
                Text(
                    "© 2026 Krishi Vishal Pvt. Ltd.",
                    modifier = Modifier.fillMaxWidth(),
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
        color = PrimaryGreen,
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
                colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = PrimaryGreen)
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

@Composable
fun LanguageSelectionDialog(
    currentLanguage: String,
    onDismiss: () -> Unit,
    onLanguageSelected: (String) -> Unit
) {
    val languages = listOf(
        "en" to "English",
        "hi" to "Hindi (हिंदी)"
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Select Language", fontWeight = FontWeight.Bold) },
        text = {
            Column(Modifier.selectableGroup()) {
                languages.forEach { (code, name) ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .height(56.dp)
                            .selectable(
                                selected = (code == currentLanguage),
                                onClick = { onLanguageSelected(code) },
                                role = Role.RadioButton
                            )
                            .padding(horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = (code == currentLanguage),
                            onClick = null
                        )
                        Text(
                            text = name,
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.padding(start = 16.dp)
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
