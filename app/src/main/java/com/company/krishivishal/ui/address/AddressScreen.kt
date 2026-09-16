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
import com.company.krishivishal.core.model.Address
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
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
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showAddDialog = true },
                containerColor = PrimaryGreen,
                contentColor = MaterialTheme.colorScheme.onPrimary,
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
                .background(MaterialTheme.colorScheme.background)
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
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            Icons.Default.ErrorOutline,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = Color.Gray
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = "Address load nahi ho paya",
                            fontWeight = FontWeight.Bold,
                            color = Color.DarkGray
                        )
                        Text(
                            text = res.message ?: "Kuch gadbad hui hai",
                            fontSize = 13.sp,
                            color = Color.Gray,
                            modifier = Modifier.padding(top = 4.dp, start = 32.dp, end = 32.dp)
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = { viewModel.loadAddresses() },
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Retry")
                        }
                    }
                }
                else -> {}
            }
        }

        if (showAddDialog) {
            val user by viewModel.currentUser.collectAsState()
            AddAddressDialog(
                initialName = user?.name ?: "",
                initialPhone = user?.phone?.replace("+91", "") ?: "",
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
        Text("Koi saved address nahi mila", fontWeight = FontWeight.Bold, color = Color.Gray, fontSize = 16.sp)
        Spacer(modifier = Modifier.height(4.dp))
        Text("Apna farm ya ghar ka pata add karein", color = Color.Gray, fontSize = 14.sp)
    }
}

@Composable
fun AddressItem(address: Address, onDelete: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
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
                        text = address.addressType.ifBlank { "Farm" },
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
            if (address.fullName.isNotBlank()) {
                Text(address.fullName, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
            if (address.mobileNumber.isNotBlank()) {
                Text(address.mobileNumber, fontSize = 14.sp, color = Color.Gray)
            }
            
            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), thickness = 0.5.dp)
            
            // Build address lines, filtering out empty parts
            val line1Parts = listOfNotNull(
                address.houseNo.ifBlank { null },
                address.street.ifBlank { null }
            )
            if (line1Parts.isNotEmpty()) {
                Text(
                    line1Parts.joinToString(", "),
                    fontSize = 14.sp,
                    color = Color.DarkGray
                )
            }
            
            val line2Parts = listOfNotNull(
                address.ward.ifBlank { null },
                address.block.ifBlank { null }
            )
            if (line2Parts.isNotEmpty()) {
                Text(
                    line2Parts.joinToString(", "),
                    fontSize = 14.sp,
                    color = Color.DarkGray
                )
            }
            
            val line3Parts = listOfNotNull(
                address.district.ifBlank { null },
                address.state.ifBlank { null }
            )
            val pincodeStr = address.pincode.ifBlank { null }
            if (line3Parts.isNotEmpty() || pincodeStr != null) {
                val districtState = line3Parts.joinToString(", ")
                val fullLine = if (pincodeStr != null && districtState.isNotEmpty()) {
                    "$districtState - $pincodeStr"
                } else {
                    districtState.ifEmpty { pincodeStr ?: "" }
                }
                Text(
                    fullLine,
                    fontSize = 14.sp,
                    color = Color.DarkGray
                )
            }
            
            if (address.landmark.isNotBlank()) {
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
    initialName: String = "",
    initialPhone: String = "",
    onDismiss: () -> Unit,
    onSave: (String, String, String, String, String, String, String, String, String, String, Boolean, String) -> Unit
) {
    var name by remember { mutableStateOf(initialName) }
    var mobile by remember { mutableStateOf(initialPhone) }
    var houseNo by remember { mutableStateOf("") }
    var street by remember { mutableStateOf("") }
    var ward by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    var block by remember { mutableStateOf("") }
    var district by remember { mutableStateOf("") }
    var state by remember { mutableStateOf("Bihar") }
    var landmark by remember { mutableStateOf("") }
    var isDefault by remember { mutableStateOf(true) }
    var selectedType by remember { mutableStateOf("Farm") }
    var validationError by remember { mutableStateOf<String?>(null) }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.9f),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(
                modifier = Modifier
                    .padding(24.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Text("New Delivery Location", fontWeight = FontWeight.Bold, fontSize = 20.sp)
                Spacer(modifier = Modifier.height(16.dp))
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    AddressTypeChip("Farm (खेत)", Icons.Default.Agriculture, selectedType == "Farm") { selectedType = "Farm" }
                    AddressTypeChip("Home (घर)", Icons.Default.Home, selectedType == "Home") { selectedType = "Home" }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                OutlinedTextField(
                    value = name, 
                    onValueChange = { name = it; validationError = null }, 
                    label = { Text("Full Name *") }, 
                    modifier = Modifier.fillMaxWidth(), 
                    shape = RoundedCornerShape(12.dp)
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = mobile, 
                    onValueChange = { 
                        if (it.length <= 10 && it.all { c -> c.isDigit() }) {
                            mobile = it
                            validationError = null
                        }
                    }, 
                    label = { Text("Mobile Number (10 digits) *") }, 
                    modifier = Modifier.fillMaxWidth(), 
                    shape = RoundedCornerShape(12.dp)
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = street, 
                    onValueChange = { street = it; validationError = null }, 
                    label = { Text("Village / Street / Area *") }, 
                    modifier = Modifier.fillMaxWidth(), 
                    shape = RoundedCornerShape(12.dp)
                )
                Spacer(modifier = Modifier.height(8.dp))
                
                Row(modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = ward, 
                        onValueChange = { ward = it }, 
                        label = { Text("Ward / Panchayat") }, 
                        modifier = Modifier.weight(1f), 
                        shape = RoundedCornerShape(12.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    OutlinedTextField(
                        value = pin, 
                        onValueChange = { 
                            if (it.length <= 6 && it.all { c -> c.isDigit() }) {
                                pin = it
                                validationError = null
                            }
                        }, 
                        label = { Text("Pincode (6 digits) *") }, 
                        modifier = Modifier.weight(1f), 
                        shape = RoundedCornerShape(12.dp)
                    )
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                Row(modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = block, 
                        onValueChange = { block = it }, 
                        label = { Text("Block / Tehsil") }, 
                        modifier = Modifier.weight(1f), 
                        shape = RoundedCornerShape(12.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    OutlinedTextField(
                        value = district, 
                        onValueChange = { district = it; validationError = null }, 
                        label = { Text("District *") }, 
                        modifier = Modifier.weight(1f), 
                        shape = RoundedCornerShape(12.dp)
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = state, 
                    onValueChange = { state = it }, 
                    label = { Text("State") }, 
                    modifier = Modifier.fillMaxWidth(), 
                    shape = RoundedCornerShape(12.dp)
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = landmark, 
                    onValueChange = { landmark = it }, 
                    label = { Text("Landmark (Optional)") }, 
                    modifier = Modifier.fillMaxWidth(), 
                    shape = RoundedCornerShape(12.dp)
                )
                
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 8.dp)) {
                    Checkbox(checked = isDefault, onCheckedChange = { isDefault = it }, colors = CheckboxDefaults.colors(checkedColor = PrimaryGreen))
                    Text("Set as primary address")
                }

                if (validationError != null) {
                    Text(
                        text = validationError ?: "",
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(
                        onClick = { 
                            if (name.isBlank()) {
                                validationError = "Kripya apna naam enter karein."
                                return@Button
                            }
                            if (mobile.length != 10) {
                                validationError = "Kripya sahi 10-digit mobile number enter karein."
                                return@Button
                            }
                            if (street.isBlank()) {
                                validationError = "Kripya gaon / mohalla / street enter karein."
                                return@Button
                            }
                            if (pin.length != 6) {
                                validationError = "Kripya 6-digit pincode enter karein."
                                return@Button
                            }
                            if (district.isBlank()) {
                                validationError = "Kripya district (zila) enter karein."
                                return@Button
                            }
                            onSave(name, mobile, houseNo, street, ward, pin, block, district, state.ifBlank { "Bihar" }, landmark, isDefault, selectedType) 
                        },
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
            Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp), tint = if (isSelected) MaterialTheme.colorScheme.onPrimary else Color.Gray)
            Spacer(modifier = Modifier.width(4.dp))
            Text(label, color = if (isSelected) MaterialTheme.colorScheme.onPrimary else Color.Gray, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
    }
}
