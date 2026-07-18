package com.company.krishivishal

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.company.krishivishal.data.local.datastore.UserPreferences
import com.company.krishivishal.navigation.AppNavigation
import com.company.krishivishal.ui.theme.KrishiVishalTheme
import com.company.krishivishal.utils.LocaleManager
import com.company.krishivishal.utils.DeepLinkManager
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    
    @Inject
    lateinit var userPreferences: UserPreferences

    @Inject
    lateinit var deepLinkManager: DeepLinkManager

    private var deepLinkProductId by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        handleIntent(intent)
        
        enableEdgeToEdge()
        
        setContent {
            val language by userPreferences.language.collectAsState(initial = "en")
            
            LaunchedEffect(language) {
                val currentLocale = AppCompatDelegate.getApplicationLocales().toLanguageTags()
                if (currentLocale != language) {
                    LocaleManager.setLocale(this@MainActivity, language)
                }
            }

            KrishiVishalTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    AppNavigation(deepLinkProductId = deepLinkProductId)
                    // Reset after navigation
                    deepLinkProductId = null
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        intent?.data?.let { uri ->
            deepLinkProductId = deepLinkManager.getProductIdFromUri(uri)
        }
    }
}
