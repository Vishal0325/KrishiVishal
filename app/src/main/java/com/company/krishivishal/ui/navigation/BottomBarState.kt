package com.company.krishivishal.ui.navigation

import androidx.compose.runtime.Immutable

/**
 * State for a badge on a navigation item.
 */
@Immutable
data class BadgeState(
    val count: Int = 0,
    val isVisible: Boolean = false,
    val showDotOnly: Boolean = false
)

/**
 * UI State for the Bottom Navigation Bar.
 */
@Immutable
data class BottomBarState(
    val selectedItem: BottomNavItem = BottomNavItem.Home,
    val badges: Map<Int, BadgeState> = emptyMap()
)
