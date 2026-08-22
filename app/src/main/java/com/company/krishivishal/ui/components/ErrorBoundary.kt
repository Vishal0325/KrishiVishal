package com.company.krishivishal.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.company.krishivishal.crashlytics.CrashlyticsErrorReporter
import com.company.krishivishal.crashlytics.ErrorCategory

@Composable
fun ErrorBoundary(
    errorReporter: CrashlyticsErrorReporter,
    screenName: String,
    content: @Composable () -> Unit
) {
    var hasError by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf("") }

    if (hasError) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Warning,
                    contentDescription = null,
                    modifier = Modifier.size(64.dp),
                    tint = MaterialTheme.colorScheme.error
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Oops! Something went wrong",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "We've encountered an unexpected error on this screen. Our team has been notified.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.Gray,
                    textAlign = TextAlign.Center
                )
                if (errorMessage.isNotEmpty()) {
                    Text(
                        text = "Error: $errorMessage",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.7f),
                        modifier = Modifier.padding(top = 16.dp)
                    )
                }
                Spacer(modifier = Modifier.height(24.dp))
                Button(
                    onClick = { hasError = false },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    )
                ) {
                    Text("Try Again")
                }
            }
        }
    } else {
        // Compose doesn't have a built-in try-catch for UI, 
        // but we can wrap the execution and report errors from ViewModels/Effects.
        // This Boundary serves as a state-based fallback.
        CompositionLocalProvider(LocalErrorBoundary provides object : ErrorHandler {
            override fun onError(e: Throwable) {
                errorMessage = e.localizedMessage ?: "Unknown UI error"
                hasError = true
                errorReporter.reportUIError(e, screenName)
            }
        }) {
            content()
        }
    }
}

interface ErrorHandler {
    fun onError(e: Throwable)
}

val LocalErrorBoundary = staticCompositionLocalOf<ErrorHandler?> { null }
