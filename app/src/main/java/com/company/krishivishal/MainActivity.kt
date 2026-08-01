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
import androidx.compose.material.icons.filled.ArrowBack
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
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.data.repository.ConfigRepository
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import androidx.appcompat.app.AppCompatDelegate
import com.razorpay.PaymentResultListener
import com.razorpay.Checkout
import com.company.krishivishal.payment.PaymentHandler
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

@AndroidEntryPoint
class MainActivity : ComponentActivity(), PaymentResultListener {
    
    @Inject
    lateinit var userPreferences: UserPreferences

    @Inject
    lateinit var deepLinkManager: DeepLinkManager

    @Inject
    lateinit var paymentHandler: PaymentHandler

    @Inject
    lateinit var configRepository: ConfigRepository

    private var deepLinkProductId by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        Checkout.preload(applicationContext)
        handleIntent(intent)
        
        enableEdgeToEdge()
        
        setContent {
            val language by userPreferences.language.collectAsState(initial = "en")
            val configResource by configRepository.getConfig().collectAsState(initial = Resource.Loading())
            
            var showUpdateDialog by remember { mutableStateOf(false) }

            LaunchedEffect(configResource) {
                if (configResource is Resource.Success) {
                    val config = (configResource as Resource.Success).data
                    if (config != null && BuildConfig.VERSION_CODE < config.minAppVersion) {
                        showUpdateDialog = true
                    }
                }
            }

            LaunchedEffect(language) {
                val currentLocale = AppCompatDelegate.getApplicationLocales().toLanguageTags()
                if (currentLocale != language) {
                    LocaleManager.setLocale(this@MainActivity, language)
                }
            }

            KrishiVishalTheme {
                if (showUpdateDialog) {
                    UpdateRequiredDialog()
                }

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

    @Composable
    fun UpdateRequiredDialog() {
        Dialog(onDismissRequest = {}) {
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = Color.White,
                modifier = Modifier.fillMaxWidth().padding(16.dp)
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(Icons.Default.Update, contentDescription = null, tint = PrimaryGreen, modifier = Modifier.size(48.dp))
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Update Required", fontWeight = FontWeight.Black, fontSize = 20.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "A new version of KrishiVishal is available with critical fixes. Please update to continue.",
                        textAlign = TextAlign.Center,
                        fontSize = 14.sp,
                        color = Color.Gray
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(
                        onClick = { 
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${packageName}"))
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
        intent?.data?.let { uri ->
            deepLinkProductId = deepLinkManager.getProductIdFromUri(uri)
        }
    }

    override fun onPaymentSuccess(razorpayPaymentId: String?) {
        lifecycleScope.launch {
            paymentHandler.onPaymentSuccess(razorpayPaymentId)
        }
    }

    override fun onPaymentError(code: Int, description: String?) {
        lifecycleScope.launch {
            paymentHandler.onPaymentError(code, description)
        }
    }
}
