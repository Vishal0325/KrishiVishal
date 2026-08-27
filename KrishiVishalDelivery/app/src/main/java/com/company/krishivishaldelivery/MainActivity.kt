package com.company.krishivishaldelivery

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*
import com.company.krishivishaldelivery.service.RiderLocationService
import com.company.krishivishaldelivery.ui.dashboard.DashboardViewModel
import com.company.krishivishaldelivery.ui.dashboard.LocationAction
import com.company.krishivishaldelivery.ui.theme.KrishiVishalTheme
import com.company.krishivishal.core.model.AppConfig
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.ui.MaintenanceScreen
import com.company.krishivishaldelivery.ui.UpdateRequiredDialog
import com.company.krishivishaldelivery.ui.navigation.AppNavGraph
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
                val dashboardViewModel: DashboardViewModel = hiltViewModel()
                val context = LocalContext.current
                
                val appConfigResource by dashboardViewModel.appConfig.collectAsState()
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
                    dashboardViewModel.locationAction.collect { event ->
                        val intentAction = when(event) {
                            is LocationAction.Start -> RiderLocationService.ACTION_START
                            is LocationAction.InTransit -> RiderLocationService.ACTION_IN_TRANSIT
                            is LocationAction.AtDelivery -> RiderLocationService.ACTION_AT_DELIVERY
                            is LocationAction.Stop -> RiderLocationService.ACTION_STOP
                        }

                        val status = when(event) {
                            is LocationAction.Start -> "PICKING_UP"
                            is LocationAction.InTransit -> "IN_TRANSIT"
                            is LocationAction.AtDelivery -> "AT_DELIVERY"
                            is LocationAction.Stop -> "IDLE"
                        }

                        val intent = Intent(context, RiderLocationService::class.java).apply {
                            action = intentAction
                            putExtra("ORDER_STATUS", status)
                        }

                        if (event is LocationAction.Stop) {
                            startService(intent)
                        } else {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                startForegroundService(intent)
                            } else {
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
                            BottomNavigationBar(navController, currentDestination)
                        }
                    }
                ) { innerPadding ->
                    Box(modifier = Modifier.padding(innerPadding)) {
                        AppNavGraph(
                            navController = navController,
                            startDestination = startDestination,
                            dashboardViewModel = dashboardViewModel
                        )
                    }
                }
            }
        }
    }

    @Composable
    private fun BottomNavigationBar(
        navController: androidx.navigation.NavHostController,
        currentDestination: androidx.navigation.NavDestination?
    ) {
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
                    }
                )
            }
        }
    }
}

data class BottomNavItem(val route: String, val label: String, val icon: ImageVector)
