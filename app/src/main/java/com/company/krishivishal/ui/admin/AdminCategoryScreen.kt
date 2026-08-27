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
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
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
import androidx.compose.ui.res.stringResource
import com.company.krishivishal.R
import com.company.krishivishal.ui.components.ErrorState
import com.company.krishivishal.core.model.Category
import com.company.krishivishal.core.model.SubCategory
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminCategoryScreen(
    onBack: () -> Unit,
    viewModel: AdminCategoryViewModel = hiltViewModel()
) {
    val categoriesResource by viewModel.filteredCategories.collectAsState()
    val selectedCategory by viewModel.editingCategory.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()
    val selectedIds by viewModel.selectedIds.collectAsState()
    var isAddingNew by remember { mutableStateOf(false) }
    var isSearching by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    if (isSearching && selectedCategory == null && !isAddingNew) {
                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = { viewModel.onSearchQueryChange(it) },
                            placeholder = { Text("Search Categories...") },
                            modifier = Modifier.fillMaxWidth().height(56.dp),
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color.Transparent,
                                unfocusedBorderColor = Color.Transparent
                            )
                        )
                    } else {
                        Text(
                            if (selectedIds.isNotEmpty()) "${selectedIds.size} Selected"
                            else if (selectedCategory == null && !isAddingNew) stringResource(R.string.manage_categories) 
                            else if (isAddingNew) stringResource(R.string.add_category) 
                            else stringResource(R.string.edit_label, selectedCategory?.name ?: "")
                        ) 
                    }
                },
                navigationIcon = {
                    IconButton(onClick = {
                        if (selectedIds.isNotEmpty()) viewModel.clearSelection()
                        else if (isSearching) {
                            isSearching = false
                            viewModel.onSearchQueryChange("")
                        }
                        else if (selectedCategory == null && !isAddingNew) onBack() 
                        else {
                            viewModel.setEditingCategory(null)
                            isAddingNew = false
                        }
                    }) {
                        Icon(if (selectedIds.isNotEmpty() || isSearching) Icons.Default.Close else Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (selectedCategory == null && !isAddingNew) {
                        if (selectedIds.isNotEmpty()) {
                            IconButton(onClick = { viewModel.deleteSelectedCategories() }) {
                                Icon(Icons.Default.Delete, contentDescription = "Delete Selected", tint = Color.Red)
                            }
                        } else {
                            IconButton(onClick = { isSearching = !isSearching }) {
                                Icon(if (isSearching) Icons.Default.Close else Icons.Default.Search, contentDescription = "Search")
                            }
                            IconButton(onClick = { isAddingNew = true }) {
                                Icon(Icons.Default.Add, contentDescription = "Add Category")
                            }
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            if (isAddingNew) {
                var newCategory by remember { mutableStateOf(Category(id = java.util.UUID.randomUUID().toString())) }
                EditCategoryContent(
                    category = newCategory,
                    onSave = { updated ->
                        viewModel.saveCategory(updated)
                        isAddingNew = false
                    },
                    onUploadImage = { id, uri, isSub ->
                        if (isSub) {
                            viewModel.uploadSubCategoryImage(id, uri) { url ->
                                val newList = newCategory.subCategories.map { 
                                    if (it.id == id) it.copy(imageUrl = url) else it
                                }
                                newCategory = newCategory.copy(subCategories = newList)
                            }
                        } else {
                            viewModel.uploadCategoryImage(id, uri) { url ->
                                newCategory = newCategory.copy(imageUrl = url)
                            }
                        }
                    }
                )
            } else {
                when (val res = categoriesResource) {
                    is Resource.Loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                    is Resource.Success -> {
                        if (selectedCategory == null) {
                            CategoryList(
                                categories = res.data ?: emptyList(),
                                selectedIds = selectedIds,
                                onSelect = { viewModel.setEditingCategory(it) },
                                onToggleSelect = { viewModel.toggleSelection(it.id) }
                            )
                        } else {
                            val category = selectedCategory
                            if (category != null) {
                                EditCategoryContent(
                                    category = category,
                                    onSave = { updated ->
                                        viewModel.saveCategory(updated)
                                        viewModel.setEditingCategory(null)
                                    },
                                    onUploadImage = { id, uri, isSub ->
                                        if (isSub) {
                                            viewModel.uploadSubCategoryImage(id, uri) { url ->
                                                val currentCat = viewModel.editingCategory.value
                                                currentCat?.let { cat ->
                                                    val newList = cat.subCategories.map {
                                                        if (it.id == id) it.copy(imageUrl = url) else it
                                                    }
                                                    viewModel.updateEditingCategory(cat.copy(subCategories = newList))
                                                }
                                            }
                                        } else {
                                            viewModel.uploadCategoryImage(id, uri) { url ->
                                                viewModel.editingCategory.value?.let { cat ->
                                                    viewModel.updateEditingCategory(cat.copy(imageUrl = url))
                                                }
                                            }
                                        }
                                    }
                                )
                            }
                        }
                    }
                    is Resource.Error -> ErrorState(message = res.message ?: "Unknown Error", onRetry = { viewModel.loadCategories() }, modifier = Modifier.align(Alignment.Center))
                    else -> {}
                }
            }
        }
    }
}

@Composable
fun CategoryList(
    categories: List<Category>, 
    selectedIds: Set<String>,
    onSelect: (Category) -> Unit,
    onToggleSelect: (Category) -> Unit
) {
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(categories) { category ->
            val isSelected = selectedIds.contains(category.id)
            ListItem(
                headlineContent = { Text(category.name) },
                leadingContent = {
                    AsyncImage(
                        model = category.imageUrl,
                        contentDescription = null,
                        modifier = Modifier.size(50.dp).clip(CircleShape),
                        contentScale = ContentScale.Crop
                    )
                },
                trailingContent = {
                    IconButton(onClick = { onToggleSelect(category) }) {
                        Icon(
                            imageVector = if (isSelected) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                            contentDescription = null,
                            tint = if (isSelected) PrimaryGreen else Color.Gray
                        )
                    }
                },
                modifier = Modifier.clickable { onSelect(category) }
            )
            HorizontalDivider()
        }
    }
}

@Composable
fun EditCategoryContent(
    category: Category,
    onSave: (Category) -> Unit,
    onUploadImage: (String, Uri, Boolean) -> Unit
) {
    var categoryName by remember(category.id) { mutableStateOf(category.name) }
    var categoryImageUrl by remember(category.id, category.imageUrl) { mutableStateOf(category.imageUrl) }
    var subCategories by remember(category.id, category.subCategories) { mutableStateOf(category.subCategories) }
    var showError by remember(category.id) { mutableStateOf(false) }

    val categoryImageLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { onUploadImage(category.id, it, false) }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Text(stringResource(R.string.category_image), fontWeight = FontWeight.Bold)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(100.dp).clip(RoundedCornerShape(8.dp)).background(Color.LightGray).clickable {
                categoryImageLauncher.launch("image/*")
            }) {
                AsyncImage(
                    model = categoryImageUrl,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
                Icon(Icons.Default.AddAPhoto, contentDescription = null, modifier = Modifier.align(Alignment.Center), tint = Color.White)
            }
            
            Spacer(modifier = Modifier.width(12.dp))
            
            OutlinedTextField(
                value = categoryImageUrl,
                onValueChange = { 
                    categoryImageUrl = it
                },
                label = { Text(stringResource(R.string.paste_url_hint)) },
                modifier = Modifier.weight(1f),
                textStyle = androidx.compose.ui.text.TextStyle(fontSize = 12.sp)
            )
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        OutlinedTextField(
            value = categoryName, 
            onValueChange = { categoryName = it; if(it.isNotBlank()) showError = false }, 
            label = { Text(stringResource(R.string.category_name_label) + "*") }, 
            modifier = Modifier.fillMaxWidth(),
            isError = categoryName.isBlank() && showError
        )
        
        if (categoryName.isBlank() && showError) {
            Text("Category name is required", color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        Text(stringResource(R.string.sub_categories), fontWeight = FontWeight.Bold, fontSize = 18.sp)
        
        subCategories.forEachIndexed { index, sub ->
            SubCategoryEditItem(
                sub = sub,
                onUpdate = { updatedSub ->
                    val newList = subCategories.toMutableList()
                    newList[index] = updatedSub
                    subCategories = newList
                },
                onDelete = {
                    val newList = subCategories.toMutableList()
                    newList.removeAt(index)
                    subCategories = newList
                },
                onUpload = { uri -> onUploadImage(sub.id, uri, true) },
                onUrlUpdate = { url ->
                    val newList = subCategories.toMutableList()
                    newList[index] = sub.copy(imageUrl = url)
                    subCategories = newList
                }
            )
        }

        Spacer(modifier = Modifier.height(16.dp))
        Button(
            onClick = {
                val newSub = SubCategory(id = java.util.UUID.randomUUID().toString(), name = "")
                subCategories = subCategories + newSub
            },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = Color.LightGray)
        ) {
            Icon(Icons.Default.Add, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text(stringResource(R.string.add_sub_category))
        }

        Spacer(modifier = Modifier.height(32.dp))
        Button(
            onClick = { 
                if (categoryName.isNotBlank()) {
                    onSave(
                        Category(
                            id = category.id,
                            name = categoryName.trim(),
                            imageUrl = categoryImageUrl,
                            subCategories = subCategories
                        )
                    )
                } else {
                    showError = true
                }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = categoryName.isNotBlank()
        ) {
            Icon(Icons.Default.Save, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text(stringResource(R.string.save_category))
        }
    }
}

@Composable
fun SubCategoryEditItem(
    sub: SubCategory,
    onUpdate: (SubCategory) -> Unit,
    onDelete: () -> Unit,
    onUpload: (Uri) -> Unit,
    onUrlUpdate: (String) -> Unit
) {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { onUpload(it) }
    }

    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFFF9F9F9))) {
        Column(modifier = Modifier.padding(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.size(60.dp).clip(CircleShape).background(Color.LightGray).clickable {
                    launcher.launch("image/*")
                }) {
                    AsyncImage(model = sub.imageUrl, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    Icon(
                        imageVector = Icons.Default.AddAPhoto,
                        contentDescription = null,
                        modifier = Modifier.align(Alignment.Center).size(20.dp),
                        tint = Color.White
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                OutlinedTextField(
                    value = sub.name,
                    onValueChange = { onUpdate(sub.copy(name = it)) },
                    label = { Text(stringResource(R.string.sub_category_name)) },
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = onDelete) {
                    Icon(Icons.Default.Delete, contentDescription = "Delete", tint = Color.Red)
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = sub.imageUrl,
                onValueChange = { onUrlUpdate(it) },
                label = { Text(stringResource(R.string.sub_category_url)) },
                modifier = Modifier.fillMaxWidth(),
                textStyle = androidx.compose.ui.text.TextStyle(fontSize = 11.sp)
            )
        }
    }
}
