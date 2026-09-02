package com.company.krishivishal.ui.admin

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.Variant
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.ShareUtils
import kotlinx.coroutines.flow.collectLatest
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AdminProductScreen(
    onBack: () -> Unit,
    viewModel: AdminProductViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    
    val importLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        uri?.let { viewModel.importCsv(it) }
    }

    LaunchedEffect(Unit) {
        viewModel.csvEvent.collectLatest { res ->
            when(res) {
                is Resource.Success -> {
                    val data = res.data
                    if (data is String) {
                        val uri = ShareUtils.saveTextToFile(context, "products_export.csv", data)
                        uri?.let { ShareUtils.shareFile(context, it, "text/csv") }
                    } else {
                        snackbarHostState.showSnackbar("Successfully imported $data products")
                    }
                }
                is Resource.Error -> snackbarHostState.showSnackbar("Error: ${res.message}")
                else -> {}
            }
        }
    }

    var selectedProductBase by remember { mutableStateOf<Product?>(null) }
    var isAddingNew by remember { mutableStateOf(false) }
    var productToDelete by remember { mutableStateOf<Product?>(null) }

    if (productToDelete != null) {
        AlertDialog(
            onDismissRequest = { productToDelete = null },
            title = { Text("Delete Product") },
            text = { Text("Are you sure you want to delete '${productToDelete?.name}'? This action cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        val deletingProduct = productToDelete
                        if (deletingProduct != null) {
                            viewModel.deleteProduct(deletingProduct.id)
                        }
                        productToDelete = null
                        if (selectedProductBase != null) {
                            selectedProductBase = null
                            viewModel.clearProductDetail()
                        }
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = Color.Red)
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { productToDelete = null }) { Text("Cancel") }
            }
        )
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(if (selectedProductBase == null && !isAddingNew) "Manage Products" else if (isAddingNew) "Add Product" else "Edit Product") },
                navigationIcon = {
                    IconButton(onClick = {
                        if (selectedProductBase == null && !isAddingNew) onBack()
                        else {
                            selectedProductBase = null
                            isAddingNew = false
                            viewModel.clearProductDetail()
                        }
                    }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (selectedProductBase == null && !isAddingNew) {
                        IconButton(onClick = { viewModel.exportCsv() }) {
                            Icon(Icons.Default.Download, contentDescription = "Export CSV")
                        }
                        IconButton(onClick = { importLauncher.launch(arrayOf("text/comma-separated-values", "text/csv")) }) {
                            Icon(Icons.Default.Upload, contentDescription = "Import CSV")
                        }
                        IconButton(onClick = { isAddingNew = true }) {
                            Icon(Icons.Default.Add, contentDescription = "Add Product")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            when {
                isAddingNew -> {
                    EditProductContent(
                        product = Product(id = UUID.randomUUID().toString()),
                        categories = (uiState.categoriesResource as? Resource.Success)?.data ?: emptyList(),
                        brands = (uiState.brandsResource as? Resource.Success)?.data ?: emptyList(),
                        crops = (uiState.cropsResource as? Resource.Success)?.data ?: emptyList(),
                        onSave = {
                            viewModel.saveProduct(it)
                            isAddingNew = false
                        },
                        onDelete = null
                    )
                }
                selectedProductBase != null -> {
                    val selectedProduct = selectedProductBase
                    if (selectedProduct != null) {
                        LaunchedEffect(selectedProduct.id) {
                            viewModel.loadProductDetails(selectedProduct.id)
                        }
                    }

                    when (val res = uiState.productDetailResource) {
                        is Resource.Loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                        is Resource.Success -> {
                            val fullProduct = res.data
                            if (fullProduct != null) {
                                EditProductContent(
                                    product = fullProduct,
                                    categories = (uiState.categoriesResource as? Resource.Success)?.data ?: emptyList(),
                                    brands = (uiState.brandsResource as? Resource.Success)?.data ?: emptyList(),
                                    crops = (uiState.cropsResource as? Resource.Success)?.data ?: emptyList(),
                                    onSave = {
                                        viewModel.saveProduct(it)
                                        selectedProductBase = null
                                        viewModel.clearProductDetail()
                                    },
                                    onDelete = {
                                        productToDelete = fullProduct
                                    }
                                )
                            }
                        }
                        is Resource.Error -> Text("Error: ${res.message}", modifier = Modifier.align(Alignment.Center))
                        else -> {}
                    }
                }
                else -> {
                    when (val res = uiState.productsResource) {
                        is Resource.Loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                        is Resource.Success -> {
                            ProductList(
                                products = res.data ?: emptyList(), 
                                onSelect = { selectedProductBase = it },
                                onDelete = { productToDelete = it }
                            )
                        }
                        is Resource.Error -> Text("Error: ${res.message}", modifier = Modifier.align(Alignment.Center))
                        else -> {}
                    }
                }
            }
        }
    }
}

@Composable
fun ProductList(products: List<Product>, onSelect: (Product) -> Unit, onDelete: (Product) -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(products) { product ->
            ListItem(
                headlineContent = { Text(product.name) },
                supportingContent = { 
                    Column {
                        if (product.composition.isNotEmpty()) {
                            Text(product.composition, color = Color.Gray, fontSize = 12.sp)
                        }
                        Text("Category: ${product.category} | Brand: ${product.brand}")
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Stock: ", color = Color.Gray, fontSize = 13.sp)
                            Text(
                                text = "${product.stockQuantity}",
                                fontWeight = FontWeight.Bold,
                                color = if (product.stockQuantity < 10) Color.Red else Color.Black,
                                fontSize = 13.sp
                            )
                            if (product.stockQuantity < 10) {
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("LOW STOCK", color = Color.Red, fontSize = 10.sp, fontWeight = FontWeight.Black)
                            }
                            Spacer(modifier = Modifier.width(16.dp))
                            Column {
                                if (product.mrp > product.discountedPrice && product.discountedPrice > 0) {
                                    Text(
                                        text = "MRP: ₹${product.mrp}",
                                        style = androidx.compose.ui.text.TextStyle(textDecoration = androidx.compose.ui.text.style.TextDecoration.LineThrough),
                                        color = Color.Gray,
                                        fontSize = 11.sp
                                    )
                                }
                                val displayPrice = if (product.discountedPrice > 0) product.discountedPrice else product.basePrice
                                Text("Price: ₹$displayPrice", fontWeight = FontWeight.Bold, color = PrimaryGreen, fontSize = 13.sp)
                                if (product.weight.isNotBlank()) {
                                    Text("${product.weight} ${product.unit}", color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                },
                leadingContent = {
                    AsyncImage(
                        model = product.imageUrl.ifEmpty { product.images.firstOrNull() },
                        contentDescription = null,
                        modifier = Modifier.size(50.dp).clip(RoundedCornerShape(8.dp)),
                        contentScale = androidx.compose.ui.layout.ContentScale.Crop
                    )
                },
                trailingContent = {
                    IconButton(onClick = { onDelete(product) }) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete", tint = Color.Red.copy(alpha = 0.6f))
                    }
                },
                modifier = Modifier.clickable { onSelect(product) }
            )
            HorizontalDivider()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun EditProductContent(
    product: Product,
    categories: List<com.company.krishivishal.core.model.Category>,
    brands: List<com.company.krishivishal.core.model.Brand>,
    crops: List<com.company.krishivishal.core.model.Crop>,
    onSave: (Product) -> Unit,
    onDelete: (() -> Unit)? = null
) {
    var name by remember { mutableStateOf(product.name) }
    var composition by remember { mutableStateOf(product.composition) }
    var classification by remember { mutableStateOf(product.classification) }
    var basePrice by remember { mutableStateOf(product.basePrice.toString()) }
    var mrp by remember { mutableStateOf(product.mrp.toString()) }
    var discountedPrice by remember { mutableStateOf(product.discountedPrice.toString()) }
    var stock by remember { mutableStateOf(product.stockQuantity.toString()) }
    var description by remember { mutableStateOf(product.description) }
    var weight by remember { mutableStateOf(product.weight) }
    var unit by remember { mutableStateOf(product.unit) }
    
    var imageUrls by remember { 
        val initialList = product.images.toMutableList()
        if (initialList.isEmpty() && product.imageUrl.isNotEmpty()) {
            initialList.add(product.imageUrl)
        }
        mutableStateOf(initialList) 
    }
    
    var category by remember { mutableStateOf(product.category) }
    var subCategory by remember { mutableStateOf(product.subCategory) }
    var brand by remember { mutableStateOf(product.brand) }
    var isReturnable by remember { mutableStateOf(product.isReturnable) }

    var associatedCropIds by remember { mutableStateOf(product.associatedCropIds.toMutableList()) }
    var associatedCropNames by remember { mutableStateOf(product.associatedCropNames.toMutableList()) }
    var isAllCrops by remember { mutableStateOf(product.isAllCrops) }
    
    var variants by remember { mutableStateOf(product.variants.toMutableList()) }

    var categoryExpanded by remember { mutableStateOf(false) }
    var brandExpanded by remember { mutableStateOf(false) }
    var cropExpanded by remember { mutableStateOf(false) }

    var showError by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        if (showError) {
            Surface(
                color = MaterialTheme.colorScheme.errorContainer,
                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text(
                    "Please fill all mandatory fields (Name, Brand, Category, Price)",
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    modifier = Modifier.padding(16.dp),
                    fontSize = 14.sp
                )
            }
        }

        OutlinedTextField(
            value = name,
            onValueChange = { name = it; if(it.isNotBlank()) showError = false },
            label = { Text("Product Name*") },
            modifier = Modifier.fillMaxWidth(),
            isError = name.isBlank() && showError
        )
        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(value = composition, onValueChange = { composition = it }, label = { Text("Chemical Composition") }, modifier = Modifier.fillMaxWidth())
        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(value = classification, onValueChange = { classification = it }, label = { Text("Classification") }, modifier = Modifier.fillMaxWidth())
        Spacer(modifier = Modifier.height(8.dp))

        ExposedDropdownMenuBox(
            expanded = brandExpanded,
            onExpandedChange = { brandExpanded = !brandExpanded },
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                value = brand,
                onValueChange = { brand = it; if(it.isNotBlank()) showError = false },
                label = { Text("Brand*") },
                modifier = Modifier.fillMaxWidth().menuAnchor(),
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = brandExpanded) },
                isError = brand.isBlank() && showError
            )
            ExposedDropdownMenu(
                expanded = brandExpanded,
                onDismissRequest = { brandExpanded = false }
            ) {
                brands.forEach { b ->
                    DropdownMenuItem(
                        text = { Text(b.name) },
                        onClick = {
                            brand = b.name
                            brandExpanded = false
                        }
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(8.dp))

        ExposedDropdownMenuBox(
            expanded = categoryExpanded,
            onExpandedChange = { categoryExpanded = !categoryExpanded },
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                value = category,
                onValueChange = { category = it; if(it.isNotBlank()) showError = false },
                label = { Text("Category*") },
                modifier = Modifier.fillMaxWidth().menuAnchor(),
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = categoryExpanded) },
                isError = category.isBlank() && showError
            )
            ExposedDropdownMenu(
                expanded = categoryExpanded,
                onDismissRequest = { categoryExpanded = false }
            ) {
                categories.forEach { c ->
                    DropdownMenuItem(
                        text = { Text(c.name) },
                        onClick = {
                            category = c.name
                            categoryExpanded = false
                        }
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(value = subCategory, onValueChange = { subCategory = it }, label = { Text("Sub-Category") }, modifier = Modifier.fillMaxWidth())
        Spacer(modifier = Modifier.height(12.dp))

        Text("Product Options", fontWeight = FontWeight.Bold, fontSize = 16.sp)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Switch(checked = isReturnable, onCheckedChange = { isReturnable = it })
            Spacer(modifier = Modifier.width(8.dp))
            Text(if (isReturnable) "Product is Returnable" else "Non-Returnable")
        }
        Spacer(modifier = Modifier.height(12.dp))

        Text("Associated Crops", fontWeight = FontWeight.Bold, fontSize = 16.sp)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = isAllCrops, onCheckedChange = { isAllCrops = it })
            Text("Available for ALL Crops")
        }

        if (!isAllCrops) {
            FlowRow(
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                associatedCropNames.forEachIndexed { index, name ->
                    InputChip(
                        selected = true,
                        onClick = {
                            val newNames = associatedCropNames.toMutableList()
                            val newIds = associatedCropIds.toMutableList()
                            newNames.removeAt(index)
                            newIds.removeAt(index)
                            associatedCropNames = newNames
                            associatedCropIds = newIds
                        },
                        label = { Text(name) },
                        trailingIcon = { Icon(Icons.Default.Close, null, modifier = Modifier.size(16.dp)) }
                    )
                }
            }

            ExposedDropdownMenuBox(
                expanded = cropExpanded,
                onExpandedChange = { cropExpanded = !cropExpanded },
                modifier = Modifier.fillMaxWidth()
            ) {
                OutlinedTextField(
                    value = "",
                    onValueChange = { },
                    readOnly = true,
                    label = { Text("Add Crop") },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = cropExpanded) },
                    placeholder = { Text("Select to add...") }
                )
                ExposedDropdownMenu(
                    expanded = cropExpanded,
                    onDismissRequest = { cropExpanded = false }
                ) {
                    crops.forEach { c ->
                        if (!associatedCropIds.contains(c.id)) {
                            DropdownMenuItem(
                                text = { Text(c.name) },
                                onClick = {
                                    associatedCropIds = (associatedCropIds + c.id).toMutableList()
                                    associatedCropNames = (associatedCropNames + c.name).toMutableList()
                                    cropExpanded = false
                                }
                            )
                        }
                    }
                }
            }
        }
        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(value = weight, onValueChange = { weight = it }, label = { Text("Weight") }, modifier = Modifier.fillMaxWidth())
        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(value = unit, onValueChange = { unit = it }, label = { Text("Unit (ml, gm, kg)") }, modifier = Modifier.fillMaxWidth())
        Spacer(modifier = Modifier.height(16.dp))

        Text("Product Images", fontWeight = FontWeight.Bold, fontSize = 16.sp)
        imageUrls.forEachIndexed { index, url ->
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = url, 
                    onValueChange = { newUrl ->
                        val newList = imageUrls.toMutableList()
                        newList[index] = newUrl
                        imageUrls = newList
                    }, 
                    label = { Text("Image URL ${index + 1}") }, 
                    modifier = Modifier.weight(1f),
                    trailingIcon = {
                        IconButton(onClick = {
                            val newList = imageUrls.toMutableList()
                            newList.removeAt(index)
                            imageUrls = newList
                        }) {
                            Icon(Icons.Default.RemoveCircleOutline, null, tint = Color.Red)
                        }
                    }
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
        }
        
        Button(
            onClick = { imageUrls = (imageUrls + "").toMutableList() },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = Color.LightGray)
        ) {
            Icon(Icons.Default.AddPhotoAlternate, null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Add Another Image")
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = mrp, 
                onValueChange = { mrp = it }, 
                label = { Text("MRP (Strike-through)") }, 
                modifier = Modifier.weight(1f),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
                placeholder = { Text("0.0") }
            )
            OutlinedTextField(
                value = basePrice, 
                onValueChange = { basePrice = it }, 
                label = { Text("Base Price*") },
                modifier = Modifier.weight(1f),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
                isError = (basePrice.toDoubleOrNull() ?: 0.0) <= 0.0 && showError,
                placeholder = { Text("0.0") }
            )
        }
        
        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = discountedPrice, 
            onValueChange = { discountedPrice = it; if((it.toDoubleOrNull() ?: 0.0) > 0) showError = false },
            label = { Text("Final Selling Price*") },
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
            isError = (discountedPrice.toDoubleOrNull() ?: 0.0) <= 0.0 && showError,
            placeholder = { Text("0.0") }
        )
        
        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(value = stock, onValueChange = { stock = it }, label = { Text("Stock Quantity") }, modifier = Modifier.fillMaxWidth())
        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(value = description, onValueChange = { description = it }, label = { Text("Description") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
        
        Spacer(modifier = Modifier.height(16.dp))
        Text("Product Variants", fontWeight = FontWeight.Bold, fontSize = 16.sp)
        
        variants.forEachIndexed { index, variant ->
            VariantEditItem(
                variant = variant,
                onUpdate = { updated ->
                    val newList = variants.toMutableList()
                    newList[index] = updated
                    variants = newList
                },
                onDelete = {
                    val newList = variants.toMutableList()
                    newList.removeAt(index)
                    variants = newList
                }
            )
        }

        Button(
            onClick = {
                variants = (variants + Variant(id = UUID.randomUUID().toString(), productId = product.id)).toMutableList()
            },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = Color.LightGray)
        ) {
            Icon(Icons.Default.Add, null)
            Text("Add Variant")
        }

        Spacer(modifier = Modifier.height(24.dp))
        Button(
            onClick = {
                val parsedMrp = mrp.toDoubleOrNull() ?: 0.0
                val parsedBasePrice = basePrice.toDoubleOrNull() ?: 0.0
                val parsedDiscountedPrice = discountedPrice.toDoubleOrNull() ?: 0.0
                val finalImages = imageUrls.filter { it.isNotBlank() }
                
                if (name.isNotBlank() && brand.isNotBlank() && category.isNotBlank() && parsedDiscountedPrice > 0) {
                    onSave(product.copy(
                        name = name,
                        composition = composition,
                        classification = classification,
                        brand = brand,
                        category = category,
                        associatedCropIds = associatedCropIds,
                        associatedCropNames = associatedCropNames,
                        isAllCrops = isAllCrops,
                        subCategory = subCategory,
                        weight = weight,
                        unit = unit,
                        imageUrl = finalImages.firstOrNull() ?: "",
                        images = finalImages,
                        isReturnable = isReturnable,
                        mrp = if (parsedMrp > 0) parsedMrp else parsedBasePrice,
                        basePrice = parsedBasePrice,
                        discountedPrice = parsedDiscountedPrice,
                        stockQuantity = stock.toIntOrNull() ?: 0,
                        stock = stock.toIntOrNull() ?: 0,
                        description = description,
                        variants = variants
                    ))
                } else {
                    showError = true
                }
            },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
        ) {
            Text("Save Product")
        }

        if (onDelete != null) {
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(
                onClick = onDelete,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.Red),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color.Red)
            ) {
                Icon(Icons.Default.Delete, null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Delete Product")
            }
        }
    }
}

@Composable
fun VariantEditItem(variant: Variant, onUpdate: (Variant) -> Unit, onDelete: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF9F9F9)),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE0E0E0))
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = variant.size,
                    onValueChange = { onUpdate(variant.copy(size = it, label = it)) },
                    label = { Text("Size / Pack (e.g. 500ml, 50kg)") },
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = onDelete) {
                    Icon(Icons.Default.Delete, null, tint = Color.Red)
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = variant.skuCode,
                    onValueChange = { onUpdate(variant.copy(skuCode = it.trim().uppercase())) },
                    label = { Text("SKU Code") },
                    placeholder = { Text("CC-III-VVV-GG-SSSUU-BBB") },
                    modifier = Modifier.weight(1.2f)
                )
                OutlinedTextField(
                    value = variant.barcode,
                    onValueChange = { onUpdate(variant.copy(barcode = it.trim())) },
                    label = { Text("Barcode / EAN") },
                    modifier = Modifier.weight(0.8f)
                )
            }

            Spacer(modifier = Modifier.height(6.dp))
            
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = if (variant.basePrice > 0) variant.basePrice.toString() else "",
                    onValueChange = { onUpdate(variant.copy(basePrice = it.toDoubleOrNull() ?: 0.0)) },
                    label = { Text("MRP") },
                    modifier = Modifier.weight(1f),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number)
                )
                OutlinedTextField(
                    value = if (variant.price > 0) variant.price.toString() else "",
                    onValueChange = { onUpdate(variant.copy(price = it.toDoubleOrNull() ?: 0.0)) },
                    label = { Text("Selling Price*") },
                    modifier = Modifier.weight(1f),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number)
                )
                OutlinedTextField(
                    value = if (variant.stock > 0) variant.stock.toString() else "0",
                    onValueChange = { onUpdate(variant.copy(stock = it.toIntOrNull() ?: 0)) },
                    label = { Text("Stock") },
                    modifier = Modifier.weight(1f),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number)
                )
            }

            Spacer(modifier = Modifier.height(6.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = variant.batchNumber,
                    onValueChange = { onUpdate(variant.copy(batchNumber = it.trim().uppercase())) },
                    label = { Text("Batch Number") },
                    placeholder = { Text("e.g. BTH-2026-001") },
                    modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value = if (variant.reorderLevel > 0) variant.reorderLevel.toString() else "",
                    onValueChange = { onUpdate(variant.copy(reorderLevel = it.toIntOrNull() ?: 0)) },
                    label = { Text("Reorder Level") },
                    placeholder = { Text("e.g. 50") },
                    modifier = Modifier.weight(1f),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number)
                )
            }
        }
    }
}
