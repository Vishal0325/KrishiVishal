package com.company.krishivishal.ui.search

import android.app.Activity
import android.content.Intent
import android.speech.RecognizerIntent
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.company.krishivishal.core.model.RecentSearch
import com.company.krishivishal.core.model.SearchResult
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.ui.theme.PoppinsFamily
import java.util.Locale

/**
 * Global Search Screen - Material3 Design
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun GlobalSearchScreen(
    onBack: () -> Unit,
    onProductClick: (String) -> Unit,
    viewModel: SearchViewModel = hiltViewModel()
) {
    val searchState by viewModel.searchState.collectAsState()
    val context = LocalContext.current

    val voiceSearchLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val data = result.data
            val spokenText = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
            if (!spokenText.isNullOrBlank()) {
                viewModel.updateSearchQuery(spokenText)
            }
        }
    }

    val onVoiceSearch = {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
            putExtra(RecognizerIntent.EXTRA_PROMPT, "उत्पाद का नाम बोलें (Speak product name)...")
        }
        try {
            voiceSearchLauncher.launch(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Voice search is not supported on this device", Toast.LENGTH_SHORT).show()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Search Products", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.Close, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.shadow(4.dp)
            )
        },
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Search Bar Section
            item {
                SearchBarSection(
                    query = searchState.query,
                    onQueryChange = { viewModel.updateSearchQuery(it) },
                    onClear = { viewModel.updateSearchQuery("") },
                    onVoiceSearch = onVoiceSearch
                )
            }

            // Loading State
            if (searchState.isLoading) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = PrimaryGreen)
                    }
                }
            }

            // Error State
            if (searchState.error != null) {
                item {
                    ErrorMessageCard(searchState.error ?: "Something went wrong")
                }
            }

            // Search Results
            if (searchState.results.isNotEmpty()) {
                item {
                    Text(
                        "परिणाम (${searchState.results.size})", // "Results" in Hindi
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        fontFamily = PoppinsFamily,
                        color = Color.DarkGray,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }

                items(searchState.results) { result ->
                    SearchResultCard(
                        result = result,
                        onProductClick = {
                            onProductClick(result.id)
                        }
                    )
                }
            } else if (searchState.query.isEmpty() && searchState.recentSearches.isNotEmpty()) {
                // Recent Searches Section
                item {
                    RecentSearchesSection(
                        searches = searchState.recentSearches,
                        onSearchClick = { viewModel.searchFromRecent(it.query) },
                        onClearSearch = { viewModel.clearRecentSearch(it) },
                        onClearAll = { viewModel.clearAllRecentSearches() }
                    )
                }
            } else if (searchState.isEmpty) {
                // No Results State
                item {
                    NoResultsView(searchState.query)
                }
            } else if (searchState.query.isEmpty()) {
                // Initial Empty State
                item {
                    InitialSearchView()
                }
            }
        }
    }
}

/**
 * Search Bar with Material3 styling
 * - Leading Search Icon
 * - Trailing Clear Icon (shows only when typing)
 * - ImeAction.Search keyboard action
 */
@Composable
fun SearchBarSection(
    query: String,
    onQueryChange: (String) -> Unit,
    onClear: () -> Unit,
    onVoiceSearch: () -> Unit
) {
    val keyboardController = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current

    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp),
        placeholder = {
            Text(
                "Search fertilizers, seeds, tools...",
                color = Color.Gray,
                fontSize = 14.sp,
                fontFamily = PoppinsFamily
            )
        },
        leadingIcon = {
            Icon(
                Icons.Default.Search,
                contentDescription = "Search",
                tint = PrimaryGreen,
                modifier = Modifier.size(24.dp)
            )
        },
        trailingIcon = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (query.isNotEmpty()) {
                    IconButton(onClick = onClear, modifier = Modifier.size(28.dp)) {
                        Icon(
                            Icons.Default.Close,
                            contentDescription = "Clear",
                            tint = Color.Gray,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
                IconButton(onClick = onVoiceSearch, modifier = Modifier.size(28.dp)) {
                    Icon(
                        Icons.Default.Mic,
                        contentDescription = "Voice Search",
                        tint = PrimaryGreen,
                        modifier = Modifier.size(22.dp)
                    )
                }
                Spacer(modifier = Modifier.width(4.dp))
            }
        },
        singleLine = true,
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = PrimaryGreen,
            unfocusedBorderColor = Color.LightGray,
            focusedLabelColor = PrimaryGreen
        ),
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
            imeAction = ImeAction.Search
        ),
        keyboardActions = androidx.compose.foundation.text.KeyboardActions(
            onSearch = {
                keyboardController?.hide()
                // The search is already reactive via ViewModel's queryFlow debounce
            }
        ),
        textStyle = androidx.compose.ui.text.TextStyle(
            fontFamily = PoppinsFamily,
            fontSize = 16.sp
        )
    )
}

/**
 * Search Result Card
 * Displays product with image, name, price, and category tags
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SearchResultCard(
    result: SearchResult,
    onProductClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onProductClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Product Image
            AsyncImage(
                model = result.images.firstOrNull() ?: "https://via.placeholder.com/80",
                contentDescription = result.name,
                modifier = Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentScale = ContentScale.Crop
            )

            // Product Info
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(top = 4.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                // Product Name
                Text(
                    result.name,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    fontFamily = PoppinsFamily,
                    maxLines = 2,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                )

                // Category Tag Row (Category + Discount)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    // Category chip — constrained so long names don't overflow
                    Surface(
                        color = MaterialTheme.colorScheme.primaryContainer,
                        shape = RoundedCornerShape(6.dp),
                        modifier = Modifier.widthIn(max = 130.dp)
                    ) {
                        Text(
                            result.category,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            fontFamily = PoppinsFamily,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                        )
                    }

                    val calculatedDiscount = if (result.price > 0 && result.discountedPrice > 0 && result.price > result.discountedPrice) {
                        (((result.price - result.discountedPrice) / result.price) * 100).toInt()
                    } else 0

                    if (calculatedDiscount > 0) {
                        Surface(
                            color = Color(0xFFFF9800),
                            shape = RoundedCornerShape(6.dp)
                        ) {
                            Text(
                                "$calculatedDiscount% OFF",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                fontFamily = PoppinsFamily
                            )
                        }
                    }
                }

                // Price — guard against zero/missing values
                val displayPrice = if (result.discountedPrice > 0) result.discountedPrice else result.price
                val hasDiscount = result.price > 0 && result.discountedPrice > 0 && result.price > result.discountedPrice

                if (displayPrice > 0) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            "₹${displayPrice.toInt()}",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 16.sp,
                            color = PrimaryGreen,
                            fontFamily = PoppinsFamily
                        )
                        if (hasDiscount) {
                            Text(
                                "₹${result.price.toInt()}",
                                fontWeight = FontWeight.Medium,
                                fontSize = 13.sp,
                                color = Color.Gray,
                                textDecoration = TextDecoration.LineThrough,
                                fontFamily = PoppinsFamily
                            )
                        }
                    }
                }

                // Associated Crops Tags — use readable names, hide if none available
                val cropNames = result.cropAssociatedNames.filter { it.isNotBlank() }
                if (cropNames.isNotEmpty()) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        cropNames.take(2).forEach { cropName ->
                            Surface(
                                color = Color(0xFFFFF8E1),
                                shape = RoundedCornerShape(4.dp),
                                border = BorderStroke(0.5.dp, Color(0xFFFFD54F))
                            ) {
                                Text(
                                    cropName.replaceFirstChar { it.uppercase() }.take(14),
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFFF57F17),
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                    fontFamily = PoppinsFamily,
                                    maxLines = 1
                                )
                            }
                        }
                    }
                }

                // Rating & Stock
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(top = 4.dp)
                ) {
                    if (result.rating > 0) {
                        Text(
                            "⭐ ${result.rating}",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFFFA500),
                            fontFamily = PoppinsFamily
                        )
                        Text(
                            "(${result.reviewCount})",
                            fontSize = 10.sp,
                            color = Color.Gray,
                            fontFamily = PoppinsFamily
                        )
                    }
                    if (!result.inStock) {
                        Text(
                            "Out of Stock",
                            fontSize = 10.sp,
                            color = Color.Red,
                            fontWeight = FontWeight.SemiBold,
                            fontFamily = PoppinsFamily
                        )
                    }
                }
            }
        }
    }
}

/**
 * Recent Searches Section
 * Shows user's last 5 searches with quick access
 */
@Composable
fun RecentSearchesSection(
    searches: List<RecentSearch>,
    onSearchClick: (RecentSearch) -> Unit,
    onClearSearch: (RecentSearch) -> Unit,
    onClearAll: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Header with Clear All button
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "Recent Searches",
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                fontFamily = PoppinsFamily
            )
            TextButton(
                onClick = onClearAll,
                modifier = Modifier.height(32.dp)
            ) {
                Text(
                    "Clear All",
                    fontSize = 12.sp,
                    color = Color.Gray,
                    fontFamily = PoppinsFamily
                )
            }
        }

        // Recent searches list
        searches.forEach { search ->
            RecentSearchItem(
                search = search,
                onSearchClick = { onSearchClick(search) },
                onClear = { onClearSearch(search) }
            )
        }
    }
}

/**
 * Single Recent Search Item
 */
@Composable
fun RecentSearchItem(
    search: RecentSearch,
    onSearchClick: () -> Unit,
    onClear: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable { onSearchClick() }
            .padding(12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                Icons.Default.Search,
                contentDescription = null,
                tint = Color.Gray,
                modifier = Modifier.size(18.dp)
            )
            Text(
                search.query,
                fontSize = 14.sp,
                fontFamily = PoppinsFamily,
                color = MaterialTheme.colorScheme.onSurface
            )
        }

        IconButton(
            onClick = onClear,
            modifier = Modifier.size(32.dp)
        ) {
            Icon(
                Icons.Default.Delete,
                contentDescription = "Delete",
                tint = Color.Gray,
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

/**
 * No Results Found State
 * Elegant empty state with localized Hindi messages
 */
@Composable
fun NoResultsView(query: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Illustration (emoji)
        Text(
            "🚜",
            fontSize = 72.sp,
            modifier = Modifier.padding(vertical = 16.dp)
        )

        Text(
            "क्षमा करें, कोई उत्पाद नहीं मिला", // "Sorry, no products found" in Hindi
            fontWeight = FontWeight.Bold,
            fontSize = 20.sp,
            fontFamily = PoppinsFamily,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onBackground
        )

        Text(
            "हमें \"$query\" के लिए कुछ भी नहीं मिला।\n\nकृपया निम्न चीज़ें आज़माएं:\n• स्पेलिंग चेक करें\n• सामान्य शब्दों का उपयोग करें\n• अन्य कैटेगरी देखें",
            fontSize = 14.sp,
            color = Color.Gray,
            textAlign = TextAlign.Center,
            fontFamily = PoppinsFamily,
            lineHeight = 22.sp
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Button(
            onClick = { /* Reset search or navigate to categories */ },
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
            shape = RoundedCornerShape(8.dp)
        ) {
            Text("होम स्क्रीन पर जाएं", color = Color.White)
        }
    }
}

/**
 * Initial Empty State
 * Shows when user hasn't typed anything yet
 */
@Composable
fun InitialSearchView() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            "🌾",
            fontSize = 64.sp,
            modifier = Modifier.padding(vertical = 24.dp)
        )

        Text(
            "Find Products",
            fontWeight = FontWeight.Bold,
            fontSize = 18.sp,
            fontFamily = PoppinsFamily
        )

        Text(
            "Search for seeds, fertilizers, tools, and more to improve your farm.",
            fontSize = 13.sp,
            color = Color.Gray,
            textAlign = TextAlign.Center,
            fontFamily = PoppinsFamily,
            lineHeight = 18.sp
        )

        Text(
            "Popular Searches",
            fontWeight = FontWeight.SemiBold,
            fontSize = 13.sp,
            modifier = Modifier.padding(top = 16.dp),
            fontFamily = PoppinsFamily
        )

        // Popular search chips
        val popularSearches = listOf("Fertilizer", "Seeds", "Pesticide", "Organic")
        popularSearches.forEach { search ->
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(4.dp)
                    .clickable { /* Handle click */ }
            ) {
                Text(
                    search,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(12.dp),
                    fontFamily = PoppinsFamily
                )
            }
        }
    }
}

/**
 * Error Message Card
 */
@Composable
fun ErrorMessageCard(error: String) {
    Card(
        modifier = Modifier
            .fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFEBEE)),
        shape = RoundedCornerShape(8.dp)
    ) {
        Text(
            error,
            modifier = Modifier.padding(16.dp),
            color = Color(0xFFC62828),
            fontWeight = FontWeight.Medium,
            fontSize = 13.sp,
            fontFamily = PoppinsFamily
        )
    }
}

/**
 * Extension function for TopAppBar elevation
 */
private fun Modifier.elevation(dp: Dp) = this.shadow(elevation = dp)
