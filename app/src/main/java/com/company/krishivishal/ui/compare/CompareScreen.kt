package com.company.krishivishal.ui.compare

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.ui.theme.PrimaryGreen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CompareScreen(
    products: List<Product>,
    onBack: () -> Unit,
    onRemoveProduct: (String) -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Compare Products", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        if (products.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No products selected for comparison")
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .horizontalScroll(rememberScrollState())
            ) {
                // Table Header (Products)
                Row(modifier = Modifier.padding(16.dp)) {
                    Spacer(modifier = Modifier.width(120.dp))
                    products.forEach { product ->
                        CompareProductHeader(product, onRemove = { onRemoveProduct(product.id) })
                        Spacer(modifier = Modifier.width(16.dp))
                    }
                }

                HorizontalDivider()

                LazyColumn(modifier = Modifier.fillMaxWidth()) {
                    item {
                        CompareRow("Brand", products.map { it.brand })
                        CompareRow("Technical", products.map { it.composition })
                        CompareRow("Category", products.map { it.category })
                        CompareRow("Price", products.map { "₹${it.basePrice.toInt()}" })
                        CompareRow("Stock", products.map { if (it.stockQuantity > 0) "In Stock" else "Out of Stock" })
                        CompareRow("Weight", products.map { it.weight + " " + it.unit })
                    }
                }
            }
        }
    }
}

@Composable
fun CompareProductHeader(product: Product, onRemove: () -> Unit) {
    Column(modifier = Modifier.width(150.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box {
            AsyncImage(
                model = product.imageUrl,
                contentDescription = null,
                modifier = Modifier.size(100.dp),
                contentScale = ContentScale.Fit
            )
            IconButton(
                onClick = onRemove,
                modifier = Modifier.align(Alignment.TopEnd).size(24.dp).background(Color.White, CircleShape)
            ) {
                Icon(Icons.Default.Close, null, modifier = Modifier.size(16.dp))
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = product.name,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
fun CompareRow(label: String, values: List<String>) {
    Column {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = label,
                modifier = Modifier.width(120.dp),
                fontWeight = FontWeight.Bold,
                color = Color.Gray,
                fontSize = 13.sp
            )
            values.forEach { value ->
                Text(
                    text = value,
                    modifier = Modifier.width(150.dp).padding(horizontal = 8.dp),
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.width(16.dp))
            }
        }
        HorizontalDivider(color = Color.LightGray.copy(alpha = 0.5f))
    }
}
