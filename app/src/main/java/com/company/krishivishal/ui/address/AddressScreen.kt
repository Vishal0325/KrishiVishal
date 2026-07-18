package com.company.krishivishal.ui.address

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.data.model.Address
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddressScreen(
    onBack: () -> Unit,
    viewModel: AddressViewModel = hiltViewModel()
) {
    val addressesResource by viewModel.addresses.collectAsState()
    var showAddDialog by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        viewModel.uiEvent.collectLatest { event ->
            when (event) {
                is AddressUiEvent.ShowSnackbar -> snackbarHostState.showSnackbar(event.message)
                AddressUiEvent.AddressSaved -> showAddDialog = false
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("My Saved Locations", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showAddDialog = true },
                containerColor = PrimaryGreen,
                contentColor = Color.White,
                shape = RoundedCornerShape(16.dp),
                icon = { Icon(Icons.Default.AddLocationAlt, contentDescription = null) },
                text = { Text("Add New Farm/Home") }
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF5F5F5))
        ) {
            when (val res = addressesResource) {
                is Resource.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = PrimaryGreen)
                }
                is Resource.Success -> {
                    val items = res.data ?: emptyList()
                    if (items.isEmpty()) {
                        EmptyAddressView()
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, 80.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            items(items) { address ->
                                AddressItem(
                                    address = address,
                                    onDelete = { viewModel.deleteAddress(address) }
                                )
                            }
                        }
                    }
                }
                is Resource.Error -> {
                    Text(text = "Error: ${res.message}", modifier = Modifier.align(Alignment.Center), color = Color.Red)
                }
                else -> {}
            }
        }

        if (showAddDialog) {
            AddAddressDialog(
                onDismiss = { showAddDialog = false },
                onSave = { name, mobile, house, street, ward, pin, block, district, state, landmark, isDefault, type ->
                    viewModel.addAddress(name, mobile, house, street, ward, pin, block, district, state, landmark, isDefault, type)
                }
            )
        }
    }
}

@Composable
fun EmptyAddressView() {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(Icons.Default.LocationOff, contentDescription = null, modifier = Modifier.size(80.dp), tint = Color.LightGray)
        Spacer(modifier = Modifier.height(16.dp))
        Text("No addresses found", fontWeight = FontWeight.Bold, color = Color.Gray)
        Text("Add your farm or home for delivery", color = Color.Gray, fontSize = 14.sp)
    }
}

@Composable
fun AddressItem(address: Address, onDelete: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (address.addressType == "Home") Icons.Default.Home else Icons.Default.Agriculture,
                        contentDescription = null,
                        tint = PrimaryGreen,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = address.addressType,
                        fontWeight = FontWeight.Bold,
                        color = PrimaryGreen,
                        fontSize = 14.sp
                    )
                }
                if (address.isDefault) {
                    Surface(
                        color = PrimaryGreen.copy(alpha = 0.1f),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text(
                            "Primary",
                            color = PrimaryGreen,
                            fontSize = 10.sp,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(12.dp))
            Text(address.fullName, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text(address.mobileNumber, fontSize = 14.sp, color = Color.Gray)
            
            Divider(modifier = Modifier.padding(vertical = 12.dp), thickness = 0.5.dp)
            
            Text(
                "${address.houseNo}, ${address.street}",
                fontSize = 14.sp,
                color = Color.DarkGray
            )
            Text(
                "${address.ward}, ${address.block}",
                fontSize = 14.sp,
                color = Color.DarkGray
            )
            Text(
                "${address.district}, ${address.state} - ${address.pincode}",
                fontSize = 14.sp,
                color = Color.DarkGray
            )
            
            if (address.landmark.isNotEmpty()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text("Landmark: ${address.landmark}", fontSize = 12.sp, color = Color.Gray)
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onDelete, colors = ButtonDefaults.textButtonColors(contentColor = Color.Red)) {
                    Icon(Icons.Default.DeleteOutline, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Remove")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddAddressDialog(
    onDismiss: () -> Unit,
    onSave: (String, String, String, String, String, String, String, String, String, String, Boolean, String) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var mobile by remember { mutableStateOf("") }
    var house by remember { mutableStateOf("") }
    var street by remember { mutableStateOf("") }
    var ward by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    var block by remember { mutableStateOf("") }
    var district by remember { mutableStateOf("") }
    var state by remember { mutableStateOf("") }
    var landmark by remember { mutableStateOf("") }
    var isDefault by remember { mutableStateOf(false) }
    var selectedType by remember { mutableStateOf("Farm") }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.9f),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(
                modifier = Modifier
                    .padding(24.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Text("New Shipping Location", fontWeight = FontWeight.Bold, fontSize = 20.sp)
                Spacer(modifier = Modifier.height(16.dp))
                
                Row(modifier = Modifier.fillMaxWidth()) {
                    AddressTypeChip("Farm", Icons.Default.Agriculture, selectedType == "Farm") { selectedType = "Farm" }
                    Spacer(modifier = Modifier.width(8.dp))
                    AddressTypeChip("Home", Icons.Default.Home, selectedType == "Home") { selectedType = "Home" }
                    Spacer(modifier = Modifier.width(8.dp))
                    AddressTypeChip("Other", Icons.Default.Place, selectedType == "Other") { selectedType = "Other" }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Full Name") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = mobile, onValueChange = { mobile = it }, label = { Text("Mobile Number") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = house, onValueChange = { house = it }, label = { Text("House No/Farm Name") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = street, onValueChange = { street = it }, label = { Text("Street/Area") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
                Spacer(modifier = Modifier.height(8.dp))
                
                Row(modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(value = ward, onValueChange = { ward = it }, label = { Text("Ward") }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    OutlinedTextField(value = pin, onValueChange = { pin = it }, label = { Text("Pincode") }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp))
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = block, onValueChange = { block = it }, label = { Text("Block") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = district, onValueChange = { district = it }, label = { Text("District") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = state, onValueChange = { state = it }, label = { Text("State") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = landmark, onValueChange = { landmark = it }, label = { Text("Landmark (Optional)") }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp))
                
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 8.dp)) {
                    Checkbox(checked = isDefault, onCheckedChange = { isDefault = it }, colors = CheckboxDefaults.colors(checkedColor = PrimaryGreen))
                    Text("Set as primary address")
                }
                
                Spacer(modifier = Modifier.height(24.dp))
                
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Button(
                        onClick = { onSave(name, mobile, house, street, ward, pin, block, district, state, landmark, isDefault, selectedType) },
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Save Address")
                    }
                }
            }
        }
    }
}

@Composable
fun AddressTypeChip(label: String, icon: ImageVector, isSelected: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.clickable { onClick() },
        color = if (isSelected) PrimaryGreen else Color(0xFFEEEEEE),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp), tint = if (isSelected) Color.White else Color.Gray)
            Spacer(modifier = Modifier.width(4.dp))
            Text(label, color = if (isSelected) Color.White else Color.Gray, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
    }
}
