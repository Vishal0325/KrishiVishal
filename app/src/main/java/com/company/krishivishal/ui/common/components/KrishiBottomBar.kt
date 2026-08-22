package com.company.krishivishal.ui.common.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.company.krishivishal.ui.navigation.BadgeState
import com.company.krishivishal.ui.navigation.BottomNavItem
import com.company.krishivishal.ui.theme.PrimaryGreen

/**
 * Glassmorphism-styled Bottom Navigation Bar for KrishiVishal.
 * Matches the floating, translucent design from the reference image.
 */
@Composable
fun KrishiBottomBar(
    selectedIndex: Int,
    onItemSelected: (Int) -> Unit,
    modifier: Modifier = Modifier,
    badges: Map<Int, BadgeState> = emptyMap()
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 20.dp), // Floating padding
        contentAlignment = Alignment.Center
    ) {
        // Glassmorphism Container
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(72.dp),
            shape = RoundedCornerShape(36.dp),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.85f),
            shadowElevation = 10.dp,
            border = androidx.compose.foundation.BorderStroke(
                width = 0.5.dp,
                brush = Brush.verticalGradient(
                    colors = listOf(
                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.2f),
                        Color.Transparent
                    )
                )
            )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 8.dp),
                horizontalArrangement = Arrangement.SpaceAround,
                verticalAlignment = Alignment.CenterVertically
            ) {
                BottomNavItem.items.forEach { item ->
                    val isSelected = selectedIndex == item.index
                    val badgeState = badges[item.index] ?: BadgeState()

                    GlassNavItem(
                        item = item,
                        isSelected = isSelected,
                        badgeState = badgeState,
                        onClick = { onItemSelected(item.index) }
                    )
                }
            }
        }
    }
}

@Composable
fun RowScope.GlassNavItem(
    item: BottomNavItem,
    isSelected: Boolean,
    badgeState: BadgeState,
    onClick: () -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }

    Column(
        modifier = Modifier
            .weight(1f)
            .clickable(
                interactionSource = interactionSource,
                indication = null, // Remove default ripple for cleaner glass look
                onClick = onClick
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        BadgedBox(
            badge = {
                if (badgeState.isVisible) {
                    Badge(
                        containerColor = MaterialTheme.colorScheme.error,
                        contentColor = MaterialTheme.colorScheme.onError,
                        modifier = Modifier.offset(x = (-4).dp, y = 4.dp)
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
                tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
            )
        }

        Spacer(modifier = Modifier.height(4.dp))

        Text(
            text = item.title,
            fontSize = 11.sp,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
            color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
        )

        // Selected Indicator (Dot)
        if (isSelected) {
            Box(
                modifier = Modifier
                    .padding(top = 2.dp)
                    .size(4.dp)
                    .background(MaterialTheme.colorScheme.primary, CircleShape)
            )
        } else {
            // Placeholder to keep spacing consistent
            Spacer(modifier = Modifier.height(6.dp))
        }
    }
}
