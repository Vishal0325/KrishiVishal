package com.company.krishivishal.ui.product

import android.content.Intent
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.company.krishivishal.R
import androidx.compose.ui.res.stringResource
import com.company.krishivishal.ui.components.*
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.Variant
import com.company.krishivishal.core.model.Review
import com.company.krishivishal.ui.theme.*
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.ShareUtils
import com.company.krishivishal.utils.SupportUtils
import com.company.krishivishal.ui.support.SupportViewModel
import java.text.SimpleDateFormat
import java.util.*
import androidx.compose.animation.core.tween
import com.company.krishivishal.ui.product.components.*
import androidx.compose.animation.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProductDetailScreen(
    productId: String,
    onBack: () -> Unit,
    onBuyNow: () -> Unit = {},
    onCartClick: () -> Unit = {},
    viewModel: ProductDetailViewModel = hiltViewModel(),
    supportViewModel: SupportViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val supportConfig by supportViewModel.config.collectAsState()
    val context = LocalContext.current
    var quantity by remember { mutableIntStateOf(1) }

    LaunchedEffect(productId) {
        viewModel.loadProduct(productId)
    }

    LaunchedEffect(uiState.navigateToCheckout) {
        if (uiState.navigateToCheckout) {
            onBuyNow()
            viewModel.onNavigatedToCheckout()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        text = stringResource(R.string.product_details), 
                        fontFamily = PoppinsFamily, 
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 18.sp
                    ) 
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    val config = (supportConfig as? Resource.Success)?.data
                    
                    IconButton(onClick = { 
                        if (config != null && config.whatsappNumber.isNotEmpty()) {
                            SupportUtils.openWhatsApp(context, config.whatsappNumber, context.getString(R.string.whatsapp_msg))
                        } else {
                            android.widget.Toast.makeText(context, "WhatsApp support not available", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    }) { 
                        Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = "WhatsApp Support", tint = Color(0xFF25D366)) 
                    }

                    IconButton(onClick = { 
                        if (config != null && config.supportCallNumber.isNotEmpty()) {
                            SupportUtils.makeCall(context, config.supportCallNumber)
                        } else {
                            SupportUtils.makeCall(context, "18001234567") // Fallback
                        }
                    }) { 
                        Icon(Icons.Default.Call, contentDescription = "Support Call", tint = PrimaryGreen) 
                    }
                    IconButton(onClick = { viewModel.toggleWishlist() }) { 
                        Icon(
                            if (uiState.isWishlisted) Icons.Default.Favorite else Icons.Outlined.FavoriteBorder, 
                            contentDescription = "Wishlist",
                            tint = if (uiState.isWishlisted) Color.Red else Color.Black
                        ) 
                    }
                    IconButton(onClick = onCartClick) { Icon(Icons.Outlined.ShoppingCart, contentDescription = "Cart") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        },
        bottomBar = {
            if (uiState.product != null) {
                val maxStock = uiState.selectedVariant?.stock ?: uiState.product!!.stockQuantity
                BottomActions(
                    quantity = quantity,
                    maxStock = maxStock,
                    onQuantityChange = { if (it in 1..maxStock) quantity = it },
                    onAddToCart = { viewModel.addToCart(quantity) },
                    onBuyNow = { viewModel.buyNow(quantity) }
                )
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize().background(Color.White)) {
            if (uiState.error != null && uiState.product == null) {
                ErrorState(
                    message = uiState.error!!,
                    onRetry = { viewModel.loadProduct(productId) },
                    modifier = Modifier.align(Alignment.Center)
                )
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    // 1. Product Image
                    item {
                        if (uiState.isProductLoading && uiState.product == null) {
                            ProductImageSkeleton()
                        } else {
                            uiState.product?.let { product ->
                                AnimatedContent(
                                    targetState = uiState.selectedVariant,
                                    transitionSpec = {
                                        fadeIn(animationSpec = tween(300)) togetherWith fadeOut(animationSpec = tween(300))
                                    },
                                    label = "product_image_anim"
                                ) { variant ->
                                    ProductImageSection(
                                        product = product,
                                        variant = variant,
                                        isWishlisted = uiState.isWishlisted,
                                        onWishlistToggle = { viewModel.toggleWishlist() },
                                        onShare = {
                                            ShareUtils.shareProduct(context, product)
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // 2. Product Info
                    item {
                        if (uiState.isProductLoading && uiState.product == null) {
                            ProductInfoSkeleton()
                        } else {
                            uiState.product?.let { product ->
                                AnimatedContent(
                                    targetState = uiState.selectedVariant,
                                    transitionSpec = {
                                        slideInVertically { it / 2 } + fadeIn() togetherWith slideOutVertically { -it / 2 } + fadeOut()
                                    },
                                    label = "product_info_anim"
                                ) { variant ->
                                    ProductInfoSection(product, variant)
                                }
                            }
                        }
                    }

                    // 3. Variants Section
                    item {
                        if (uiState.isVariantsLoading && uiState.variants.isEmpty()) {
                            VariantsSkeleton()
                        } else if (uiState.variants.isNotEmpty()) {
                            VariantsSection(
                                variants = uiState.variants,
                                selectedVariant = uiState.selectedVariant,
                                onVariantSelect = { viewModel.selectVariant(it) },
                                product = uiState.product!!
                            )
                        }
                    }

                    if (uiState.product != null) {
                        val product = uiState.product!!
                        
                        // 4. Composition Card
                        item {
                            CompositionCard(product.composition)
                        }

                        // 5. Feature Boxes
                        item {
                            FeatureBoxesSection(product)
                        }

                        // 6. Delivery Info
                        item {
                            DeliveryInfoSection(product.deliveryLocation, product.deliveryDate)
                        }

                        // 7. Tabs Section
                        item {
                            ProductTabsSection(
                                selectedTabIndex = uiState.selectedTabIndex,
                                onTabClick = { viewModel.setTab(it) },
                                product = product,
                                selectedVariant = uiState.selectedVariant,
                                reviews = uiState.reviews,
                                isReviewsLoading = uiState.isReviewsLoading
                            )
                        }
                    }

                    item { Spacer(modifier = Modifier.height(20.dp)) }
                }
            }
            
            // Snackbar for cart messages
            uiState.cartMessage?.let { message ->
                LaunchedEffect(message) {
                    kotlinx.coroutines.delay(2000)
                    viewModel.clearCartMessage()
                }
                Surface(
                    modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
                    color = Color.Black.copy(alpha = 0.8f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(message, color = Color.White, modifier = Modifier.padding(12.dp))
                }
            }

            // Login prompt for wishlist
            if (uiState.showLoginPrompt) {
                LaunchedEffect(Unit) {
                    kotlinx.coroutines.delay(3000)
                    viewModel.onLoginPromptShown()
                }
                Surface(
                    modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
                    color = Color.Black.copy(alpha = 0.8f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = "Login to save items to your wishlist",
                        color = Color.White,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }
        }
    }
}
