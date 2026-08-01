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
import com.company.krishivishaldelivery.service.LocationUpdateService
import com.company.krishivishaldelivery.ui.auth.LoginScreen
import com.company.krishivishaldelivery.ui.dashboard.DashboardScreen
import com.company.krishivishaldelivery.ui.dashboard.DeliveryViewModel
import com.company.krishivishaldelivery.ui.dashboard.LocationAction
import com.company.krishivishaldelivery.ui.earnings.EarningsScreen
import com.company.krishivishaldelivery.ui.order_detail.OrderDetailScreen
import com.company.krishivishaldelivery.ui.pod.ProofOfDeliveryScreen
import com.company.krishivishaldelivery.ui.profile.ProfileScreen
import com.company.krishivishaldelivery.ui.scanner.QRScannerScreen
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

                LaunchedEffect(Unit) {
                    deliveryViewModel.locationAction.collect { action ->
                        when(action) {
                            is LocationAction.Start -> {
                                val intent = Intent(context, LocationUpdateService::class.java).apply {
                                    putExtra("ORDER_ID", action.orderId)
                                }
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                    startForegroundService(intent)
                                } else {
                                    startService(intent)
                                }
                            }
                            is LocationAction.Stop -> {
                                stopService(Intent(context, LocationUpdateService::class.java))
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
                                    onScanClick = {
                                        navController.navigate("scanner")
                                    }
                                )
                            }
                            composable("scanner") {
                                val viewModel: DeliveryViewModel = hiltViewModel()
                                var isProcessing by remember { mutableStateOf(false) }
                                
                                QRScannerScreen(
                                    onScanSuccess = { orderId ->
                                        if (!isProcessing) {
                                            isProcessing = true
                                            viewModel.pickupScannedOrder(
                                                orderId = orderId,
                                                onSuccess = {
                                                    Toast.makeText(context, "Order #${it.id.takeLast(6)} picked up!", Toast.LENGTH_SHORT).show()
                                                    navController.navigate("order_detail/${it.id}") {
                                                        popUpTo("scanner") { inclusive = true }
                                                    }
                                                },
                                                onError = { error ->
                                                    Toast.makeText(context, error, Toast.LENGTH_LONG).show()
                                                    isProcessing = false
                                                }
                                            )
                                        }
                                    },
                                    onBack = { navController.popBackStack() }
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
                                SettingsScreen(onBack = { navController.popBackStack() })
                            }
                            composable(
                                route = "order_detail/{orderId}",
                                arguments = listOf(navArgument("orderId") { type = NavType.StringType })
                            ) { backStackEntry ->
                                val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
                                OrderDetailScreen(
                                    orderId = orderId,
                                    onBack = { navController.popBackStack() },
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
                                    onBack = { navController.popBackStack() },
                                    onSuccess = {
                                        navController.navigate("dashboard") {
                                            popUpTo("dashboard") { inclusive = true }
                                        }
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
