package com.company.krishivishal.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Analytics Dashboard Component
 * Displays key analytics metrics and health status
 */
@Composable
fun AnalyticsDashboard(
    totalUsers: Int = 0,
    totalSessions: Int = 0,
    totalPurchases: Int = 0,
    totalRevenue: Double = 0.0,
    averageSessionDuration: Long = 0,
    crashReportCount: Int = 0,
    errorCount: Int = 0,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Header
        Text(
            text = "Analytics Dashboard",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )

        // Key Metrics
        MetricsRow(
            metric1 = MetricCardData(
                title = "Total Users",
                value = totalUsers.toString(),
                icon = Icons.Default.CheckCircle,
                backgroundColor = MaterialTheme.colorScheme.primaryContainer
            ),
            metric2 = MetricCardData(
                title = "Sessions",
                value = totalSessions.toString(),
                icon = Icons.Default.CheckCircle,
                backgroundColor = MaterialTheme.colorScheme.secondaryContainer
            )
        )

        MetricsRow(
            metric1 = MetricCardData(
                title = "Total Revenue",
                value = "₹${String.format("%.0f", totalRevenue)}",
                icon = Icons.Default.CheckCircle,
                backgroundColor = MaterialTheme.colorScheme.tertiaryContainer
            ),
            metric2 = MetricCardData(
                title = "Purchases",
                value = totalPurchases.toString(),
                icon = Icons.Default.CheckCircle,
                backgroundColor = MaterialTheme.colorScheme.primaryContainer
            )
        )

        // Health Status
        HealthStatusCard(
            crashReportCount = crashReportCount,
            errorCount = errorCount
        )

        // Session Metrics
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Session Metrics",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Average Duration",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        text = formatDuration(averageSessionDuration),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}

@Composable
private fun MetricsRow(
    metric1: MetricCardData,
    metric2: MetricCardData,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        MetricCardUI(metric1, Modifier.weight(1f))
        MetricCardUI(metric2, Modifier.weight(1f))
    }
}

@Composable
private fun MetricCardUI(
    metric: MetricCardData,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = metric.backgroundColor
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = metric.icon,
                contentDescription = metric.title,
                modifier = Modifier.size(32.dp),
                tint = MaterialTheme.colorScheme.primary
            )
            Text(
                text = metric.value,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = metric.title,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun HealthStatusCard(
    crashReportCount: Int,
    errorCount: Int,
    modifier: Modifier = Modifier
) {
    val isHealthy = crashReportCount == 0 && errorCount == 0
    val statusIcon = if (isHealthy) Icons.Default.CheckCircle else Icons.Default.Warning
    val statusColor = if (isHealthy) MaterialTheme.colorScheme.secondary 
                      else MaterialTheme.colorScheme.error

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isHealthy) 
                MaterialTheme.colorScheme.secondaryContainer 
            else 
                MaterialTheme.colorScheme.errorContainer
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Start,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = statusIcon,
                    contentDescription = "Health Status",
                    modifier = Modifier.size(24.dp),
                    tint = statusColor
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (isHealthy) "System Healthy" else "Issues Detected",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = statusColor
                )
            }

            if (!isHealthy) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    IssueItem("Crashes", crashReportCount)
                    IssueItem("Errors", errorCount)
                }
            }
        }
    }
}

@Composable
private fun IssueItem(label: String, count: Int) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = count.toString(),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.error
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onErrorContainer
        )
    }
}

data class MetricCardData(
    val title: String,
    val value: String,
    val icon: ImageVector,
    val backgroundColor: Color
)

private fun formatDuration(durationMs: Long): String {
    val seconds = (durationMs / 1000) % 60
    val minutes = (durationMs / (1000 * 60)) % 60
    val hours = durationMs / (1000 * 60 * 60)
    
    return when {
        hours > 0 -> "${hours}h ${minutes}m"
        minutes > 0 -> "${minutes}m ${seconds}s"
        else -> "${seconds}s"
    }
}
