package com.company.krishivishal.ui.admin.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.TextStyle

@Composable
fun BarChart(
    data: Map<String, Double>,
    modifier: Modifier = Modifier,
    color: Color = MaterialTheme.colorScheme.primary
) {
    val textMeasurer = rememberTextMeasurer()
    val items = data.toList()
    val maxValue = items.maxOfOrNull { it.second } ?: 1.0

    Canvas(modifier = modifier) {
        val barWidth = size.width / (items.size * 1.5f)
        val space = barWidth / 2

        items.forEachIndexed { index, pair ->
            val x = (index * (barWidth + space)) + space
            val barHeight = ((pair.second / maxValue) * size.height.toDouble()).toFloat()
            
            drawRect(
                color = color,
                topLeft = Offset(x, size.height - barHeight),
                size = Size(barWidth, barHeight)
            )
            
            drawText(
                textMeasurer = textMeasurer,
                text = pair.first.take(5),
                style = TextStyle(fontSize = 10.sp, color = Color.Gray),
                topLeft = Offset(x, size.height + 4.dp.toPx())
            )
        }
    }
}

@Composable
fun PieChart(
    data: Map<String, Int>,
    modifier: Modifier = Modifier
) {
    val colors = listOf(
        Color(0xFF4CAF50), Color(0xFF2196F3), Color(0xFFFF9800), 
        Color(0xFFE91E63), Color(0xFF9C27B0), Color(0xFF00BCD4)
    )
    val total = data.values.sum().toFloat()
    var startAngle = 0f

    Canvas(modifier = modifier) {
        data.values.forEachIndexed { index, value ->
            val sweepAngle = (value / total) * 360f
            drawArc(
                color = colors[index % colors.size],
                startAngle = startAngle,
                sweepAngle = sweepAngle,
                useCenter = true
            )
            startAngle += sweepAngle
        }
    }
}
