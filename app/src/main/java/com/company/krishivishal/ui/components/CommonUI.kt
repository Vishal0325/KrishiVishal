package com.company.krishivishal.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.company.krishivishal.R
import com.company.krishivishal.ui.theme.PrimaryGreen

@Composable
fun ErrorState(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    buttonText: String = stringResource(R.string.retry)
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = message,
            color = Color.Red,
            textAlign = TextAlign.Center,
            fontSize = 14.sp
        )
        Spacer(modifier = Modifier.height(12.dp))
        Button(
            onClick = onRetry,
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
        ) {
            Text(buttonText)
        }
    }
}

@Composable
fun EmptyState(
    message: String,
    icon: ImageVector,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = Color.LightGray
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = message,
            color = Color.Gray,
            textAlign = TextAlign.Center,
            fontSize = 16.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
fun StitchFilterChip(
    text: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onClick,
        shape = androidx.compose.foundation.shape.CircleShape,
        color = if (isSelected) com.company.krishivishal.ui.theme.StitchPrimary else com.company.krishivishal.ui.theme.StitchSurfaceContainer,
        contentColor = if (isSelected) Color.White else com.company.krishivishal.ui.theme.StitchOnSurface,
        border = if (isSelected) null else androidx.compose.foundation.BorderStroke(1.dp, com.company.krishivishal.ui.theme.StitchOutlineVariant),
        modifier = modifier.height(36.dp)
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.padding(horizontal = 16.dp)
        ) {
            Text(
                text = text,
                fontSize = 13.sp,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
            )
        }
    }
}

@Composable
fun StitchRatingBadge(
    rating: Double,
    reviewCount: Int = 0,
    modifier: Modifier = Modifier
) {
    Surface(
        shape = androidx.compose.foundation.shape.RoundedCornerShape(6.dp),
        color = com.company.krishivishal.ui.theme.StitchSurfaceLow,
        modifier = modifier
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
        ) {
            Text(
                text = "★",
                color = com.company.krishivishal.ui.theme.StitchSecondaryOrange,
                fontSize = 12.sp
            )
            Spacer(modifier = Modifier.width(3.dp))
            Text(
                text = String.format(java.util.Locale.US, "%.1f", rating),
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = com.company.krishivishal.ui.theme.StitchOnSurface
            )
            if (reviewCount > 0) {
                Spacer(modifier = Modifier.width(3.dp))
                Text(
                    text = "($reviewCount)",
                    fontSize = 11.sp,
                    color = com.company.krishivishal.ui.theme.StitchOnSurfaceVariant
                )
            }
        }
    }
}
