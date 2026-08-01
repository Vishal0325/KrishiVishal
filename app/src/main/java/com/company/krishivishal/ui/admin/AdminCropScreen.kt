package com.company.krishivishal.ui.admin

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.company.krishivishal.core.model.Crop
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminCropScreen(
    onBack: () -> Unit,
    viewModel: AdminCropViewModel = hiltViewModel()
) {
    val cropsResource by viewModel.crops.collectAsState()
    var selectedCrop by remember { mutableStateOf<Crop?>(null) }
    var isAddingNew by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (selectedCrop == null && !isAddingNew) "Manage Crops" else if (isAddingNew) "Add Crop" else "Edit: ${selectedCrop?.name}") },
                navigationIcon = {
                    IconButton(onClick = {
                        if (selectedCrop == null && !isAddingNew) onBack() 
                        else {
                            selectedCrop = null
                            isAddingNew = false
                        }
                    }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (selectedCrop == null && !isAddingNew) {
                        IconButton(onClick = { isAddingNew = true }) {
                            Icon(Icons.Default.Add, contentDescription = "Add Crop")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            if (isAddingNew) {
                EditCropContent(
                    crop = Crop(id = UUID.randomUUID().toString()),
                    onSave = { updated ->
                        viewModel.saveCrop(updated)
                        isAddingNew = false
                    },
                    onUploadImage = { id, uri ->
                        viewModel.uploadCropImage(id, uri) { url ->
                            // Optional: update local state if needed
                        }
                    },
                    viewModel = viewModel
                )
            } else {
                when (val res = cropsResource) {
                    is Resource.Loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                    is Resource.Success -> {
                        if (selectedCrop == null) {
                            CropList(
                                crops = res.data ?: emptyList(),
                                onSelect = { selectedCrop = it },
                                onDelete = { viewModel.deleteCrop(it.id) }
                            )
                        } else {
                            EditCropContent(
                                crop = selectedCrop!!,
                                onSave = { updated ->
                                    viewModel.saveCrop(updated)
                                    selectedCrop = null
                                },
                                onUploadImage = { id, uri ->
                                    viewModel.uploadCropImage(id, uri) { url ->
                                        selectedCrop = selectedCrop?.copy(imageUrl = url)
                                    }
                                },
                                viewModel = viewModel
                            )
                        }
                    }
                    is Resource.Error -> Text("Error: ${res.message}", modifier = Modifier.align(Alignment.Center))
                    else -> {}
                }
            }
        }
    }
}

@Composable
fun CropList(
    crops: List<Crop>,
    onSelect: (Crop) -> Unit,
    onDelete: (Crop) -> Unit
) {
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(crops) { crop ->
            ListItem(
                headlineContent = { Text(crop.name) },
                leadingContent = {
                    AsyncImage(
                        model = crop.imageUrl,
                        contentDescription = null,
                        modifier = Modifier.size(50.dp).clip(CircleShape),
                        contentScale = ContentScale.Crop
                    )
                },
                trailingContent = {
                    IconButton(onClick = { onDelete(crop) }) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete", tint = Color.Red)
                    }
                },
                modifier = Modifier.clickable { onSelect(crop) }
            )
            HorizontalDivider()
        }
    }
}

@Composable
fun EditCropContent(
    crop: Crop,
    onSave: (Crop) -> Unit,
    onUploadImage: (String, Uri) -> Unit,
    viewModel: AdminCropViewModel
) {
    var cropName by remember { mutableStateOf(crop.name) }
    var cropImageUrl by remember { mutableStateOf(crop.imageUrl) }
    val uploadStatus by viewModel.uploadStatus.collectAsState()

    LaunchedEffect(uploadStatus) {
        if (uploadStatus is Resource.Success) {
            cropImageUrl = uploadStatus?.data ?: cropImageUrl
        }
    }

    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { onUploadImage(crop.id, it) }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("Crop Image", fontWeight = FontWeight.Bold)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(100.dp).clip(RoundedCornerShape(8.dp)).background(Color.LightGray).clickable {
                launcher.launch("image/*")
            }) {
                AsyncImage(
                    model = cropImageUrl,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
                Icon(Icons.Default.AddAPhoto, contentDescription = null, modifier = Modifier.align(Alignment.Center), tint = Color.White)
                
                if (uploadStatus is Resource.Loading) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = PrimaryGreen)
                }
            }
            
            Spacer(modifier = Modifier.width(12.dp))
            
            OutlinedTextField(
                value = cropImageUrl,
                onValueChange = { cropImageUrl = it },
                label = { Text("Image URL") },
                modifier = Modifier.weight(1f),
                textStyle = androidx.compose.ui.text.TextStyle(fontSize = 12.sp)
            )
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        OutlinedTextField(
            value = cropName,
            onValueChange = { cropName = it },
            label = { Text("Crop Name") },
            modifier = Modifier.fillMaxWidth()
        )
        
        Spacer(modifier = Modifier.height(32.dp))
        Button(
            onClick = { 
                onSave(
                    Crop(
                        id = crop.id,
                        name = cropName,
                        imageUrl = cropImageUrl
                    )
                ) 
            },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
        ) {
            Icon(Icons.Default.Save, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Save Crop")
        }
    }
}
