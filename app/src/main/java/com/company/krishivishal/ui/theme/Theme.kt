package com.company.krishivishal.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = PrimaryGreen,
    secondary = DarkGreen,
    tertiary = AccentOrange,
    background = DarkGreen, // Using DarkGreen for splash or dark theme bg as per prompt
    surface = DarkGreen,
    onPrimary = WhiteSurface,
    onSecondary = WhiteSurface,
    onTertiary = WhiteSurface,
    onBackground = WhiteSurface,
    onSurface = WhiteSurface,
    error = ErrorRed
)

private val LightColorScheme = lightColorScheme(
    primary = PrimaryGreen,
    secondary = DarkGreen,
    tertiary = AccentOrange,
    background = Background,
    surface = WhiteSurface,
    onPrimary = WhiteSurface,
    onSecondary = WhiteSurface,
    onTertiary = WhiteSurface,
    onBackground = TextPrimary,
    onSurface = TextPrimary,
    error = ErrorRed,
    outline = Border
)

@Composable
fun KrishiVishalTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.secondary.toArgb() // Using DarkGreen for status bar
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = KrishiTypography,
        content = content
    )
}
