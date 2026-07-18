package com.company.krishivishal.ui.common.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.company.krishivishal.ui.navigation.BadgeState
import com.company.krishivishal.ui.navigation.BottomNavItem
import com.company.krishivishal.ui.theme.PrimaryGreen

/**
 * Enterprise-grade Bottom Navigation Bar for KrishiVishal.
 * 
 * @param selectedIndex Current selected tab index.
 * @param onItemSelected Callback when a tab is clicked.
 * @param badges Map of index to badge state (e.g., cart count).
 */
@Composable
fun KrishiBottomBar(
    selectedIndex: Int,
    onItemSelected: (Int) -> Unit,
    modifier: Modifier = Modifier,
    badges: Map<Int, BadgeState> = emptyMap()
) {
    NavigationBar(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.surface,
        tonalElevation = 8.dp
    ) {
        BottomNavItem.items.forEach { item ->
            val isSelected = selectedIndex == item.index
            val badgeState = badges[item.index] ?: BadgeState()

            NavigationBarItem(
                selected = isSelected,
                onClick = { onItemSelected(item.index) },
                icon = {
                    BadgedBox(
                        badge = {
                            if (badgeState.isVisible) {
                                Badge(
                                    containerColor = MaterialTheme.colorScheme.error,
                                    contentColor = Color.White
                                ) {
                                    if (!badgeState.showDotOnly && badgeState.count > 0) {
                                        Text(
                                            text = if (badgeState.count > 99) "99+" else badgeState.count.toString(),
                                            fontSize = 10.sp
                                        )
                                    }
                                }
                            }
                        }
                    ) {
                        Icon(
                            imageVector = if (isSelected) item.selectedIcon else item.icon,
                            contentDescription = item.title,
                            modifier = Modifier.size(24.dp),
                            tint = if (isSelected) PrimaryGreen else Color.Gray
                        )
                    }
                },
                label = {
                    Text(
                        text = item.title,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                        color = if (isSelected) PrimaryGreen else Color.Gray
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = PrimaryGreen,
                    unselectedIconColor = Color.Gray,
                    selectedTextColor = PrimaryGreen,
                    unselectedTextColor = Color.Gray,
                    indicatorColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.1f)
                )
            )
        }
    }
}
