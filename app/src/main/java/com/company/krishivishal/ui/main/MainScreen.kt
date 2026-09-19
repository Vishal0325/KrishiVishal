package com.company.krishivishal.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Spa
import androidx.compose.material.icons.filled.Build
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.core.model.Category
import com.company.krishivishal.core.model.Crop
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.ui.cart.CartScreen
import com.company.krishivishal.ui.profile.ProfileScreen
import com.company.krishivishal.ui.profile.EditProfileScreen
import com.company.krishivishal.ui.profile.FarmProfileScreen
import com.company.krishivishal.ui.wishlist.WishlistScreen
import com.company.krishivishal.ui.address.AddressScreen
import com.company.krishivishal.ui.order.OrderScreen
import com.company.krishivishal.ui.order.OrderBillScreen
import com.company.krishivishal.ui.checkout.CheckoutScreen
import com.company.krishivishal.ui.checkout.CheckoutSource
import com.company.krishivishal.ui.support.SupportScreen
import com.company.krishivishal.ui.tracking.RiderTrackingScreen
import com.company.krishivishal.ui.feature.auth.LoginScreen
import com.company.krishivishal.ui.category.CategoryScreen
import com.company.krishivishal.ui.crop.CropScreen
import com.company.krishivishal.ui.product.BrandScreen
import com.company.krishivishal.ui.product.AllProductsScreen
import com.company.krishivishal.ui.home.HomeScreen
import com.company.krishivishal.ui.product.*
import com.company.krishivishal.ui.search.GlobalSearchScreen
import com.company.krishivishal.ui.settings.SettingsScreen
import com.company.krishivishal.ui.common.components.KrishiBottomBar
import com.company.krishivishal.ui.navigation.BottomNavItem
import com.company.krishivishal.ui.profile.ProfileViewModel
import com.company.krishivishal.ui.support.SupportViewModel
import com.company.krishivishal.ui.wallet.WalletScreen
import com.company.krishivishal.ui.wallet.WalletViewModel
import com.company.krishivishal.ui.wallet.WalletUiEvent
import com.company.krishivishal.ui.checkout.startRazorpay
import com.company.krishivishal.payment.PaymentHandler
import com.company.krishivishal.utils.SupportUtils
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.ui.components.EmptyState
import com.company.krishivishal.ui.components.ErrorState
import com.company.krishivishal.ui.components.LoginRequiredDialog
import androidx.compose.ui.platform.LocalContext
import com.company.krishivishal.R

import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.company.krishivishal.ui.navigation.Screen
import com.company.krishivishal.ui.main.MainViewModel
import com.company.krishivishal.core.model.AppConfig
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun MaintenanceScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        androidx.compose.foundation.layout.Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(
                Icons.Default.Build,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = PrimaryGreen
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                "System Maintenance",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Hum app ko behtar bana rahe hain. Kripya thodi der baad prayas karein.",
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(24.dp))
            CircularProgressIndicator(color = PrimaryGreen)
        }
    }
}

@Composable
fun MainScreen(
    initialProductId: String? = null,
    viewModel: MainViewModel = hiltViewModel(),
    supportViewModel: SupportViewModel = hiltViewModel()
) {
    val bottomBarState by viewModel.bottomBarState.collectAsState()
    val supportConfigRes by supportViewModel.config.collectAsState()
    val appConfig = (supportConfigRes as? Resource.Success<AppConfig>)?.data

    if (appConfig?.maintenanceMode == true) {
        MaintenanceScreen()
        return
    }

    val context = LocalContext.current
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    // Auth Check: Watch for changes in Firebase Auth State
    var currentUser by remember { mutableStateOf(com.google.firebase.auth.FirebaseAuth.getInstance().currentUser) }
    
    // Listen for Auth changes in real-time
    DisposableEffect(Unit) {
        val auth = com.google.firebase.auth.FirebaseAuth.getInstance()
        val listener = com.google.firebase.auth.FirebaseAuth.AuthStateListener { 
            currentUser = it.currentUser
        }
        auth.addAuthStateListener(listener)
        onDispose {
            auth.removeAuthStateListener(listener)
        }
    }
    
    val initialAuthUser = remember { com.google.firebase.auth.FirebaseAuth.getInstance().currentUser }
    val initialRoute = remember {
        if (initialAuthUser != null && !initialAuthUser.isAnonymous) Screen.Home.route else Screen.Login.route
    }

    val profileViewModel: ProfileViewModel = hiltViewModel()
    val isAdmin by profileViewModel.isAdmin.collectAsState()

    LaunchedEffect(currentUser, currentRoute, isAdmin) {
        if (currentRoute == null) return@LaunchedEffect

        // 1. Auth Guard
        if ((currentUser == null || currentUser?.isAnonymous == true) && currentRoute != Screen.Login.route) {
            if (currentUser?.isAnonymous == true) {
                com.google.firebase.auth.FirebaseAuth.getInstance().signOut()
            }
            navController.navigate(Screen.Login.route) {
                popUpTo(0) { inclusive = true }
            }
        } else if (currentUser != null && currentUser?.isAnonymous == false && currentRoute == Screen.Login.route) {
            navController.navigate(Screen.Home.route) {
                popUpTo(Screen.Login.route) { inclusive = true }
            }
        }

        // 2. Admin Guard
        val isAdminRoute = currentRoute.startsWith("admin")
        if (isAdminRoute && !isAdmin) {
            navController.navigate(Screen.Home.route) {
                popUpTo(Screen.Home.route) { inclusive = true }
            }
        }
    }

    // Synchronize bottom bar selection with navigation state
    val selectedIndex = remember(currentRoute) {
        when (currentRoute) {
            Screen.Home.route -> 0
            Screen.Crops.route -> 1
            Screen.Services.route -> 2
            Screen.Orders.route -> 3
            Screen.Profile.route -> 4
            else -> -1 // For sub-screens, don't highlight any bottom tab or keep previous
        }
    }

    var consumedDeepLink by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(initialProductId) {
        if (initialProductId != null && initialProductId != consumedDeepLink) {
            navController.navigate(Screen.ProductDetail.createRoute(initialProductId))
            consumedDeepLink = initialProductId
        }
    }
    
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            val showBottomNav = currentRoute in listOf(
                Screen.Home.route,
                Screen.Crops.route,
                Screen.Services.route,
                Screen.Orders.route,
                Screen.Profile.route
            )
            
            if (showBottomNav) {
                KrishiBottomBar(
                    selectedIndex = if (selectedIndex != -1) selectedIndex else bottomBarState.selectedItem.index,
                    onItemSelected = { index ->
                        val route = when(index) {
                            0 -> Screen.Home.route
                            1 -> Screen.Crops.route
                            2 -> Screen.Services.route
                            3 -> Screen.Orders.route
                            4 -> Screen.Profile.route
                            else -> Screen.Home.route
                        }
                        navController.navigate(route) {
                            popUpTo(Screen.Home.route) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                        viewModel.onItemSelected(index)
                    },
                    badges = bottomBarState.badges
                )
            }
        },
        floatingActionButton = {
            val showFAB = currentRoute in listOf(
                Screen.Home.route,
                Screen.Crops.route,
                Screen.Services.route,
                Screen.Orders.route,
                Screen.Profile.route
            )

            if (showFAB) {
                val whatsappMsg = stringResource(id = R.string.whatsapp_msg)
                FloatingActionButton(
                    onClick = {
                        val config = (supportConfigRes as? Resource.Success<AppConfig>)?.data
                        if (config != null && config.whatsappNumber.isNotEmpty()) {
                            SupportUtils.openWhatsApp(context, config.whatsappNumber, whatsappMsg)
                        } else {
                            android.widget.Toast.makeText(context, "WhatsApp support not available", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    },
                    containerColor = Color(0xFF25D366),
                    contentColor = Color.White,
                    shape = CircleShape
                ) {
                    Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = "Expert Help")
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = initialRoute,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Screen.Home.route) {
                HomeScreen(
                    onBrandClick = { name -> navController.navigate(Screen.BrandDetail.createRoute(name)) },
                    onCategoryClick = { category -> navController.navigate(Screen.SubCategoryDetail.createRoute(category.id)) },
                    onCropClick = { crop -> navController.navigate(Screen.CropDetail.createRoute(crop.id, crop.name)) },
                    onProductClick = { product -> navController.navigate(Screen.ProductDetail.createRoute(product.id)) },
                    onBuyNowClick = { product -> navController.navigate(Screen.ProductDetail.createRoute(product.id)) },
                    onCartClick = { navController.navigate(Screen.Cart.route) },
                    onWishlistClick = { navController.navigate(Screen.Wishlist.route) },
                    onNotificationClick = { navController.navigate(Screen.Notifications.route) },
                    onViewAllCategories = { navController.navigate(Screen.CategoryList.route) },
                    onViewAllCrops = { navController.navigate(Screen.Crops.route) },
                    onViewAllBrands = { navController.navigate(Screen.BrandList.route) },
                    onViewAllProducts = { navController.navigate(Screen.AllProducts.route) },
                    onSearchClick = { navController.navigate(Screen.GlobalSearch.route) },
                    onFarmProfileClick = { navController.navigate(Screen.FarmProfile.route) },
                    onServiceClick = { serviceId -> navController.navigate(Screen.ServiceBooking.createRoute(serviceId)) },
                    onViewAllServices = { navController.navigate(Screen.Services.route) }
                )
            }

            composable(Screen.Crops.route) {
                CropScreen(
                    onBack = { navController.popBackStack() },
                    onCropClick = { crop -> navController.navigate(Screen.CropDetail.createRoute(crop.id, crop.name)) }
                )
            }

            composable(Screen.Services.route) {
                com.company.krishivishal.ui.services.ServiceListScreen(
                    onServiceClick = { serviceId ->
                        navController.navigate(Screen.ServiceBooking.createRoute(serviceId))
                    }
                )
            }

            composable(
                route = Screen.ServiceBooking.route,
                arguments = listOf(navArgument("serviceId") { type = NavType.StringType })
            ) { backStackEntry ->
                val serviceId = backStackEntry.arguments?.getString("serviceId") ?: ""
                com.company.krishivishal.ui.services.ServiceBookingScreen(
                    serviceId = serviceId,
                    onBack = { navController.popBackStack() },
                    onBookingSuccess = { bookingId ->
                        navController.navigate(Screen.BookingTracking.createRoute(bookingId)) {
                            popUpTo(Screen.Services.route)
                        }
                    }
                )
            }

            composable(
                route = Screen.BookingTracking.route,
                arguments = listOf(navArgument("bookingId") { type = NavType.StringType })
            ) { backStackEntry ->
                val bookingId = backStackEntry.arguments?.getString("bookingId") ?: ""
                com.company.krishivishal.ui.services.BookingTrackingScreen(
                    bookingId = bookingId,
                    onBack = { navController.navigate(Screen.Home.route) { popUpTo(0) } }
                )
            }

            composable(
                route = Screen.CropDetail.route,
                arguments = listOf(
                    navArgument("cropId") { type = NavType.StringType },
                    navArgument("cropName") { type = NavType.StringType }
                )
            ) { backStackEntry ->
                val cropId = backStackEntry.arguments?.getString("cropId") ?: ""
                val cropName = backStackEntry.arguments?.getString("cropName") ?: ""
                CropProductScreen(
                    cropId = cropId,
                    cropName = cropName,
                    onBack = { navController.popBackStack() },
                    onProductClick = { product -> navController.navigate(Screen.ProductDetail.createRoute(product.id)) }
                )
            }

            composable(Screen.Orders.route) {
                OrderScreen(
                    onBack = { navController.popBackStack() },
                    onTrackClick = { orderId -> navController.navigate(Screen.Tracking.createRoute(orderId)) },
                    onViewBillClick = { order -> navController.navigate(Screen.OrderBill.createRoute(order.id)) }
                )
            }

            composable(Screen.Profile.route) {
                ProfileScreen(
                    navController = navController
                )
            }

            composable(Screen.Referral.route) {
                com.company.krishivishal.ui.referral.ReferralScreen(
                    onBack = { navController.popBackStack() }
                )
            }

            composable("editProfile") {
                EditProfileScreen(
                    onBack = { navController.popBackStack() }
                )
            }

            composable(Screen.FarmProfile.route) {
                FarmProfileScreen(
                    onBack = { navController.popBackStack() }
                )
            }

            composable(
                route = Screen.ProductDetail.route,
                arguments = listOf(navArgument("productId") { type = NavType.StringType })
            ) { backStackEntry ->
                val productId = backStackEntry.arguments?.getString("productId") ?: ""
                ProductDetailScreen(
                    productId = productId,
                    onBack = { navController.popBackStack() },
                    onBuyNow = { navController.navigate(Screen.Checkout.createRoute(CheckoutSource.BUY_NOW.name)) },
                    onCartClick = { navController.navigate(Screen.Cart.route) }
                )
            }

            composable(Screen.Wishlist.route) {
                WishlistScreen(
                    onBack = { navController.popBackStack() },
                    onProductClick = { product -> navController.navigate(Screen.ProductDetail.createRoute(product.id)) },
                    onAddToCart = { _ -> /* Add to cart */ },
                    onBuyNow = { product -> navController.navigate(Screen.ProductDetail.createRoute(product.id)) }
                )
            }

            composable(Screen.Cart.route) {
                CartScreen(
                    onBack = { navController.popBackStack() },
                    onCheckout = { navController.navigate(Screen.Checkout.createRoute(CheckoutSource.CART.name)) },
                    onNavigateToProduct = { productId -> navController.navigate(Screen.ProductDetail.createRoute(productId)) }
                )
            }

            composable(
                route = Screen.Checkout.route,
                arguments = listOf(navArgument("source") { type = NavType.StringType })
            ) { backStackEntry ->
                val sourceStr = backStackEntry.arguments?.getString("source") ?: CheckoutSource.CART.name
                val source = CheckoutSource.valueOf(sourceStr)
                CheckoutScreen(
                    source = source,
                    onBack = { navController.popBackStack() },
                    onOrderSuccess = { orderId, otp ->
                        navController.navigate(Screen.OrderSuccess.createRoute(otp, orderId)) {
                            popUpTo(Screen.Home.route)
                        }
                    },
                    onLoginRequired = {
                        com.google.firebase.auth.FirebaseAuth.getInstance().signOut()
                        navController.navigate(Screen.Login.route) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                )
            }

            composable(
                route = Screen.OrderSuccess.route,
                arguments = listOf(
                    navArgument("otp") { type = NavType.StringType; defaultValue = "" },
                    navArgument("orderId") { type = NavType.StringType; defaultValue = "" }
                )
            ) { backStackEntry ->
                val otp = backStackEntry.arguments?.getString("otp") ?: ""
                val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
                com.company.krishivishal.ui.checkout.OrderSuccessScreen(
                    otp = otp,
                    orderId = orderId,
                    onContinueShopping = { navController.navigate(Screen.Home.route) },
                    onTrackOrder = { navController.navigate(Screen.Orders.route) }
                )
            }

            composable(Screen.CategoryList.route) {
                CategoryScreen(
                    onCategoryClick = { category -> 
                        navController.navigate(Screen.SubCategoryDetail.createRoute(category.id))
                    },
                    onBack = { navController.popBackStack() }
                )
            }

            composable(
                route = Screen.SubCategoryDetail.route,
                arguments = listOf(navArgument("categoryId") { type = NavType.StringType })
            ) { backStackEntry ->
                val categoryId = backStackEntry.arguments?.getString("categoryId") ?: ""
                val subViewModel: com.company.krishivishal.ui.category.SubCategoryViewModel = hiltViewModel()
                
                LaunchedEffect(categoryId) {
                    subViewModel.loadCategory(categoryId)
                }
                
                val subState by subViewModel.uiState.collectAsState()
                
                when (val res = subState) {
                    is Resource.Loading -> {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = PrimaryGreen)
                        }
                    }
                    is Resource.Success -> {
                        res.data?.let { category ->
                            com.company.krishivishal.ui.category.SubCategoryScreen(
                                category = category,
                                onSubCategoryClick = { sub ->
                                    navController.navigate(Screen.CategoryProductDetail.createRoute(category.name, sub.name))
                                },
                                onBack = { navController.popBackStack() }
                            )
                        }
                    }
                    is Resource.Error -> {
                        ErrorState(message = res.message ?: "Error", onRetry = { subViewModel.loadCategory(categoryId) })
                    }
                    else -> {}
                }
            }

            composable(
                route = Screen.CategoryProductDetail.route,
                arguments = listOf(
                    navArgument("categoryName") { type = NavType.StringType },
                    navArgument("subCategoryName") { type = NavType.StringType }
                )
            ) { backStackEntry ->
                val categoryName = backStackEntry.arguments?.getString("categoryName") ?: ""
                val subCategoryName = backStackEntry.arguments?.getString("subCategoryName").let { 
                    if (it == "null") null else it 
                }
                CategoryProductScreen(
                    categoryName = categoryName,
                    subCategoryName = subCategoryName,
                    onBack = { navController.popBackStack() },
                    onProductClick = { product -> navController.navigate(Screen.ProductDetail.createRoute(product.id)) }
                )
            }

            composable(Screen.BrandList.route) {
                BrandScreen(
                    onBrandClick = { name -> navController.navigate(Screen.BrandDetail.createRoute(name)) },
                    onBack = { navController.popBackStack() }
                )
            }

            composable(
                route = Screen.BrandDetail.route,
                arguments = listOf(navArgument("brandName") { type = NavType.StringType })
            ) { backStackEntry ->
                val brandName = backStackEntry.arguments?.getString("brandName") ?: ""
                BrandProductScreen(
                    brandName = brandName,
                    onBack = { navController.popBackStack() },
                    onProductClick = { product -> navController.navigate(Screen.ProductDetail.createRoute(product.id)) }
                )
            }

            composable(Screen.AllProducts.route) {
                AllProductsScreen(
                    onProductClick = { product -> navController.navigate(Screen.ProductDetail.createRoute(product.id)) },
                    onBuyNowClick = { product -> navController.navigate(Screen.ProductDetail.createRoute(product.id)) },
                    onBack = { navController.popBackStack() }
                )
            }

            composable(Screen.Address.route) {
                AddressScreen(onBack = { navController.popBackStack() })
            }

            composable(Screen.Support.route) {
                SupportScreen(onBack = { navController.popBackStack() })
            }

            composable(Screen.Settings.route) {
                SettingsScreen(
                    onBack = { navController.popBackStack() },
                    onNavigateToInfo = { type -> navController.navigate(Screen.Info.createRoute(type)) }
                )
            }

            composable(Screen.GlobalSearch.route) {
                GlobalSearchScreen(
                    onBack = { navController.popBackStack() },
                    onProductClick = { productId -> navController.navigate(Screen.ProductDetail.createRoute(productId)) }
                )
            }

            composable(Screen.Notifications.route) {
                com.company.krishivishal.ui.notification.NotificationScreen(
                    onBack = { navController.popBackStack() },
                    onNotificationClick = { /* Handle deep link */ }
                )
            }

            composable(Screen.Login.route) {
                LoginScreen(
                    onLoginSuccess = {
                        navController.navigate(Screen.Home.route) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    },
                    onBack = { navController.popBackStack() }
                )
            }

            composable(
                route = Screen.Tracking.route,
                arguments = listOf(navArgument("orderId") { type = NavType.StringType })
            ) { backStackEntry ->
                val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
                RiderTrackingScreen(
                    orderId = orderId,
                    riderId = "RIDER_001",
                    onBack = { navController.popBackStack() }
                )
            }

            composable(
                route = Screen.OrderBill.route,
                arguments = listOf(navArgument("orderId") { type = NavType.StringType })
            ) { backStackEntry ->
                val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
                val orderViewModel: com.company.krishivishal.ui.order.OrderViewModel = hiltViewModel()
                val orderHistoryState by orderViewModel.uiState.collectAsStateWithLifecycle()
                val order = orderHistoryState.orders.find { it.id == orderId }
                
                if (order != null) {
                    val billTemplate by orderViewModel.billTemplate.collectAsStateWithLifecycle()
                    val appConfig by orderViewModel.appConfig.collectAsStateWithLifecycle()
                    OrderBillScreen(
                        order = order,
                        onBack = { navController.popBackStack() },
                        template = billTemplate,
                        appConfig = appConfig
                    )
                } else if (orderHistoryState.isLoading) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = com.company.krishivishal.ui.theme.PrimaryGreen)
                    }
                } else {
                    Box(modifier = Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Invoice not found or still loading", fontWeight = FontWeight.Bold)
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = { navController.popBackStack() },
                                colors = ButtonDefaults.buttonColors(containerColor = com.company.krishivishal.ui.theme.PrimaryGreen)
                            ) {
                                Text("Go Back")
                            }
                        }
                    }
                }
            }
            composable(Screen.MyReturns.route) {
                com.company.krishivishal.ui.returns.MyReturnsScreen(
                    onBack = { navController.popBackStack() }
                )
            }

            composable(Screen.Wallet.route) {
                val walletViewModel: WalletViewModel = hiltViewModel()
                val context = LocalContext.current

                WalletScreen(
                    onBack = { navController.popBackStack() },
                    onInitiateTopUpPayment = { razorpayOrderId, topUpId, amount, keyId ->
                        // Signal PaymentHandler to route the result to walletTopUpResult stream
                        walletViewModel.setWalletPaymentContext()
                        startRazorpay(
                            activity = context as android.app.Activity,
                            amount = amount,
                            orderId = topUpId,
                            razorpayOrderId = razorpayOrderId,
                            userEmail = null,
                            userPhone = null
                        )
                    },
                    viewModel = walletViewModel
                )
            }

            composable(
                route = Screen.Info.route,
                arguments = listOf(navArgument("type") { type = NavType.StringType })
            ) { backStackEntry ->
                val type = backStackEntry.arguments?.getString("type") ?: ""
                val title = when (type) {
                    "about" -> "About Us"
                    "contact" -> "Contact Us"
                    "terms" -> "Terms & Conditions"
                    "privacy" -> "Privacy Policy"
                    "refund" -> "Refund & Return Policy"
                    "shipping" -> "Shipping Policy"
                    else -> "Information"
                }
                
                val content = when (type) {
                    "about" -> "Sawan Krishi Kendara is your trusted partner for all agricultural needs. We provide high-quality seeds, fertilizers, pesticides, farm machinery, and expert agricultural services directly to farmers to help you achieve the best harvest."
                    "contact" -> "Company: Sawan Krishi Kendara\nEmail: vishalestore03@gmail.com\nPhone: +917763044160\n\nAddress:\nPIN Code: 848117\nVillage: Rahthuli\nPost: Shripur Gahar\nShivaji Nagar, Samastipur (Bihar)"
                    "terms" -> "Welcome to Sawan Krishi Kendara.\n\n1. Acceptance of Terms: By accessing and using our application, you accept and agree to be bound by the terms and provision of this agreement.\n2. Products and Services: All products and services are subject to availability. We reserve the right to modify or discontinue any product or service without notice.\n3. User Account: You are responsible for maintaining the confidentiality of your account and password."
                    "privacy" -> "Privacy Policy\n\nYour privacy is important to us. Sawan Krishi Kendara respects your privacy regarding any information we may collect from you across our application.\n\nWe only ask for personal information when we truly need it to provide a service to you. We collect it by fair and lawful means, with your knowledge and consent.\n\nWe don't share any personally identifying information publicly or with third-parties, except when required to by law."
                    "refund" -> "Refund, Return & Cancellation Policy\n\n- Returns: You can initiate a return within 7 days of delivery if the product is defective or not as described.\n- Cancellation: Orders can be cancelled before they are shipped.\n- Refunds: Once your return is received and inspected, or cancellation is approved, your refund will be processed.\n- Processing Time: Refunds will be credited back to your original payment method or wallet within 1 to 3 working days."
                    "shipping" -> "Shipping & Delivery Policy\n\n- Processing: Orders are typically processed within 24 hours.\n- Delivery Time: Our standard delivery time is 1 to 2 working days depending on your location in Samastipur and surrounding areas.\n- Service Activation: For booked services (like equipment repair), our servicemen will typically reach your location within the scheduled time slot."
                    else -> ""
                }

                com.company.krishivishal.ui.info.InfoScreen(
                    title = title,
                    content = content,
                    onBack = { navController.popBackStack() }
                )
            }

        }
    }
}
