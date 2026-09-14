package com.company.krishivishal.ui.profile

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.core.model.CropAllocation
import com.company.krishivishal.ui.theme.PrimaryGreen
import java.util.UUID

private val LAND_UNITS = listOf("Katha", "Bigha", "Acre", "Decimal")
private val MONTHS = listOf(
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
)

private val POPULAR_CROPS = listOf(
    "धान (Paddy)",
    "फूलगोभी (Gobhi)",
    "कद्दू (Kaddu)",
    "मक्का (Maize)",
    "आलू (Potato)",
    "सरसों (Sarson)",
    "गेहूं (Wheat)",
    "टमाटर (Tomato)",
    "प्याज (Onion)",
    "मिर्च (Chilli)",
    "बैंगन (Brinjal)",
    "गन्ना (Sugarcane)"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FarmProfileScreen(
    onBack: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val userProfile by viewModel.userProfile.collectAsState()
    val isSaving by viewModel.isSavingFarmProfile.collectAsState()

    var ageText by remember(userProfile) {
        mutableStateOf(userProfile?.age?.toString() ?: "")
    }
    var totalLandText by remember(userProfile) {
        mutableStateOf(if ((userProfile?.totalLand ?: 0.0) > 0.0) userProfile?.totalLand.toString() else "")
    }
    var landUnit by remember(userProfile) {
        mutableStateOf(userProfile?.landUnit?.ifBlank { "Katha" } ?: "Katha")
    }
    var cropAllocations by remember(userProfile) {
        mutableStateOf(userProfile?.cropAllocations ?: emptyList())
    }

    var showCropDialog by remember { mutableStateOf(false) }
    var editingCrop by remember { mutableStateOf<CropAllocation?>(null) }
    var showDeleteConfirm by remember { mutableStateOf<CropAllocation?>(null) }

    val totalLand = totalLandText.toDoubleOrNull() ?: 0.0
    val totalAllocated = cropAllocations.sumOf { it.allocatedArea }
    val vacantLand = (totalLand - totalAllocated).coerceAtLeast(0.0)
    val isOverAllocated = totalAllocated > totalLand && totalLand > 0

    val progress = if (totalLand > 0) {
        (totalAllocated / totalLand).toFloat().coerceIn(0f, 1f)
    } else {
        0f
    }
    val animatedProgress by animateFloatAsState(targetValue = progress, label = "allocationProgress")

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "मेरा खेत और फसल",
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp
                        )
                        Text(
                            text = "Farm & Crop Profile",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        bottomBar = {
            Surface(
                tonalElevation = 6.dp,
                shadowElevation = 8.dp,
                color = MaterialTheme.colorScheme.surface
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    Button(
                        onClick = {
                            val parsedAge = ageText.trim().toIntOrNull()
                            val parsedLand = totalLandText.trim().toDoubleOrNull() ?: 0.0
                            viewModel.updateFarmProfile(
                                age = parsedAge,
                                totalLand = parsedLand,
                                landUnit = landUnit,
                                cropAllocations = cropAllocations
                            ) { success, errorMsg ->
                                if (success) {
                                    Toast.makeText(context, "Farm profile updated successfully! (प्रोफाइल सहेजा गया)", Toast.LENGTH_SHORT).show()
                                    onBack()
                                } else {
                                    Toast.makeText(context, errorMsg ?: "Failed to save profile", Toast.LENGTH_SHORT).show()
                                }
                            }
                        },
                        enabled = !isSaving,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                    ) {
                        if (isSaving) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                color = Color.White,
                                strokeWidth = 2.5.dp
                            )
                        } else {
                            Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Save Profile (फार्म प्रोफाइल सहेजें)",
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp
                            )
                        }
                    }
                }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(top = 16.dp, bottom = 24.dp)
        ) {
            // Header Banner
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = PrimaryGreen.copy(alpha = 0.08f)
                    ),
                    border = BorderStroke(1.dp, PrimaryGreen.copy(alpha = 0.25f))
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = PrimaryGreen,
                            modifier = Modifier.size(48.dp)
                        ) {
                            Icon(
                                Icons.Default.Agriculture,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier
                                    .padding(10.dp)
                                    .fillMaxSize()
                            )
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = userProfile?.name?.takeIf { it.isNotBlank() } ?: "Kisan Mitr",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "Manage your land & active crops for tailored advisory & pest alerts",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            // Section 1: Farmer & Land Details
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Text(
                            text = "बुनियादी विवरण (Basic Details)",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = MaterialTheme.colorScheme.onSurface
                        )

                        // Age Field
                        OutlinedTextField(
                            value = ageText,
                            onValueChange = { input ->
                                if (input.isEmpty() || input.all { it.isDigit() } && input.length <= 3) {
                                    ageText = input
                                }
                            },
                            label = { Text("Farmer Age (किसान की उम्र)") },
                            placeholder = { Text("e.g. 35") },
                            leadingIcon = {
                                Icon(Icons.Default.Person, contentDescription = null, tint = PrimaryGreen)
                            },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            singleLine = true
                        )

                        // Land & Unit Row
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            OutlinedTextField(
                                value = totalLandText,
                                onValueChange = { input ->
                                    if (input.isEmpty() || input.matches(Regex("""^\d*\.?\d*$"""))) {
                                        totalLandText = input
                                    }
                                },
                                label = { Text("Total Land (कुल ज़मीन)") },
                                placeholder = { Text("e.g. 20") },
                                leadingIcon = {
                                    Icon(Icons.Default.Landscape, contentDescription = null, tint = PrimaryGreen)
                                },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.weight(1.4f),
                                shape = RoundedCornerShape(12.dp),
                                singleLine = true
                            )

                            // Unit Selector Dropdown
                            var unitMenuExpanded by remember { mutableStateOf(false) }
                            Box(modifier = Modifier.weight(1f)) {
                                OutlinedCard(
                                    onClick = { unitMenuExpanded = true },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(56.dp),
                                    shape = RoundedCornerShape(12.dp),
                                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .padding(horizontal = 12.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column {
                                            Text("इकाई (Unit)", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            Text(landUnit, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                        }
                                        Icon(Icons.Default.ArrowDropDown, contentDescription = null)
                                    }
                                }
                                DropdownMenu(
                                    expanded = unitMenuExpanded,
                                    onDismissRequest = { unitMenuExpanded = false }
                                ) {
                                    LAND_UNITS.forEach { unit ->
                                        DropdownMenuItem(
                                            text = { Text(unit) },
                                            onClick = {
                                                landUnit = unit
                                                unitMenuExpanded = false
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Section 2: Visual Land Breakdown Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "भूमि उपयोग स्थिति (Land Utilization)",
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = if (isOverAllocated) MaterialTheme.colorScheme.errorContainer else PrimaryGreen.copy(alpha = 0.12f)
                            ) {
                                Text(
                                    text = if (totalLand > 0) "${(progress * 100).toInt()}% Used" else "0% Used",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isOverAllocated) MaterialTheme.colorScheme.error else PrimaryGreen,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }

                        // Progress Bar
                        LinearProgressIndicator(
                            progress = { animatedProgress },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(10.dp)
                                .clip(RoundedCornerShape(5.dp)),
                            color = if (isOverAllocated) MaterialTheme.colorScheme.error else PrimaryGreen,
                            trackColor = MaterialTheme.colorScheme.surfaceVariant
                        )

                        // Three breakdown stats
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            // Total Land
                            Column(horizontalAlignment = Alignment.Start) {
                                Text("कुल ज़मीन (Total)", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(
                                    text = "${String.format("%.1f", totalLand)} $landUnit",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp
                                )
                            }
                            // Allocated
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("बोई गई (Allocated)", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(
                                    text = "${String.format("%.1f", totalAllocated)} $landUnit",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = if (isOverAllocated) MaterialTheme.colorScheme.error else PrimaryGreen
                                )
                            }
                            // Vacant / Fallow
                            Column(horizontalAlignment = Alignment.End) {
                                Text("खाली (Vacant)", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(
                                    text = "${String.format("%.1f", vacantLand)} $landUnit",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = Color(0xFFE65100)
                                )
                            }
                        }

                        if (isOverAllocated) {
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Warning,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.error,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Text(
                                        text = "Allocated area exceeds total land by ${String.format("%.1f", totalAllocated - totalLand)} $landUnit!",
                                        fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.error,
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Section 3: Crops Allocation Header
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "फसल आवंटन (Crops Growing)",
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "${cropAllocations.size} crops registered",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    FilledTonalButton(
                        onClick = {
                            editingCrop = null
                            showCropDialog = true
                        },
                        shape = RoundedCornerShape(10.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Add Crop (+ फसल)", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            // Crops List or Empty State
            if (cropAllocations.isEmpty()) {
                item {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                editingCrop = null
                                showCropDialog = true
                            },
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                Icons.Default.Spa,
                                contentDescription = null,
                                modifier = Modifier.size(40.dp),
                                tint = PrimaryGreen
                            )
                            Text(
                                text = "अभी कोई फसल नहीं जोड़ी गई",
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp
                            )
                            Text(
                                text = "Click here to add crops (धान, मक्का, गोभी, आलू, etc.) planted in your fields.",
                                fontSize = 13.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }
                }
            } else {
                items(cropAllocations, key = { it.id }) { crop ->
                    CropAllocationCard(
                        crop = crop,
                        defaultUnit = landUnit,
                        onEdit = {
                            editingCrop = crop
                            showCropDialog = true
                        },
                        onDelete = {
                            showDeleteConfirm = crop
                        }
                    )
                }
            }
        }
    }

    // Add / Edit Crop Dialog
    if (showCropDialog) {
        CropAllocationDialog(
            initialCrop = editingCrop,
            defaultUnit = landUnit,
            onDismiss = { showCropDialog = false },
            onSave = { savedCrop ->
                if (editingCrop != null) {
                    cropAllocations = cropAllocations.map {
                        if (it.id == savedCrop.id) savedCrop else it
                    }
                } else {
                    cropAllocations = cropAllocations + savedCrop
                }
                showCropDialog = false
            }
        )
    }

    // Delete Confirmation Dialog
    showDeleteConfirm?.let { cropToDelete ->
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = null },
            title = { Text("Delete Crop Allocation?") },
            text = { Text("Are you sure you want to remove '${cropToDelete.cropName}' from your farm profile?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        cropAllocations = cropAllocations.filterNot { it.id == cropToDelete.id }
                        showDeleteConfirm = null
                    }
                ) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = null }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
fun CropAllocationCard(
    crop: CropAllocation,
    defaultUnit: String,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = PrimaryGreen.copy(alpha = 0.1f),
                        modifier = Modifier.size(40.dp)
                    ) {
                        Icon(
                            Icons.Default.Eco,
                            contentDescription = null,
                            tint = PrimaryGreen,
                            modifier = Modifier
                                .padding(8.dp)
                                .fillMaxSize()
                        )
                    }
                    Column {
                        Text(
                            text = crop.cropName,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = when (crop.status.uppercase()) {
                                    "GROWING" -> Color(0xFFE8F5E9)
                                    "HARVESTED" -> Color(0xFFFFF3E0)
                                    else -> Color(0xFFE3F2FD)
                                }
                            ) {
                                Text(
                                    text = when (crop.status.uppercase()) {
                                        "GROWING" -> "🟢 Growing (बढ़ रही है)"
                                        "HARVESTED" -> "🌾 Harvested (कटाई पूरी)"
                                        else -> "📅 Planned (योजना)"
                                    },
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = when (crop.status.uppercase()) {
                                        "GROWING" -> Color(0xFF2E7D32)
                                        "HARVESTED" -> Color(0xFFE65100)
                                        else -> Color(0xFF1565C0)
                                    },
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }
                }

                Row {
                    IconButton(onClick = onEdit, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.Edit, contentDescription = "Edit", modifier = Modifier.size(18.dp))
                    }
                    IconButton(onClick = onDelete, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete", modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error)
                    }
                }
            }

            HorizontalDivider(thickness = 0.5.dp, color = MaterialTheme.colorScheme.outlineVariant)

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Area
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(Icons.Default.Straighten, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.outline)
                    Text(
                        text = "Area: ${crop.allocatedArea} ${crop.unit.ifBlank { defaultUnit }}",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium
                    )
                }

                // Sowing Month
                if (crop.sowingMonth.isNotBlank()) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(Icons.Default.CalendarToday, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.outline)
                        Text(
                            text = "Sown: ${crop.sowingMonth}",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            if (crop.harvestMonth.isNotBlank() || crop.notes.isNotBlank()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (crop.harvestMonth.isNotBlank()) {
                        Text(
                            text = "Harvest: ${crop.harvestMonth}",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                    if (crop.notes.isNotBlank()) {
                        Text(
                            text = "Note: ${crop.notes}",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.outline,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CropAllocationDialog(
    initialCrop: CropAllocation?,
    defaultUnit: String,
    onDismiss: () -> Unit,
    onSave: (CropAllocation) -> Unit
) {
    var cropName by remember { mutableStateOf(initialCrop?.cropName ?: "") }
    var allocatedAreaText by remember { mutableStateOf(initialCrop?.allocatedArea?.let { if (it > 0) it.toString() else "" } ?: "") }
    var unit by remember { mutableStateOf(initialCrop?.unit?.ifBlank { defaultUnit } ?: defaultUnit) }
    var sowingMonth by remember { mutableStateOf(initialCrop?.sowingMonth ?: "") }
    var harvestMonth by remember { mutableStateOf(initialCrop?.harvestMonth ?: "") }
    var status by remember { mutableStateOf(initialCrop?.status ?: "GROWING") }
    var notes by remember { mutableStateOf(initialCrop?.notes ?: "") }

    var sowingExpanded by remember { mutableStateOf(false) }
    var harvestExpanded by remember { mutableStateOf(false) }
    var unitExpanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = if (initialCrop == null) "Add Crop (नई फसल जोड़ें)" else "Edit Crop (फसल सुधारें)",
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Quick Picker Chips
                Text("Quick Select Crop (त्वरित चयन):", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(POPULAR_CROPS) { popularCrop ->
                        val isSelected = cropName.equals(popularCrop, ignoreCase = true)
                        FilterChip(
                            selected = isSelected,
                            onClick = { cropName = popularCrop },
                            label = { Text(popularCrop, fontSize = 11.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PrimaryGreen.copy(alpha = 0.15f),
                                selectedLabelColor = PrimaryGreen
                            )
                        )
                    }
                }

                // Crop Name Field
                OutlinedTextField(
                    value = cropName,
                    onValueChange = { cropName = it },
                    label = { Text("Crop Name (फसल का नाम)") },
                    placeholder = { Text("e.g. धान / Cauliflower") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                // Area & Unit Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = allocatedAreaText,
                        onValueChange = { input ->
                            if (input.isEmpty() || input.matches(Regex("""^\d*\.?\d*$"""))) {
                                allocatedAreaText = input
                            }
                        },
                        label = { Text("Area (क्षेत्रफल)") },
                        placeholder = { Text("e.g. 5") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1.3f),
                        shape = RoundedCornerShape(10.dp),
                        singleLine = true
                    )

                    Box(modifier = Modifier.weight(1f)) {
                        OutlinedCard(
                            onClick = { unitExpanded = true },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(horizontal = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(unit, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                                Icon(Icons.Default.ArrowDropDown, contentDescription = null)
                            }
                        }
                        DropdownMenu(
                            expanded = unitExpanded,
                            onDismissRequest = { unitExpanded = false }
                        ) {
                            LAND_UNITS.forEach { u ->
                                DropdownMenuItem(
                                    text = { Text(u) },
                                    onClick = {
                                        unit = u
                                        unitExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }

                // Sowing & Harvest Month Pickers
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Sowing Month
                    Box(modifier = Modifier.weight(1f)) {
                        OutlinedCard(
                            onClick = { sowingExpanded = true },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(horizontal = 8.dp, vertical = 6.dp),
                                verticalArrangement = Arrangement.Center
                            ) {
                                Text("बुआई (Sowing)", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(
                                    text = sowingMonth.ifBlank { "Select Month" },
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                        DropdownMenu(
                            expanded = sowingExpanded,
                            onDismissRequest = { sowingExpanded = false }
                        ) {
                            MONTHS.forEach { month ->
                                DropdownMenuItem(
                                    text = { Text(month) },
                                    onClick = {
                                        sowingMonth = month
                                        sowingExpanded = false
                                    }
                                )
                            }
                        }
                    }

                    // Harvest Month
                    Box(modifier = Modifier.weight(1f)) {
                        OutlinedCard(
                            onClick = { harvestExpanded = true },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(horizontal = 8.dp, vertical = 6.dp),
                                verticalArrangement = Arrangement.Center
                            ) {
                                Text("कटाई (Harvest)", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(
                                    text = harvestMonth.ifBlank { "Optional" },
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                        DropdownMenu(
                            expanded = harvestExpanded,
                            onDismissRequest = { harvestExpanded = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("None") },
                                onClick = {
                                    harvestMonth = ""
                                    harvestExpanded = false
                                }
                            )
                            MONTHS.forEach { month ->
                                DropdownMenuItem(
                                    text = { Text(month) },
                                    onClick = {
                                        harvestMonth = month
                                        harvestExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }

                // Status Selector
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    listOf("GROWING" to "Growing 🌱", "HARVESTED" to "Harvested 🌾", "PLANNED" to "Planned 📅").forEach { (code, label) ->
                        FilterChip(
                            selected = status == code,
                            onClick = { status = code },
                            label = { Text(label, fontSize = 11.sp) },
                            modifier = Modifier.weight(1f),
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PrimaryGreen.copy(alpha = 0.15f),
                                selectedLabelColor = PrimaryGreen
                            )
                        )
                    }
                }

                // Notes Field
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Notes / Variety (किस्म या टिप्पणी)") },
                    placeholder = { Text("e.g. Hybrid 6444, Drip irrigated") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val area = allocatedAreaText.toDoubleOrNull() ?: 0.0
                    val finalCrop = CropAllocation(
                        id = initialCrop?.id?.ifBlank { UUID.randomUUID().toString() } ?: UUID.randomUUID().toString(),
                        cropName = cropName.trim(),
                        allocatedArea = area,
                        unit = unit,
                        sowingMonth = sowingMonth,
                        harvestMonth = harvestMonth,
                        status = status,
                        notes = notes.trim()
                    )
                    onSave(finalCrop)
                },
                enabled = cropName.isNotBlank() && (allocatedAreaText.toDoubleOrNull() ?: 0.0) > 0.0,
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text("Save Crop", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
