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
import com.company.krishivishal.core.model.Brand
import com.company.krishivishal.core.util.Resource

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminBrandScreen(
    onBack: () -> Unit,
    viewModel: AdminBrandViewModel = hiltViewModel()
) {
    val brandsResource by viewModel.brands.collectAsState()
    var selectedBrand by remember { mutableStateOf<Brand?>(null) }
    var isAddingNew by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (selectedBrand == null && !isAddingNew) "Manage Brands" else if (isAddingNew) "Add Brand" else "Edit: ${selectedBrand?.name}") },
                navigationIcon = {
                    IconButton(onClick = {
                        if (selectedBrand == null && !isAddingNew) onBack() 
                        else {
                            selectedBrand = null
                            isAddingNew = false
                        }
                    }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (selectedBrand == null && !isAddingNew) {
                        IconButton(onClick = { isAddingNew = true }) {
                            Icon(Icons.Default.Add, contentDescription = "Add Brand")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            if (isAddingNew) {
                EditBrandContent(
                    brand = Brand(id = java.util.UUID.randomUUID().toString()),
                    onSave = { updated ->
                        viewModel.saveBrand(updated)
                        isAddingNew = false
                    },
                    onUploadImage = { /* Placeholder */ }
                )
            } else {
                when (val res = brandsResource) {
                    is Resource.Loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                    is Resource.Success -> {
                        if (selectedBrand == null) {
                            BrandList(
                                brands = res.data ?: emptyList(),
                                onSelect = { selectedBrand = it },
                                onDelete = { viewModel.deleteBrand(it) }
                            )
                        } else {
                            val brand = selectedBrand
                            if (brand != null) {
                                EditBrandContent(
                                    brand = brand,
                                    onSave = { updated ->
                                        viewModel.saveBrand(updated)
                                        selectedBrand = null
                                    },
                                    onUploadImage = { uri ->
                                        viewModel.uploadBrandImage(brand.id, uri) { url ->
                                            selectedBrand = selectedBrand?.copy(imageUrl = url)
                                        }
                                    }
                                )
                            }
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
fun BrandList(brands: List<Brand>, onSelect: (Brand) -> Unit, onDelete: (String) -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(brands) { brand ->
            ListItem(
                headlineContent = { Text(brand.name) },
                leadingContent = {
                    AsyncImage(
                        model = brand.imageUrl,
                        contentDescription = null,
                        modifier = Modifier.size(50.dp).clip(CircleShape),
                        contentScale = ContentScale.Crop
                    )
                },
                trailingContent = {
                    IconButton(onClick = { onDelete(brand.id) }) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete", tint = Color.Red)
                    }
                },
                modifier = Modifier.clickable { onSelect(brand) }
            )
            HorizontalDivider()
        }
    }
}

@Composable
fun EditBrandContent(
    brand: Brand,
    onSave: (Brand) -> Unit,
    onUploadImage: (Uri) -> Unit
) {
    var brandName by remember { mutableStateOf(brand.name) }
    var brandImageUrl by remember { mutableStateOf(brand.imageUrl) }
    var isActive by remember { mutableStateOf(brand.isActive) }

    val imageLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { onUploadImage(it) }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("Brand Image", fontWeight = FontWeight.Bold)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(100.dp).clip(RoundedCornerShape(8.dp)).background(Color.LightGray).clickable {
                imageLauncher.launch("image/*")
            }) {
                AsyncImage(
                    model = brandImageUrl,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Fit
                )
                Icon(Icons.Default.AddAPhoto, contentDescription = null, modifier = Modifier.align(Alignment.Center), tint = Color.White)
            }
            
            Spacer(modifier = Modifier.width(12.dp))
            
            OutlinedTextField(
                value = brandImageUrl,
                onValueChange = { brandImageUrl = it },
                label = { Text("Paste Image URL here") },
                modifier = Modifier.weight(1f),
                textStyle = androidx.compose.ui.text.TextStyle(fontSize = 12.sp)
            )
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        OutlinedTextField(value = brandName, onValueChange = { brandName = it }, label = { Text("Brand Name") }, modifier = Modifier.fillMaxWidth())
        
        Spacer(modifier = Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = isActive, onCheckedChange = { isActive = it })
            Text("Is Active")
        }

        Spacer(modifier = Modifier.height(32.dp))
        Button(
            onClick = { onSave(brand.copy(name = brandName, imageUrl = brandImageUrl, isActive = isActive)) },
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(Icons.Default.Save, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Save Brand")
        }
    }
}
