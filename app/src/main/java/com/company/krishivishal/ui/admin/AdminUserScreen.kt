package com.company.krishivishal.ui.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.company.krishivishal.data.model.User
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.utils.Resource

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminUserScreen(
    initialRole: String? = null,
    onBack: () -> Unit,
    viewModel: AdminUserViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(initialRole) {
        viewModel.setFilterRole(initialRole)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Manage ${uiState.selectedRole?.lowercase()?.replaceFirstChar { it.uppercase() } ?: "Users"}", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize().background(Color(0xFFF8F9FA))) {
            when (val res = uiState.usersResource) {
                is Resource.Loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = PrimaryGreen)
                is Resource.Success -> {
                    val users = res.data ?: emptyList()
                    if (users.isEmpty()) {
                        Text("No users found", modifier = Modifier.align(Alignment.Center), color = Color.Gray)
                    } else {
                        LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(users) { user ->
                                UserCard(user) { newRole ->
                                    viewModel.updateUserRole(user.id, newRole)
                                }
                            }
                        }
                    }
                }
                is Resource.Error -> Text("Error: ${res.message}", modifier = Modifier.align(Alignment.Center), color = Color.Red)
                else -> {}
            }
        }
    }
}

@Composable
fun UserCard(user: User, onRoleChange: (String) -> Unit) {
    var showRoleDialog by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            if (user.imageUrl.isNullOrEmpty()) {
                Box(
                    modifier = Modifier.size(50.dp).background(Color(0xFFE9ECEF), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.Person, null, tint = Color.Gray)
                }
            } else {
                AsyncImage(
                    model = user.imageUrl,
                    contentDescription = null,
                    modifier = Modifier.size(50.dp).clip(CircleShape)
                )
            }

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(user.name, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text(user.phone ?: user.email ?: "No contact info", fontSize = 12.sp, color = Color.Gray)
                
                Surface(
                    color = when(user.role) {
                        "ADMIN" -> Color.Red.copy(alpha = 0.1f)
                        "SELLER" -> Color.Blue.copy(alpha = 0.1f)
                        "RIDER" -> Color.Magenta.copy(alpha = 0.1f)
                        else -> Color.Gray.copy(alpha = 0.1f)
                    },
                    shape = RoundedCornerShape(4.dp),
                    modifier = Modifier.padding(top = 4.dp)
                ) {
                    Text(
                        user.role, 
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = when(user.role) {
                            "ADMIN" -> Color.Red
                            "SELLER" -> Color.Blue
                            "RIDER" -> Color.Magenta
                            else -> Color.Gray
                        }
                    )
                }
            }

            IconButton(onClick = { showRoleDialog = true }) {
                Icon(Icons.Default.Phone, contentDescription = "Contact", tint = PrimaryGreen)
            }
        }
    }

    if (showRoleDialog) {
        AlertDialog(
            onDismissRequest = { showRoleDialog = false },
            title = { Text("Update Role for ${user.name}") },
            text = {
                Column {
                    listOf("CUSTOMER", "SELLER", "RIDER", "ADMIN").forEach { role ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { 
                                    onRoleChange(role)
                                    showRoleDialog = false
                                }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(selected = user.role == role, onClick = null)
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(role)
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showRoleDialog = false }) { Text("Cancel") }
            }
        )
    }
}
