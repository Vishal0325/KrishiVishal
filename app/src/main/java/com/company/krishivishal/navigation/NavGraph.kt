package com.company.krishivishal.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.company.krishivishal.ui.main.MainScreen

@Composable
fun AppNavigation(
    deepLinkProductId: String? = null,
    deepLinkOrderId: String? = null,
    deepLinkCart: Boolean = false,
    deepLinkTrigger: Int = 0
) {
    val navController = rememberNavController()
  
    NavHost(navController = navController, startDestination = "main") {
        composable("main") {
            MainScreen(
                initialProductId = deepLinkProductId,
                initialOrderId = deepLinkOrderId,
                initialCart = deepLinkCart,
                deepLinkTrigger = deepLinkTrigger
            )
        }
    }
}
