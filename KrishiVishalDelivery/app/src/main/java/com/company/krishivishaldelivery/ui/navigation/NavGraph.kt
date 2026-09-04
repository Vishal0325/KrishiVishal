package com.company.krishivishaldelivery.ui.navigation

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.company.krishivishaldelivery.ui.auth.LoginScreen
import com.company.krishivishaldelivery.ui.dashboard.DashboardScreen
import com.company.krishivishaldelivery.ui.dashboard.DashboardViewModel
import com.company.krishivishaldelivery.ui.earnings.EarningsViewModel
import com.company.krishivishaldelivery.ui.profile.ProfileViewModel
import com.company.krishivishaldelivery.ui.scanner.ScannerViewModel
import com.company.krishivishaldelivery.ui.earnings.EarningsScreen
import com.company.krishivishaldelivery.ui.order_detail.OrderDetailScreen
import com.company.krishivishaldelivery.ui.pod.ProofOfDeliveryScreen
import com.company.krishivishaldelivery.ui.profile.ProfileScreen
import com.company.krishivishaldelivery.ui.returns.ReturnDetailScreen
import com.company.krishivishaldelivery.ui.scanner.QRScannerScreen
import com.company.krishivishaldelivery.ui.settings.SettingsScreen
import com.company.krishivishaldelivery.ui.support.SupportScreen
import com.company.krishivishaldelivery.ui.tracking.RiderDeliveryScreen
import com.company.krishivishaldelivery.ui.tracking.RiderOrderViewModel

@Composable
fun AppNavGraph(
    navController: NavHostController,
    startDestination: String,
    dashboardViewModel: DashboardViewModel
) {
    val context = LocalContext.current

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
                viewModel = dashboardViewModel,
                onOrderClick = { orderId ->
                    navController.navigate("order_detail/$orderId")
                },
                onReturnClick = { returnId ->
                    navController.navigate("return_detail/$returnId")
                },
                onScanClick = {
                    navController.navigate("scanner")
                },
                onReconciliationClick = {
                    navController.navigate("reconciliation")
                }
            )
        }
        composable("reconciliation") {
            com.company.krishivishaldelivery.ui.reconciliation.CashReconciliationScreen(
                onNavigateBack = { navController.popBackStack() },
                viewModel = dashboardViewModel
            )
        }
        composable("scanner") {
            val viewModel: ScannerViewModel = hiltViewModel()
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
        composable("earnings") {
            val viewModel: EarningsViewModel = hiltViewModel()
            EarningsScreen(viewModel = viewModel)
        }
        composable("profile") {
            val viewModel: ProfileViewModel = hiltViewModel()
            ProfileScreen(
                viewModel = viewModel,
                onLogout = {
                    navController.navigate("login") {
                        popUpTo(0)
                    }
                },
                onSettingsClick = {
                    navController.navigate("settings")
                },
                onSupportClick = {
                    navController.navigate("support")
                }
            )
        }
        composable("settings") {
            SettingsScreen(onNavigateBack = { navController.popBackStack() })
        }
        // Support Screen
        composable("support") {
            SupportScreen(onNavigateBack = { navController.popBackStack() })
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
                    dashboardViewModel.updateReturnStatus(returnId, "PICKED_UP")
                    navController.popBackStack()
                }
            )
        }
        // Rider Delivery Console Screen
        composable(
            route = "rider_delivery/{orderId}",
            arguments = listOf(navArgument("orderId") { type = NavType.StringType })
        ) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
            val viewModel: RiderOrderViewModel = hiltViewModel()
            RiderDeliveryScreen(
                orderId = orderId,
                viewModel = viewModel
            )
        }
    }
}
