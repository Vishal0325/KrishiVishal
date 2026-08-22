package com.company.krishivishaldelivery

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.*
import androidx.navigation.compose.*
import com.company.krishivishaldelivery.service.RiderLocationService
import com.company.krishivishaldelivery.ui.auth.LoginScreen
import com.company.krishivishaldelivery.ui.dashboard.DashboardScreen
import com.company.krishivishaldelivery.ui.dashboard.DeliveryViewModel
import com.company.krishivishaldelivery.ui.dashboard.LocationAction
import com.company.krishivishaldelivery.ui.earnings.EarningsScreen
import com.company.krishivishaldelivery.ui.order_detail.OrderDetailScreen
import com.company.krishivishaldelivery.ui.pod.ProofOfDeliveryScreen
import com.company.krishivishaldelivery.ui.profile.ProfileScreen
import com.company.krishivishaldelivery.ui.scanner.QRScannerScreen
import com.company.krishivishaldelivery.ui.returns.ReturnDetailScreen
import com.company.krishivishaldelivery.ui.settings.SettingsScreen
import com.company.krishivishaldelivery.ui.theme.KrishiVishalTheme
import com.company.krishivishal.core.util.Resource
import com.google.firebase.auth.FirebaseAuth
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            KrishiVishalTheme {
                val navController = rememberNavController()
                val deliveryViewModel: DeliveryViewModel = hiltViewModel()
                val context = LocalContext.current
                
                val appConfigResource by deliveryViewModel.appConfig.collectAsState()
                var showUpdateDialog by remember { mutableStateOf(false) }

                LaunchedEffect(appConfigResource) {
                    if (appConfigResource is Resource.Success) {
                        val config = (appConfigResource as Resource.Success).data
                        if (config != null && BuildConfig.VERSION_CODE < config.minAppVersion) {
                            showUpdateDialog = true
                        }
                    }
                }

                if (showUpdateDialog) {
                    UpdateRequiredDialog()
                }

                if (appConfigResource is Resource.Success) {
                    val config = (appConfigResource as Resource.Success).data
                    if (config?.maintenanceMode == true) {
                        MaintenanceScreen()
                        return@KrishiVishalTheme
                    }
                }

                LaunchedEffect(Unit) {
                    deliveryViewModel.locationAction.collect { event ->
                        when(event) {
                            is LocationAction.Start, is LocationAction.InTransit, is LocationAction.AtDelivery -> {
                                val actionName = when(event) {
                                    is LocationAction.Start -> RiderLocationService.ACTION_START
                                    is LocationAction.InTransit -> RiderLocationService.ACTION_IN_TRANSIT
                                    is LocationAction.AtDelivery -> RiderLocationService.ACTION_AT_DELIVERY
                                    else -> RiderLocationService.ACTION_START
                                }
                                val status = when(event) {
                                    is LocationAction.Start -> "PICKING_UP"
                                    is LocationAction.InTransit -> "IN_TRANSIT"
                                    is LocationAction.AtDelivery -> "AT_DELIVERY"
                                    else -> "IDLE"
                                }
                                val intent = Intent(context, RiderLocationService::class.java).apply {
                                    action = actionName
                                    putExtra("ORDER_STATUS", status)
                                }
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                    startForegroundService(intent)
                                } else {
                                    startService(intent)
                                }
                            }
                            is LocationAction.Stop -> {
                                val intent = Intent(context, RiderLocationService::class.java).apply {
                                    action = RiderLocationService.ACTION_STOP
                                }
                                startService(intent)
                            }
                        }
                    }
                }

                val startDestination = if (FirebaseAuth.getInstance().currentUser != null) "dashboard" else "login"

                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentDestination = navBackStackEntry?.destination

                val showBottomBar = currentDestination?.route in listOf("dashboard", "earnings", "profile")

                Scaffold(
                    modifier = Modifier.fillMaxSize(),
                    bottomBar = {
                        if (showBottomBar) {
                            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                                val items = listOf(
                                    BottomNavItem("dashboard", "Home", Icons.Default.Home),
                                    BottomNavItem("earnings", "Earnings", Icons.Default.Payments),
                                    BottomNavItem("profile", "Profile", Icons.Default.Person)
                                )
                                items.forEach { item ->
                                    NavigationBarItem(
                                        icon = { Icon(item.icon, contentDescription = item.label) },
                                        label = { Text(item.label) },
                                        selected = currentDestination?.hierarchy?.any { it.route == item.route } == true,
                                        onClick = {
                                            navController.navigate(item.route) {
                                                popUpTo(navController.graph.findStartDestination().id) {
                                                    saveState = true
                                                }
                                                launchSingleTop = true
                                                restoreState = true
                                            }
                                        },
                                        colors = NavigationBarItemDefaults.colors(
                                            selectedIconColor = MaterialTheme.colorScheme.primary,
                                            unselectedIconColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                                            selectedTextColor = MaterialTheme.colorScheme.primary,
                                            unselectedTextColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                                            indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)
                                        )
                                    )
                                }
                            }
                        }
                    }
                ) { innerPadding ->
                    Surface(
                        modifier = Modifier.fillMaxSize().padding(innerPadding),
                        color = MaterialTheme.colorScheme.background
                    ) {
                        NavHost(navController = navController, startDestination = startDestination) {
                            composable("login") {
                                LoginScreen(onLoginSuccess = {
                                    navController.navigate("dashboard") {
                                        popUpTo("login") { inclusive = true }
                                    }
                                })
                            }
                            composable("dashboard") {
                                DashboardScreen(
                                    onOrderClick = { orderId ->
                                        navController.navigate("order_detail/$orderId")
                                    },
                                    onReturnClick = { returnId ->
                                        navController.navigate("return_detail/$returnId")
                                    },
                                    onScanClick = {
                                        navController.navigate("scanner")
                                    }
                                )
                            }
                            composable("scanner") {
                                val viewModel: DeliveryViewModel = hiltViewModel()
                                QRScannerScreen(
                                    viewModel = viewModel,
                                    onOrderAccepted = { orderId ->
                                        Toast.makeText(context, "Order assigned successfully!", Toast.LENGTH_SHORT).show()
                                        navController.navigate("order_detail/$orderId") {
                                            popUpTo("dashboard")
                                        }
                                    },
                                    onNavigateBack = { navController.popBackStack() }
                                )
                            }
                            composable("earnings") { EarningsScreen() }
                            composable("profile") {
                                ProfileScreen(
                                    onLogout = {
                                        navController.navigate("login") {
                                            popUpTo(0)
                                        }
                                    },
                                    onSettingsClick = {
                                        navController.navigate("settings")
                                    }
                                )
                            }
                            composable("settings") {
                                SettingsScreen(onNavigateBack = { navController.popBackStack() })
                            }
                            composable(
                                route = "order_detail/{orderId}",
                                arguments = listOf(navArgument("orderId") { type = NavType.StringType })
                            ) { backStackEntry ->
                                val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
                                OrderDetailScreen(
                                    orderId = orderId,
                                    onNavigateBack = { navController.popBackStack() },
                                    onDeliverClick = { navController.navigate("pod/$orderId") }
                                )
                            }
                            composable(
                                route = "pod/{orderId}",
                                arguments = listOf(navArgument("orderId") { type = NavType.StringType })
                            ) { backStackEntry ->
                                val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
                                ProofOfDeliveryScreen(
                                    orderId = orderId,
                                    onNavigateBack = { navController.popBackStack() },
                                    onSuccess = {
                                        navController.navigate("dashboard") {
                                            popUpTo("dashboard") { inclusive = true }
                                        }
                                    }
                                )
                            }
                            composable(
                                route = "return_detail/{returnId}",
                                arguments = listOf(navArgument("returnId") { type = NavType.StringType })
                            ) { backStackEntry ->
                                val returnId = backStackEntry.arguments?.getString("returnId") ?: ""
                                ReturnDetailScreen(
                                    returnId = returnId,
                                    onNavigateBack = { navController.popBackStack() },
                                    onConfirmPickup = {
                                        // For now, simpler confirmation. In Module 4 we'll add photo.
                                        deliveryViewModel.updateReturnStatus(returnId, "PICKED_UP")
                                        navController.popBackStack()
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    @Composable
    fun MaintenanceScreen() {
        Box(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Default.Build, contentDescription = null, modifier = Modifier.size(64.dp), tint = Color(0xFF2E7D32))
                Spacer(modifier = Modifier.height(16.dp))
                Text("Maintenance Mode", fontWeight = FontWeight.Black, fontSize = 20.sp)
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "Delivery system is undergoing essential maintenance. Please contact support for urgent updates.",
                    textAlign = TextAlign.Center,
                    fontSize = 14.sp,
                    color = Color.Gray
                )
            }
        }
    }

    @Composable
    fun UpdateRequiredDialog() {
        Dialog(onDismissRequest = {}) {
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = Color.White,
                modifier = Modifier.fillMaxWidth().padding(16.dp)
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(Icons.Default.Update, contentDescription = null, tint = Color(0xFF2E7D32), modifier = Modifier.size(48.dp))
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Update Required", fontWeight = FontWeight.Black, fontSize = 20.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "A new version of KV Delivery is available. Please update to continue delivering.",
                        textAlign = TextAlign.Center,
                        fontSize = 14.sp,
                        color = Color.Gray
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(
                        onClick = { 
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${packageName}"))
                            startActivity(intent)
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                    ) {
                        Text("Update Now", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

data class BottomNavItem(val route: String, val label: String, val icon: ImageVector)
