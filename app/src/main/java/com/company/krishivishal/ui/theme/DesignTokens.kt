package com.company.krishivishal.ui.theme

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object DesignTokens {
    object Spacing {
        val xs = 4.dp
        val sm = 8.dp
        val md = 16.dp
        val lg = 24.dp
        val xl = 32.dp
    }

    object Radius {
        val button = 8.dp
        val card = 10.dp
        val chip = 20.dp
        val bottomSheet = 16.dp
    }

    object Typography {
        val dialogTitle = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.Bold)
        val dialogBody = TextStyle(fontSize = 14.sp)
    }
}
