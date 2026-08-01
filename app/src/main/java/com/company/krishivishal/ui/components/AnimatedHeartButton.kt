package com.company.krishivishal.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Composable
fun AnimatedHeartButton(
    isWishlisted: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Int = 24,
    activeColor: Color = Color(0xFFE91E63)
) {
    var isToggled by remember { mutableStateOf(isWishlisted) }
    
    // Update local state when prop changes (from external sync)
    LaunchedEffect(isWishlisted) {
        isToggled = isWishlisted
    }

    val scale by animateFloatAsState(
        targetValue = if (isToggled) 1.2f else 1.0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "HeartScale"
    )

    Icon(
        imageVector = if (isToggled) Icons.Default.Favorite else Icons.Outlined.FavoriteBorder,
        contentDescription = "Wishlist",
        tint = if (isToggled) activeColor else Color.Gray,
        modifier = modifier
            .size(size.dp)
            .scale(scale)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null
            ) {
                isToggled = !isToggled
                onClick()
            }
            .padding(4.dp)
    )
}
