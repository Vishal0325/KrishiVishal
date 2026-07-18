package com.company.krishivishal.ui.main

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Spa
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.data.model.Category
import com.company.krishivishal.data.model.Crop
import com.company.krishivishal.data.model.Product
import com.company.krishivishal.data.model.Order
import com.company.krishivishal.ui.cart.CartScreen
import com.company.krishivishal.ui.profile.ProfileScreen
import com.company.krishivishal.ui.wishlist.WishlistScreen
import com.company.krishivishal.ui.address.AddressScreen
import com.company.krishivishal.ui.order.OrderScreen
import com.company.krishivishal.ui.order.OrderBillScreen
import com.company.krishivishal.ui.checkout.CheckoutScreen
import com.company.krishivishal.ui.checkout.CheckoutSource
import com.company.krishivishal.ui.support.SupportScreen
import com.company.krishivishal.ui.feature.auth.LoginScreen
import com.company.krishivishal.ui.category.CategoryScreen
import com.company.krishivishal.ui.crop.CropScreen
import com.company.krishivishal.ui.product.BrandScreen
import com.company.krishivishal.ui.product.AllProductsScreen
import com.company.krishivishal.ui.home.HomeScreen
import com.company.krishivishal.ui.product.*
import com.company.krishivishal.ui.settings.SettingsScreen
import com.company.krishivishal.ui.admin.*
import com.company.krishivishal.ui.common.components.KrishiBottomBar
import com.company.krishivishal.ui.navigation.BottomNavItem
import com.company.krishivishal.ui.profile.ProfileViewModel
import com.company.krishivishal.ui.theme.PrimaryGreen

@Composable
fun MainScreen(
    initialProductId: String? = null,
    viewModel: MainViewModel = hiltViewModel()
) {
    val bottomBarState by viewModel.bottomBarState.collectAsState()
    var selectedItem by remember { mutableIntStateOf(0) }
    
    // Sync local selectedItem with ViewModel state if needed, 
    // but we'll prioritize local for now to maintain existing logic.
    LaunchedEffect(bottomBarState.selectedItem) {
        selectedItem = bottomBarState.selectedItem.index
    }
    val selectedCategory = remember { mutableStateOf<Category?>(null) }
    val selectedBrand = remember { mutableStateOf<String?>(null) }
    val selectedCrop = remember { mutableStateOf<Crop?>(null) }
    val selectedProduct = remember { mutableStateOf<String?>(initialProductId) }
    val showWishlist = remember { mutableStateOf(false) }
    val showAllCategories = remember { mutableStateOf(false) }
    val showAllBrands = remember { mutableStateOf(false) }
    val showAllProducts = remember { mutableStateOf(false) }
    val showAddresses = remember { mutableStateOf(false) }
    val showOrders = remember { mutableStateOf(false) }
    val showSupport = remember { mutableStateOf(false) }
    val showSettings = remember { mutableStateOf(false) }
    val showLogin = remember { mutableStateOf(false) }
    val showCheckout = remember { mutableStateOf<CheckoutSource?>(null) }
    val showTracking = remember { mutableStateOf<String?>(null) } // OrderID
    val showBill = remember { mutableStateOf<Order?>(null) }
    val showAdminPanel = remember { mutableStateOf(false) }
    val showAdminCategories = remember { mutableStateOf(false) }
    val showAdminBrands = remember { mutableStateOf(false) }
    val showAdminCrops = remember { mutableStateOf(false) }
    val showAdminProducts = remember { mutableStateOf(false) }
    val showAdminOrders = remember { mutableStateOf(false) }
    val showAdminUsers = remember { mutableStateOf<String?>(null) }
    val showAdminCoupons = remember { mutableStateOf(false) }
    val showAdminBanners = remember { mutableStateOf(false) }
    val showAdminSettings = remember { mutableStateOf(false) }
    
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            val showBottomNav = !showWishlist.value && !showAllCategories.value && !showAllBrands.value && 
                                !showAllProducts.value && !showAddresses.value && !showOrders.value &&
                                !showSupport.value && !showLogin.value &&
                                showCheckout.value == null && !showSettings.value && showTracking.value == null &&
                                showBill.value == null &&
                                !showAdminPanel.value && !showAdminCategories.value && !showAdminBrands.value &&
                                !showAdminCrops.value && !showAdminProducts.value && !showAdminOrders.value &&
                                !showAdminSettings.value && showAdminUsers.value == null && !showAdminCoupons.value &&
                                !showAdminBanners.value &&
                                selectedProduct.value == null && selectedBrand.value == null && 
                                (selectedItem != 1 || selectedCategory.value == null)
            
            if (showBottomNav) {
                KrishiBottomBar(
                    selectedIndex = selectedItem,
                    onItemSelected = { index ->
                        selectedItem = index
                        selectedCategory.value = null
                        selectedBrand.value = null
                        selectedProduct.value = null
                        showWishlist.value = false
                        viewModel.onItemSelected(index)
                    },
                    badges = bottomBarState.badges
                )
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when {
                showAdminPanel.value -> {
                    AdminPanelScreen(
                        onBack = { showAdminPanel.value = false },
                        onManageCategories = { showAdminCategories.value = true; showAdminPanel.value = false },
                        onManageBrands = { showAdminBrands.value = true; showAdminPanel.value = false },
                        onManageCrops = { showAdminCrops.value = true; showAdminPanel.value = false },
                        onManageProducts = { showAdminProducts.value = true; showAdminPanel.value = false },
                        onManageOrders = { showAdminOrders.value = true; showAdminPanel.value = false },
                        onManageUsers = { role -> showAdminUsers.value = role; showAdminPanel.value = false },
                        onManageCoupons = { showAdminCoupons.value = true; showAdminPanel.value = false },
                        onManageBanners = { showAdminBanners.value = true; showAdminPanel.value = false },
                        onSettings = { showAdminSettings.value = true; showAdminPanel.value = false }
                    )
                }
                showAdminCategories.value -> {
                    AdminCategoryScreen(onBack = { showAdminCategories.value = false; showAdminPanel.value = true })
                }
                showAdminBrands.value -> {
                    AdminBrandScreen(onBack = { showAdminBrands.value = false; showAdminPanel.value = true })
                }
                showAdminCrops.value -> {
                    AdminCropScreen(onBack = { showAdminCrops.value = false; showAdminPanel.value = true })
                }
                showAdminProducts.value -> {
                    AdminProductScreen(onBack = { showAdminProducts.value = false; showAdminPanel.value = true })
                }
                showAdminOrders.value -> {
                    AdminOrderScreen(onBack = { showAdminOrders.value = false; showAdminPanel.value = true })
                }
                showAdminUsers.value != null -> {
                    AdminUserScreen(
                        initialRole = showAdminUsers.value,
                        onBack = { showAdminUsers.value = null; showAdminPanel.value = true }
                    )
                }
                showAdminCoupons.value -> {
                    AdminCouponScreen(onBack = { showAdminCoupons.value = false; showAdminPanel.value = true })
                }
                showAdminBanners.value -> {
                    AdminBannerScreen(onBack = { showAdminBanners.value = false; showAdminPanel.value = true })
                }
                showAdminSettings.value -> {
                    AdminSettingsScreen(onBack = { showAdminSettings.value = false; showAdminPanel.value = true })
                }
                showWishlist.value -> {
                    WishlistScreen(
                        onBack = { showWishlist.value = false },
                        onProductClick = { product ->
                            selectedProduct.value = product.id
                            showWishlist.value = false
                        },
                        onAddToCart = { /* Handled in detailed logic if needed */ },
                        onBuyNow = { product ->
                            selectedProduct.value = product.id
                            showWishlist.value = false
                        }
                    )
                }
                showAllCategories.value -> {
                    CategoryScreen(
                        onCategoryClick = { category ->
                            selectedCategory.value = category
                            showAllCategories.value = false
                            selectedItem = 1 // Switch to Crops/Category tab
                        },
                        onBack = { showAllCategories.value = false }
                    )
                }
                showAllBrands.value -> {
                    BrandScreen(
                        onBrandClick = { brandName ->
                            selectedBrand.value = brandName
                            showAllBrands.value = false
                        },
                        onBack = { showAllBrands.value = false }
                    )
                }
                showAllProducts.value -> {
                    AllProductsScreen(
                        onProductClick = { product ->
                            selectedProduct.value = product.id
                            showAllProducts.value = false
                        },
                        onBuyNowClick = { product ->
                            selectedProduct.value = product.id
                            showAllProducts.value = false
                        },
                        onBack = { showAllProducts.value = false }
                    )
                }
                showAddresses.value -> {
                    AddressScreen(
                        onBack = { showAddresses.value = false }
                    )
                }
                showBill.value != null -> {
                    val orderViewModel: com.company.krishivishal.ui.order.OrderViewModel = hiltViewModel()
                    val billTemplate by orderViewModel.billTemplate.collectAsState()
                    OrderBillScreen(
                        order = showBill.value!!,
                        onBack = { showBill.value = null },
                        template = billTemplate
                    )
                }
                showOrders.value -> {
                    OrderScreen(
                        onBack = { showOrders.value = false },
                        onTrackClick = { orderId -> 
                            showTracking.value = orderId 
                            showOrders.value = false
                        },
                        onViewBillClick = { order ->
                            showBill.value = order
                            showOrders.value = false
                        }
                    )
                }
                showTracking.value != null -> {
                    // Temporarily using a placeholder if RiderTrackingScreen has build errors
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.AutoMirrored.Filled.DirectionsBike, contentDescription = null, modifier = Modifier.size(64.dp), tint = PrimaryGreen)
                            Text("Tracking Order: ${showTracking.value}", fontWeight = FontWeight.Bold)
                            Button(onClick = { showTracking.value = null; showOrders.value = true }) {
                                Text("Back to Orders")
                            }
                        }
                    }
                }
                showSupport.value -> {
                    SupportScreen(
                        onBack = { showSupport.value = false }
                    )
                }
                showSettings.value -> {
                    SettingsScreen(
                        onBack = { showSettings.value = false }
                    )
                }
                showLogin.value -> {
                    LoginScreen(
                        onLoginSuccess = { showLogin.value = false },
                        onBack = { showLogin.value = false }
                    )
                }
                showCheckout.value != null -> {
                    CheckoutScreen(
                        source = showCheckout.value!!,
                        onBack = { showCheckout.value = null },
                        onOrderSuccess = {
                            showCheckout.value = null
                            selectedItem = 2 // Navigate to Orders
                        }
                    )
                }
                else -> {
                    when (selectedItem) {
                        0 -> {
                            when {
                                selectedProduct.value != null -> {
                                    ProductDetailScreen(
                                        productId = selectedProduct.value!!,
                                        onBack = { selectedProduct.value = null },
                                        onBuyNow = { showCheckout.value = CheckoutSource.BUY_NOW }
                                    )
                                }
                                selectedBrand.value != null -> {
                                    BrandProductScreen(
                                        brandName = selectedBrand.value!!,
                                        onBack = { selectedBrand.value = null },
                                        onProductClick = { product -> selectedProduct.value = product.id }
                                    )
                                }
                                else -> {
                                    HomeScreen(
                                        onBrandClick = { selectedBrand.value = it },
                                        onCategoryClick = { 
                                            selectedCategory.value = it
                                            selectedItem = 1 
                                        },
                                        onCropClick = { crop ->
                                            selectedCrop.value = crop
                                            selectedItem = 1
                                        },
                                        onProductClick = { product -> selectedProduct.value = product.id },
                                        onBuyNowClick = { product -> selectedProduct.value = product.id },
                                        onCartClick = { showCheckout.value = CheckoutSource.CART },
                                        onWishlistClick = { showWishlist.value = true },
                                        onViewAllCategories = { showAllCategories.value = true },
                                        onViewAllCrops = { selectedItem = 1 },
                                        onViewAllBrands = { showAllBrands.value = true },
                                        onViewAllProducts = { showAllProducts.value = true }
                                    )
                                }
                            }
                        }
                        1 -> {
                            // New Crop Screen
                            when {
                                selectedProduct.value != null -> {
                                    ProductDetailScreen(
                                        productId = selectedProduct.value!!,
                                        onBack = { selectedProduct.value = null },
                                        onBuyNow = { showCheckout.value = CheckoutSource.BUY_NOW }
                                    )
                                }
                                selectedCrop.value != null -> {
                                    CropProductScreen(
                                        cropId = selectedCrop.value!!.id,
                                        cropName = selectedCrop.value!!.name,
                                        onBack = { selectedCrop.value = null },
                                        onProductClick = { product: Product -> selectedProduct.value = product.id }
                                    )
                                }
                                else -> {
                                    CropScreen(
                                        onBack = { selectedItem = 0 },
                                        onCropClick = { crop ->
                                            selectedCrop.value = crop
                                        }
                                    )
                                }
                            }
                        }
                        2 -> {
                            OrderScreen(
                                onBack = { selectedItem = 0 },
                                onTrackClick = { orderId -> 
                                    showTracking.value = orderId
                                },
                                onViewBillClick = { order ->
                                    showBill.value = order
                                }
                            )
                        }
                        3 -> {
                            val profileViewModel: ProfileViewModel = hiltViewModel()
                            val isAdminResource by profileViewModel.isAdmin.collectAsState()
                            
                            ProfileScreen(
                                onEditProfileClick = { /* Navigate to edit */ },
                                onOrdersClick = { showOrders.value = true },
                                onAddressesClick = { showAddresses.value = true },
                                onWishlistClick = { showWishlist.value = true },
                                onLogoutClick = { selectedItem = 0 },
                                onLoginClick = { showLogin.value = true },
                                onSupportClick = { showSupport.value = true },
                                onSettingsClick = { showSettings.value = true },
                                onAdminClick = { showAdminPanel.value = true },
                                isAdmin = isAdminResource
                            )
                        }
                        else -> {
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                Text(text = "${BottomNavItem.fromIndex(selectedItem).title} Screen")
                            }
                        }
                    }
                }
            }
        }
    }
}
