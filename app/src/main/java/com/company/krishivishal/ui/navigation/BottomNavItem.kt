package com.company.krishivishal.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Spa
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material.icons.outlined.Spa
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Represent an item in the Bottom Navigation Bar.
 */
sealed class BottomNavItem(
    val route: String,
    val title: String,
    val icon: ImageVector,
    val selectedIcon: ImageVector,
    val index: Int
) {
    object Home : BottomNavItem(
        route = "home",
        title = "Home",
        icon = Icons.Outlined.Home,
        selectedIcon = Icons.Filled.Home,
        index = 0
    )

    object Crop : BottomNavItem(
        route = "crop",
        title = "Crop",
        icon = Icons.Outlined.Spa,
        selectedIcon = Icons.Filled.Spa,
        index = 1
    )

    object Orders : BottomNavItem(
        route = "orders",
        title = "My Order",
        icon = Icons.Outlined.ShoppingBag,
        selectedIcon = Icons.Filled.ShoppingBag,
        index = 2
    )

    object Profile : BottomNavItem(
        route = "profile",
        title = "Profile",
        icon = Icons.Outlined.Person,
        selectedIcon = Icons.Filled.Person,
        index = 3
    )

    companion object {
        val items by lazy { listOf(Home, Crop, Orders, Profile) }
        
        fun fromIndex(index: Int): BottomNavItem {
            return items.find { it.index == index } ?: Home
        }
    }
}
