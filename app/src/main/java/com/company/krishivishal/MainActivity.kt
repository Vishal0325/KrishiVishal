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
import com.company.krishivishal.utils.NotificationHelper
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.data.repository.ConfigRepository
import com.company.krishivishal.data.repository.FeatureFlagRepository
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.material.icons.filled.Build
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
import kotlinx.coroutines.tasks.await

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
    lateinit var featureFlagRepository: FeatureFlagRepository

    @Inject
    lateinit var errorReporter: CrashlyticsErrorReporter

    private var deepLinkProductId by mutableStateOf<String?>(null)
    private var deepLinkOrderId by mutableStateOf<String?>(null)
    private var deepLinkCart by mutableStateOf(false)
    private var deepLinkTrigger by mutableStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Razorpay preload MUST run on the Main thread — Checkout.preload()
        // creates a WebView internally which requires a Main Looper.
        // Running on Dispatchers.IO causes: NullPointerException on Looper.mQueue
        lifecycleScope.launch(Dispatchers.Main) {
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

            // Request Notification Permission on Android 13+ (TIRAMISU)
            val notificationPermissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
                contract = androidx.activity.result.contract.ActivityResultContracts.RequestPermission()
            ) { isGranted ->
                if (isGranted) {
                    Timber.d("POST_NOTIFICATIONS permission granted")
                } else {
                    Timber.w("POST_NOTIFICATIONS permission denied")
                }
            }

            LaunchedEffect(Unit) {
                // 1. Android 13+ POST_NOTIFICATIONS check & request
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                    val hasNotifPermission = androidx.core.content.ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        android.Manifest.permission.POST_NOTIFICATIONS
                    ) == android.content.pm.PackageManager.PERMISSION_GRANTED
                    if (!hasNotifPermission) {
                        notificationPermissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                    }
                }

                val user = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser
                if (user != null && !user.isAnonymous) {
                    // Idempotent Topic Subscription strictly for logged-in customers
                    try {
                        com.google.firebase.messaging.FirebaseMessaging.getInstance()
                            .subscribeToTopic("all_customers")
                            .await()
                        Timber.d("Successfully ensured subscription to topic: all_customers for user ${user.uid}")
                    } catch (subEx: Exception) {
                        Timber.w("Failed to ensure subscription to all_customers: ${subEx.message}")
                    }

                    try {
                        val token = com.google.firebase.messaging.FirebaseMessaging.getInstance().token.await()
                        if (token.isNotBlank()) {
                            com.google.firebase.firestore.FirebaseFirestore.getInstance()
                                .collection("users").document(user.uid)
                                .set(
                                    mapOf(
                                        "fcmToken" to token,
                                        "lastActiveAt" to com.google.firebase.firestore.FieldValue.serverTimestamp()
                                    ), 
                                    com.google.firebase.firestore.SetOptions.merge()
                                )
                            Timber.d("FCM token & lastActiveAt synced to Firestore for user ${user.uid}")
                        }

                        try {
                            com.google.firebase.messaging.FirebaseMessaging.getInstance().unsubscribeFromTopic("segment_inactive_30d")
                        } catch (subEx: Exception) {
                            Timber.w("Failed to unsubscribe from segment_inactive_30d: ${subEx.message}")
                        }
                    } catch (e: Exception) {
                        Timber.e(e, "Failed to sync FCM token on launch")
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

            val globalConfig by featureFlagRepository.globalConfig.collectAsStateWithLifecycle()
            val isVersionBlocked = globalConfig.isVersionBlocked(BuildConfig.VERSION_CODE) || showUpdateDialog
            val isUnderMaintenance = globalConfig.isMaintenanceMode

            KrishiVishalTheme(darkTheme = isDarkMode) {
                // Surface with explicit color to prevent black screen flash
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    ErrorBoundary(errorReporter = errorReporter, screenName = "GlobalRoot") {
                        when {
                            isVersionBlocked -> {
                                ForceUpdateScreen(
                                    packageName = packageName,
                                    minVersion = globalConfig.versioning.minVersionCode
                                )
                            }
                            isUnderMaintenance -> {
                                MaintenanceScreen(
                                    title = globalConfig.maintenanceMode.getTitle(languageState.value),
                                    message = globalConfig.maintenanceMode.getMessage(languageState.value),
                                    onRetry = {
                                        lifecycleScope.launch {
                                            featureFlagRepository.refreshGlobalConfig()
                                        }
                                    }
                                )
                            }
                            else -> {
                                AppNavigation(
                                    deepLinkProductId = deepLinkProductId,
                                    deepLinkOrderId = deepLinkOrderId,
                                    deepLinkCart = deepLinkCart,
                                    deepLinkTrigger = deepLinkTrigger
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    @Composable
    fun ForceUpdateScreen(packageName: String, minVersion: Int) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Surface(
                    shape = RoundedCornerShape(24.dp),
                    color = Color(0xFFE8F5E9),
                    modifier = Modifier.size(96.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Default.Update,
                            contentDescription = "Update Required",
                            tint = PrimaryGreen,
                            modifier = Modifier.size(52.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    text = "ऐप अपडेट आवश्यक है / Update Required",
                    fontWeight = FontWeight.Bold,
                    fontSize = 20.sp,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "कृषि विशाल का नया और सुरक्षित संस्करण उपलब्ध है। ऐप का उपयोग जारी रखने के लिए कृपया अभी अपडेट करें।\n\nA newer version of KrishiVishal is required to continue.",
                    textAlign = TextAlign.Center,
                    fontSize = 14.sp,
                    color = Color.Gray,
                    lineHeight = 20.sp
                )
                Spacer(modifier = Modifier.height(32.dp))
                val context = androidx.compose.ui.platform.LocalContext.current
                Button(
                    onClick = {
                        try {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName"))
                            context.startActivity(intent)
                        } catch (e: Exception) {
                            val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$packageName"))
                            context.startActivity(webIntent)
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                ) {
                    Text("अभी अपडेट करें / Update Now", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }
        }
    }

    @Composable
    fun MaintenanceScreen(
        title: String,
        message: String,
        onRetry: () -> Unit
    ) {
        var isChecking by remember { mutableStateOf(false) }
        val scope = rememberCoroutineScope()

        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Surface(
                    shape = RoundedCornerShape(24.dp),
                    color = Color(0xFFFFF3E0),
                    modifier = Modifier.size(96.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Default.Build,
                            contentDescription = "Maintenance",
                            tint = Color(0xFFFF9800),
                            modifier = Modifier.size(48.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    text = title,
                    fontWeight = FontWeight.Bold,
                    fontSize = 22.sp,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = message,
                    textAlign = TextAlign.Center,
                    fontSize = 14.sp,
                    color = Color.Gray,
                    lineHeight = 20.sp
                )
                Spacer(modifier = Modifier.height(32.dp))
                Button(
                    onClick = {
                        if (!isChecking) {
                            isChecking = true
                            scope.launch {
                                onRetry()
                                kotlinx.coroutines.delay(1000)
                                isChecking = false
                            }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                    enabled = !isChecking
                ) {
                    if (isChecking) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            color = Color.White,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text("पुनः प्रयास करें / Check Status", fontWeight = FontWeight.Bold, fontSize = 16.sp)
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
        val campaignId = intent?.getStringExtra(NotificationHelper.EXTRA_CAMPAIGN_ID)
            ?: intent?.getStringExtra("campaignId")
        if (!campaignId.isNullOrBlank()) {
            lifecycleScope.launch(Dispatchers.IO) {
                try {
                    userPreferences.saveAttributedCampaign(campaignId)
                    val clickData = hashMapOf(
                        "campaignId" to campaignId,
                        "platform" to "android"
                    )
                    com.google.firebase.functions.FirebaseFunctions.getInstance("asia-south1")
                        .getHttpsCallable("recordCampaignClick")
                        .call(clickData)
                        .await()
                    Timber.d("Recorded campaign click for $campaignId")
                } catch (e: Exception) {
                    Timber.w(e, "Failed to record campaign click for $campaignId")
                }
            }
        }

        val notifType = intent?.getStringExtra(NotificationHelper.EXTRA_NOTIFICATION_TYPE)
        val notifTargetId = intent?.getStringExtra(NotificationHelper.EXTRA_TARGET_ID)
        if (!notifTargetId.isNullOrBlank()) {
            if (notifType == "CART" || notifTargetId == "/cart" || notifTargetId.startsWith("/cart")) {
                deepLinkCart = true
                deepLinkProductId = null
                deepLinkOrderId = null
                deepLinkTrigger++
                return
            } else if (notifType == "STOCK_AVAILABLE" || notifType == "PRODUCT") {
                deepLinkCart = false
                deepLinkProductId = notifTargetId
                deepLinkOrderId = null
                deepLinkTrigger++
                return
            } else if (notifType == "ORDER") {
                deepLinkCart = false
                deepLinkOrderId = notifTargetId
                deepLinkProductId = null
                deepLinkTrigger++
                return
            } else if (notifTargetId.startsWith("/product") || notifTargetId.contains("product?id=")) {
                val prodId = notifTargetId.substringAfter("id=").substringBefore("&").ifBlank { notifTargetId.substringAfterLast("/") }
                if (prodId.isNotBlank() && prodId != "/product") {
                    deepLinkCart = false
                    deepLinkProductId = prodId
                    deepLinkOrderId = null
                    deepLinkTrigger++
                    return
                }
            } else if (notifTargetId.startsWith("/order") || notifTargetId.contains("order?id=")) {
                val ordId = notifTargetId.substringAfter("id=").substringBefore("&").ifBlank { notifTargetId.substringAfterLast("/") }
                if (ordId.isNotBlank() && ordId != "/order") {
                    deepLinkCart = false
                    deepLinkOrderId = ordId
                    deepLinkProductId = null
                    deepLinkTrigger++
                    return
                }
            }
        }

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
                deepLinkCart = false
                deepLinkProductId = destination.productId
                deepLinkOrderId = null
            }
            is DeepLinkDestination.Order -> {
                // Route order deeplinks to tracking
                deepLinkCart = false
                deepLinkProductId = null
                deepLinkOrderId = destination.orderId
                Timber.d("Received order deeplink: ${destination.orderId}")
            }
            null -> {
                val path = uri.path ?: ""
                if (path.startsWith("/cart")) {
                    deepLinkCart = true
                    deepLinkProductId = null
                    deepLinkOrderId = null
                } else if (path.startsWith("/product/")) {
                    deepLinkCart = false
                    deepLinkProductId = path.split("/").lastOrNull()
                    deepLinkOrderId = null
                } else if (path.startsWith("/order/")) {
                    deepLinkCart = false
                    deepLinkOrderId = path.split("/").lastOrNull()
                    deepLinkProductId = null
                } else {
                    deepLinkCart = false
                    deepLinkProductId = null
                    deepLinkOrderId = null
                }
            }
        }
        deepLinkTrigger++
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
