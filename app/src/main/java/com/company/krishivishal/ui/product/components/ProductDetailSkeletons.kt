package com.company.krishivishal.ui.product.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

fun Modifier.shimmerEffect(): Modifier = composed {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val translateAnim = transition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmer"
    )

    val shimmerColors = listOf(
        Color.LightGray.copy(alpha = 0.6f),
        Color.LightGray.copy(alpha = 0.2f),
        Color.LightGray.copy(alpha = 0.6f),
    )

    val brush = Brush.linearGradient(
        colors = shimmerColors,
        start = Offset.Zero,
        end = Offset(x = translateAnim.value, y = translateAnim.value)
    )

    background(brush)
}

@Composable
fun ProductImageSkeleton() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(350.dp)
            .shimmerEffect()
    )
}

@Composable
fun ProductInfoSkeleton() {
    Column(modifier = Modifier.padding(16.dp)) {
        Box(modifier = Modifier.fillMaxWidth(0.7f).height(24.dp).clip(RoundedCornerShape(4.dp)).shimmerEffect())
        Spacer(modifier = Modifier.height(8.dp))
        Box(modifier = Modifier.fillMaxWidth(0.4f).height(16.dp).clip(RoundedCornerShape(4.dp)).shimmerEffect())
        Spacer(modifier = Modifier.height(12.dp))
        Box(modifier = Modifier.fillMaxWidth(0.3f).height(20.dp).clip(RoundedCornerShape(4.dp)).shimmerEffect())
        Spacer(modifier = Modifier.height(16.dp))
        Box(modifier = Modifier.fillMaxWidth(0.5f).height(32.dp).clip(RoundedCornerShape(4.dp)).shimmerEffect())
    }
}

@Composable
fun VariantsSkeleton() {
    Column(modifier = Modifier.padding(vertical = 12.dp)) {
        Box(modifier = Modifier.padding(horizontal = 16.dp).width(120.dp).height(20.dp).clip(RoundedCornerShape(4.dp)).shimmerEffect())
        LazyRow(
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(3) {
                Box(modifier = Modifier.width(120.dp).height(100.dp).clip(RoundedCornerShape(12.dp)).shimmerEffect())
            }
        }
    }
}

@Composable
fun TechnicalInfoSkeleton() {
    Column(modifier = Modifier.padding(16.dp)) {
        repeat(5) {
            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                Box(modifier = Modifier.weight(0.4f).height(16.dp).clip(RoundedCornerShape(4.dp)).shimmerEffect())
                Spacer(modifier = Modifier.width(16.dp))
                Box(modifier = Modifier.weight(0.6f).height(16.dp).clip(RoundedCornerShape(4.dp)).shimmerEffect())
            }
        }
    }
}
