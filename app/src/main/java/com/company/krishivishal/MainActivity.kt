package com.company.krishivishal

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Update
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.company.krishivishal.data.local.datastore.UserPreferences
import com.company.krishivishal.navigation.AppNavigation
import com.company.krishivishal.ui.theme.KrishiVishalTheme
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.utils.LocaleManager
import com.company.krishivishal.utils.DeepLinkManager
import com.company.krishivishal.utils.DeepLinkDestination
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.data.repository.ConfigRepository
import com.company.krishivishal.crashlytics.CrashlyticsErrorReporter
import com.company.krishivishal.ui.components.ErrorBoundary
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import androidx.appcompat.app.AppCompatDelegate
import com.razorpay.PaymentResultWithDataListener
import com.razorpay.Checkout
import com.razorpay.PaymentData
import com.company.krishivishal.payment.PaymentHandler
import androidx.lifecycle.lifecycleScope
import timber.log.Timber
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.TimeoutCancellationException

@AndroidEntryPoint
class MainActivity : ComponentActivity(), PaymentResultWithDataListener {
    
    @Inject
    lateinit var userPreferences: UserPreferences

    @Inject
    lateinit var deepLinkManager: DeepLinkManager

    @Inject
    lateinit var paymentHandler: PaymentHandler

    @Inject
    lateinit var configRepository: ConfigRepository

    @Inject
    lateinit var errorReporter: CrashlyticsErrorReporter

    private var deepLinkProductId by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Razorpay preload requires a thread with a Looper (Main thread)
        lifecycleScope.launch(Dispatchers.Main.immediate) {
            try {
                Checkout.preload(applicationContext)
            } catch (e: Exception) {
                Timber.e(e, "Razorpay preload failed")
            }
        }
        
        handleIntent(intent)
        enableEdgeToEdge()
        
        // Deeplink validation
        val intentData = intent
        if (intentData?.action == Intent.ACTION_VIEW) {
            val uri = intentData.data
            if (uri != null && !deepLinkManager.isValidDeepLink(uri) && !isValidDeepLink(uri)) {
                Timber.e("Invalid deeplink attempted: $uri")
                finish()
                return
            }
        }
        
        setContent {
            val languageFlow = remember { userPreferences.language }
            val languageState = languageFlow.collectAsState(initial = "en")
            
            val themeFlow = remember { userPreferences.themeMode }
            val themeState = themeFlow.collectAsState(initial = false)
            
            val configFlow = remember { configRepository.getConfig() }
            val configState = configFlow.collectAsState(initial = Resource.Loading())
            
            var showUpdateDialog by remember { mutableStateOf(false) }
            
            // Collect system dark theme if user hasn't explicitly set one? 
            // For simplicity, we use the persisted value which defaults to false.
            val isDarkMode = themeState.value

            LaunchedEffect(configState.value) {
                val res = configState.value
                if (res is Resource.Success) {
                    res.data?.let { config ->
                        if (BuildConfig.VERSION_CODE < config.minAppVersion) {
                            showUpdateDialog = true
                        }
                    }
                }
            }

            /* LaunchedEffect(languageState.value) {
                val lang = languageState.value
                val currentLocale = AppCompatDelegate.getApplicationLocales().toLanguageTags()
                if (currentLocale != lang) {
                    LocaleManager.setLocale(lang)
                }
            } */

            KrishiVishalTheme(darkTheme = isDarkMode) {
                // Surface with explicit color to prevent black screen flash
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    ErrorBoundary(errorReporter = errorReporter, screenName = "GlobalRoot") {
                        Box(modifier = Modifier.fillMaxSize()) {
                            AppNavigation(deepLinkProductId = deepLinkProductId)
                            
                            if (showUpdateDialog) {
                                UpdateRequiredDialog()
                            }
                        }
                    }
                }
            }
        }
    }

    @Composable
    fun UpdateRequiredDialog() {
        Dialog(onDismissRequest = {}) {
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = Color.White,
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                shadowElevation = 8.dp
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(Icons.Default.Update, contentDescription = null, tint = PrimaryGreen, modifier = Modifier.size(48.dp))
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Update Required", fontWeight = FontWeight.Bold, fontSize = 20.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "A new version of KrishiVishal is available. Please update to continue.",
                        textAlign = TextAlign.Center,
                        fontSize = 14.sp,
                        color = Color.Gray
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(
                        onClick = { 
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName"))
                            startActivity(intent)
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                    ) {
                        Text("Update Now", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.action != Intent.ACTION_VIEW) {
            return
        }

        val uri = intent.data ?: return
        val destination = deepLinkManager.parseDeepLink(uri)
        if (destination == null && !isValidDeepLink(uri)) {
            deepLinkProductId = null
            if (!isFinishing) finish()
            return
        }

        when (destination) {
            is DeepLinkDestination.Product -> {
                deepLinkProductId = destination.productId
            }
            is DeepLinkDestination.Order -> {
                // Order deeplinks are logged and not routed as product details
                deepLinkProductId = null
                Timber.d("Received order deeplink: ${destination.orderId}")
            }
            null -> {
                val path = uri.path ?: ""
                if (path.startsWith("/product/")) {
                    deepLinkProductId = path.split("/").lastOrNull()
                } else {
                    deepLinkProductId = null
                }
            }
        }
    }

    override fun onPaymentSuccess(razorpayPaymentId: String?, data: PaymentData?) {
        // [FIXED] Point #165: Add timeout to payment handler to prevent hanging
        lifecycleScope.launch {
            try {
                withTimeout(10_000L) { // 10 second timeout
                    paymentHandler.onPaymentSuccess(
                        razorpayPaymentId = razorpayPaymentId,
                        razorpayOrderId = data?.orderId,
                        razorpaySignature = data?.signature
                    )
                }
            } catch (e: TimeoutCancellationException) {
                Timber.e("Payment success handler timeout")
            } catch (e: Exception) {
                Timber.e(e, "Payment success handler error")
            }
        }
    }

    override fun onPaymentError(code: Int, description: String?, data: PaymentData?) {
        // [FIXED] Point #165: Add timeout to error handler
        lifecycleScope.launch {
            try {
                withTimeout(10_000L) { // 10 second timeout
                    paymentHandler.onPaymentError(code, description)
                }
            } catch (e: TimeoutCancellationException) {
                Timber.e("Payment error handler timeout")
            } catch (e: Exception) {
                Timber.e(e, "Payment error handler exception")
            }
        }
    }

    private fun isValidDeepLink(uri: Uri): Boolean {
        // [FIXED] Point #164: Comprehensive deeplink validation with path traversal prevention
        val validHosts = listOf("krishivishal.app", "krishivishal.com", "www.krishivishal.com")
        val host = uri.host ?: return false
        
        // Host must be whitelisted
        if (!validHosts.contains(host)) {
            Timber.w("Invalid deeplink host: $host")
            return false
        }
        
        // Path must be valid
        val path = uri.path ?: return false
        val validPathPrefixes = listOf("/product/", "/order/", "/category/")
        if (!validPathPrefixes.any { path.startsWith(it) }) {
            Timber.w("Invalid deeplink path: $path")
            return false
        }
        
        // Extract ID and validate format (alphanumeric, dash, underscore only)
        val id = path.split("/").lastOrNull() ?: return false
        if (id.isEmpty()) {
            Timber.w("Empty ID in deeplink")
            return false
        }
        
        val isValidFormat = id.matches(Regex("^[a-zA-Z0-9_-]+$"))
        if (!isValidFormat) {
            Timber.w("Invalid ID format in deeplink: $id")
        }
        return isValidFormat
    }
}
