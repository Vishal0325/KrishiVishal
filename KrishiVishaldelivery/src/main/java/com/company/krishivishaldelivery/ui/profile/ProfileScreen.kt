package com.company.krishivishaldelivery.ui.profile

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishaldelivery.R
import com.company.krishivishaldelivery.ui.dashboard.DeliveryViewModel
import com.company.krishivishal.core.util.Resource
import com.google.firebase.auth.FirebaseAuth

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onLogout: () -> Unit,
    onSettingsClick: () -> Unit,
    viewModel: DeliveryViewModel = hiltViewModel()
) {
    val auth = FirebaseAuth.getInstance()
    val riderResource by viewModel.riderProfile.collectAsState()
    var showEditDialog by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        viewModel.deleteAccountResult.collect { resource ->
            when (resource) {
                is Resource.Success -> {
                    Toast.makeText(context, context.getString(R.string.account_deleted_success), Toast.LENGTH_LONG).show()
                    onLogout()
                }
                is Resource.Error -> {
                    val message = if (resource.message?.contains("recent login", ignoreCase = true) == true) {
                        context.getString(R.string.delete_account_reauth_error)
                    } else {
                        resource.message ?: "Something went wrong"
                    }
                    Toast.makeText(context, message, Toast.LENGTH_LONG).show()
                }
                else -> {}
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My Profile", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF2E7D32), titleContentColor = Color.White)
            )
        }
    ) { padding ->
        val rider = (riderResource as? Resource.Success)?.data

        LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
            item {
                Column(modifier = Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(modifier = Modifier.size(100.dp).clip(CircleShape).background(Color.LightGray), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Person, contentDescription = null, modifier = Modifier.size(60.dp), tint = Color.Gray)
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(rider?.name ?: "Rider", fontWeight = FontWeight.Bold, fontSize = 20.sp)
                    Text("ID: ${rider?.id?.takeLast(6) ?: "XXXX"}", color = Color.Gray, fontSize = 14.sp)
                }
            }

            item {
                ProfileOption(Icons.Default.AccountBalance, "Bank Details", rider?.bankAccount ?: "Add Account") { showEditDialog = true }
                ProfileOption(Icons.Default.DirectionsBike, "Vehicle Details", "${rider?.vehicleType}: ${rider?.vehicleNumber}") { showEditDialog = true }
                ProfileOption(Icons.Default.Settings, "App Settings", "Theme, Notifications") { onSettingsClick() }
                ProfileOption(Icons.Default.DeleteForever, stringResource(R.string.delete_account_data), "Permanent removal") { showDeleteConfirm = true }
                
                Spacer(modifier = Modifier.height(32.dp))
                Button(
                    onClick = { auth.signOut(); onLogout() },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp).height(50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color.Red.copy(alpha = 0.1f)),
                    shape = RoundedCornerShape(12.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color.Red.copy(alpha = 0.5f))
                ) {
                    Text("Logout", color = Color.Red, fontWeight = FontWeight.Bold)
                }
            }
        }

        if (showEditDialog) {
            EditProfileDialog(
                rider = rider,
                onDismiss = { showEditDialog = false },
                onSave = { name, acc, bName, ifsc, vNum, vType ->
                    viewModel.updateProfile(name, acc, bName, ifsc, vNum, vType)
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
fun EditProfileDialog(
    rider: com.company.krishivishaldelivery.data.model.Rider?,
    onDismiss: () -> Unit,
    onSave: (String, String, String, String, String, String) -> Unit
) {
    var name by remember { mutableStateOf(rider?.name ?: "") }
    var bankAccount by remember { mutableStateOf(rider?.bankAccount ?: "") }
    var bankName by remember { mutableStateOf(rider?.bankName ?: "") }
    var ifscCode by remember { mutableStateOf(rider?.ifscCode ?: "") }
    var vehicleNumber by remember { mutableStateOf(rider?.vehicleNumber ?: "") }
    var vehicleType by remember { mutableStateOf(rider?.vehicleType ?: "BIKE") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Profile") },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item { OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }) }
                item { OutlinedTextField(value = bankAccount, onValueChange = { bankAccount = it }, label = { Text("Bank Account") }) }
                item { OutlinedTextField(value = bankName, onValueChange = { bankName = it }, label = { Text("Bank Name") }) }
                item { OutlinedTextField(value = ifscCode, onValueChange = { ifscCode = it }, label = { Text("IFSC") }) }
                item { OutlinedTextField(value = vehicleNumber, onValueChange = { vehicleNumber = it }, label = { Text("Vehicle Number (BR01XX1234)") }) }
                item {
                    Text("Vehicle Type", style = MaterialTheme.typography.labelMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("BIKE", "SCOOTER", "CYCLE").forEach { type ->
                            FilterChip(selected = vehicleType == type, onClick = { vehicleType = type }, label = { Text(type) })
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = { onSave(name, bankAccount, bankName, ifscCode, vehicleNumber, vehicleType) }) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun ProfileOption(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(title, fontWeight = FontWeight.Medium) },
        supportingContent = { Text(subtitle, color = Color.Gray) },
        leadingContent = { Icon(icon, contentDescription = null, tint = Color(0xFF2E7D32)) },
        trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Color.LightGray) },
        modifier = Modifier.clickable { onClick() }
    )
}
