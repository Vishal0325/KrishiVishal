package com.company.krishivishaldelivery.ui.navigation

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.launch

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
                },
                onServiceJobClick = { bookingId, status ->
                    navController.navigate("partner_job_execution/$bookingId/$status")
                },
                onWalletClick = {
                    navController.navigate("partner_wallet")
                },
                onSkillsClick = {
                    navController.navigate("partner_skills")
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
                },
                onPartnerWalletClick = {
                    navController.navigate("partner_wallet")
                },
                onPartnerSkillsClick = {
                    navController.navigate("partner_skills")
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

        // Partner Job Screens
        composable(
            route = "partner_job_alert/{serviceName}?location={location}&area={area}&earnings={earnings}",
            arguments = listOf(
                navArgument("serviceName") { type = NavType.StringType },
                navArgument("location") { type = NavType.StringType; nullable = true; defaultValue = "Farm Plot" },
                navArgument("area") { type = NavType.StringType; nullable = true; defaultValue = "Unknown Area" },
                navArgument("earnings") { type = NavType.StringType; nullable = true; defaultValue = "0.0" }
            ),
            deepLinks = listOf(androidx.navigation.navDeepLink { uriPattern = "krishivishal://job_alert/{serviceName}?location={location}&area={area}&earnings={earnings}" })
        ) { backStackEntry ->
            val serviceName = backStackEntry.arguments?.getString("serviceName") ?: "Service"
            val location = backStackEntry.arguments?.getString("location") ?: "Farm Plot"
            val area = backStackEntry.arguments?.getString("area") ?: "Unknown Area"
            val earnings = backStackEntry.arguments?.getString("earnings")?.toDoubleOrNull() ?: 0.0
            
            com.company.krishivishaldelivery.ui.partner.IncomingJobAlertScreen(
                serviceName = serviceName,
                farmLocationText = location,
                farmArea = area,
                estimatedEarnings = earnings,
                onAccept = {
                    navController.navigate("partner_job_execution/ON_THE_WAY") {
                        popUpTo("dashboard")
                    }
                },
                onDecline = { navController.popBackStack() }
            )
        }

        composable(
            route = "partner_job_execution/{bookingId}/{jobStatus}",
            arguments = listOf(
                navArgument("bookingId") { type = NavType.StringType },
                navArgument("jobStatus") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val bookingId = backStackEntry.arguments?.getString("bookingId") ?: ""
            val jobStatus = backStackEntry.arguments?.getString("jobStatus") ?: "ON_THE_WAY"
            com.company.krishivishaldelivery.ui.partner.JobExecutionScreen(
                bookingId = bookingId,
                jobStatus = jobStatus,
                viewModel = dashboardViewModel,
                onNavigateHome = {
                    navController.navigate("dashboard") {
                        popUpTo("dashboard") { inclusive = true }
                    }
                }
            )
        }

        composable("partner_wallet") {
            val walletState by dashboardViewModel.partnerWallet.collectAsState()
            val transactionsState by dashboardViewModel.walletTransactions.collectAsState()
            val scope = rememberCoroutineScope()

            com.company.krishivishaldelivery.ui.partner.PartnerWalletScreen(
                wallet = walletState,
                transactions = transactionsState,
                onRecharge = { amount ->
                    scope.launch {
                        dashboardViewModel.rechargePartnerWallet(amount)
                    }
                },
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable("partner_skills") {
            val scope = rememberCoroutineScope()
            val riderProfileRes by dashboardViewModel.riderProfile.collectAsState()
            val currentSkills = (riderProfileRes as? com.company.krishivishal.core.util.Resource.Success)?.data?.serviceSkills ?: emptyList()
            val currentEquipment = (riderProfileRes as? com.company.krishivishal.core.util.Resource.Success)?.data?.serviceEquipment ?: emptyList()

            com.company.krishivishaldelivery.ui.partner.PartnerSkillsScreen(
                currentSkills = currentSkills,
                currentEquipment = currentEquipment,
                onSaveSkills = { skills, equipment ->
                    scope.launch {
                        val success = dashboardViewModel.updatePartnerSkills(skills, equipment)
                        if (success) {
                            Toast.makeText(context, "Skills updated successfully!", Toast.LENGTH_SHORT).show()
                            navController.popBackStack()
                        } else {
                            Toast.makeText(context, "Failed to update skills. Please try again.", Toast.LENGTH_SHORT).show()
                        }
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }


    }
}
