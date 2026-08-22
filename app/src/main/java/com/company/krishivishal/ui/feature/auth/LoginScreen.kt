package com.company.krishivishal.ui.feature.auth

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Agriculture
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.company.krishivishal.R
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.utils.SmsReceiver
import com.google.android.gms.auth.api.phone.SmsRetriever
import kotlinx.coroutines.flow.collectLatest
import android.content.IntentFilter

// Helper to find Activity from Context
fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onBack: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val snackbarHostState = remember { SnackbarHostState() }

    // --- SMS Auto-Retrieval Setup ---
    val smsReceiver = remember { SmsReceiver() }
    DisposableEffect(context) {
        val filter = IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION)
        smsReceiver.setOtpListener(object : SmsReceiver.OtpReceivedListener {
            override fun onOtpReceived(otp: String) {
                viewModel.onOtpReceived(otp)
            }
            override fun onOtpTimeout() {}
        })
        
        // Registering the receiver to listen for the SMS Retriever broadcast
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(smsReceiver, filter, com.google.android.gms.auth.api.phone.SmsRetriever.SEND_PERMISSION, null, android.content.Context.RECEIVER_EXPORTED)
        } else {
            context.registerReceiver(smsReceiver, filter, com.google.android.gms.auth.api.phone.SmsRetriever.SEND_PERMISSION, null)
        }
        
        onDispose {
            try {
                context.unregisterReceiver(smsReceiver)
            } catch (e: Exception) {}
        }
    }

    // UI state to show input form vs initial welcome state
    var showLoginForm by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.uiEvent.collectLatest { event ->
            when (event) {
                is AuthUiEvent.LoginSuccess -> onLoginSuccess()
                is AuthUiEvent.ShowSnackbar -> snackbarHostState.showSnackbar(event.message)
                else -> {}
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0D1B2A)) // Deep dark blue background
    ) {
        // Background Image/Gradient
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.6f)
                .background(
                    brush = Brush.verticalGradient(
                        colors = listOf(Color(0xFF1B263B), Color(0xFF0D1B2A))
                    )
                )
        ) {
            // Decorative elements to match image
            AsyncImage(
                model = "https://images.unsplash.com/photo-1593113598332-cd288d649433?q=80&w=2070&auto=format&fit=crop", // Smart home/Farmer theme image
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                alpha = 0.4f,
                contentScale = ContentScale.Crop
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp)
        ) {
            Spacer(modifier = Modifier.height(40.dp))
            
            // Welcome Text
            Text(
                text = "Welcome to",
                color = Color.White.copy(alpha = 0.8f),
                fontSize = 24.sp,
                fontWeight = FontWeight.Normal
            )
            Text(
                text = "KrishiVishal\nSystem",
                color = Color.White,
                fontSize = 42.sp,
                fontWeight = FontWeight.Bold,
                lineHeight = 48.sp
            )

            Spacer(modifier = Modifier.weight(1f))

            // Main Action Area (The white rounded section from the image)
            AnimatedVisibility(
                visible = !showLoginForm && !uiState.isOtpSent,
                enter = fadeIn() + slideInVertically(),
                exit = fadeOut() + slideOutVertically()
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    // Decorative image/avatar floating
                    Box(
                        modifier = Modifier
                            .size(120.dp)
                            .clip(RoundedCornerShape(24.dp))
                            .background(Color.White.copy(alpha = 0.1f))
                            .border(1.dp, Color.White.copy(alpha = 0.2f), RoundedCornerShape(24.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Agriculture,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(60.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(40.dp))

                    Button(
                        onClick = { showLoginForm = true },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(80.dp),
                        shape = RoundedCornerShape(40.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color.White)
                    ) {
                        Text(
                            text = "Let's start",
                            color = Color.Black,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Input Form Area
            AnimatedVisibility(
                visible = showLoginForm || uiState.isOtpSent,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically()
            ) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 20.dp),
                    shape = RoundedCornerShape(32.dp),
                    color = Color.White,
                    shadowElevation = 8.dp
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End
                        ) {
                            IconButton(onClick = {
                                if (uiState.isOtpSent) {
                                    // Properly reset state when going back from OTP screen
                                    viewModel.onPhoneNumberChange("")
                                    // Use reflection or a new method to reset isOtpSent if needed,
                                    // or just navigate back. For now, we'll just close.
                                    onBack()
                                } else {
                                    showLoginForm = false
                                }
                            }) {
                                Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.Gray)
                            }
                        }

                        if (!uiState.isOtpSent) {
                            Text(
                                text = "Login with Phone",
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF0D1B2A)
                            )
                            Spacer(modifier = Modifier.height(16.dp))

                            OutlinedTextField(
                                value = uiState.phoneNumber,
                                onValueChange = viewModel::onPhoneNumberChange,
                                label = { Text("Mobile Number") },
                                modifier = Modifier.fillMaxWidth(),
                                prefix = { Text("+91 ", fontWeight = FontWeight.Bold) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                singleLine = true,
                                shape = RoundedCornerShape(16.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = PrimaryGreen,
                                    focusedLabelColor = PrimaryGreen
                                )
                            )

                            Spacer(modifier = Modifier.height(24.dp))

                            Button(
                                onClick = {
                                    if (uiState.phoneNumber.length == 10) {
                                        focusManager.clearFocus()
                                        val activity = context.findActivity()
                                        if (activity != null) {
                                            viewModel.sendOtp("+91${uiState.phoneNumber}", activity)
                                        }
                                    }
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(56.dp),
                                shape = RoundedCornerShape(16.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                                enabled = uiState.phoneNumber.length == 10 && !uiState.isLoading
                            ) {
                                if (uiState.isLoading) {
                                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                                } else {
                                    Text("Send OTP", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        } else {
                            Text(
                                text = "Verify OTP",
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF0D1B2A)
                            )
                            Text(
                                text = "Sent to +91 ${uiState.phoneNumber}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color.Gray,
                                modifier = Modifier.padding(top = 8.dp)
                            )
                            Spacer(modifier = Modifier.height(24.dp))

                            OtpTextField(
                                otpText = uiState.otp,
                                onOtpTextChange = {
                                    viewModel.onOtpChange(it)
                                    if (it.length == 6) {
                                        viewModel.verifyOtp()
                                    }
                                }
                            )

                            Spacer(modifier = Modifier.height(32.dp))

                            Button(
                                onClick = { viewModel.verifyOtp() },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(56.dp),
                                shape = RoundedCornerShape(16.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                                enabled = uiState.otp.length == 6 && !uiState.isLoading
                            ) {
                                if (uiState.isLoading) {
                                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                                } else {
                                    Text("Verify & Continue", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Footer
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Don't have account?",
                    color = Color.White.copy(alpha = 0.6f),
                    fontSize = 14.sp
                )

                Surface(
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .clickable { /* Navigate to register or show register form */ },
                    color = Color(0xFF3A86FF) // Sky blue color from image
                ) {
                    Text(
                        text = "Register now",
                        color = Color.White,
                        modifier = Modifier.padding(horizontal = 24.dp, vertical = 10.dp),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))
        }

        // Snackbar for errors
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter)
        )
    }
}

@Composable
fun OtpTextField(
    otpText: String,
    onOtpTextChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    otpCount: Int = 6
) {
    BasicTextField(
        modifier = modifier,
        value = otpText,
        onValueChange = {
            if (it.length <= otpCount) {
                onOtpTextChange(it)
            }
        },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        decorationBox = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                repeat(otpCount) { index ->
                    val char = when {
                        index >= otpText.length -> ""
                        else -> otpText[index].toString()
                    }
                    val isFocused = otpText.length == index

                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .border(
                                width = if (isFocused) 2.dp else 1.dp,
                                color = if (isFocused) PrimaryGreen else Color.LightGray,
                                shape = RoundedCornerShape(8.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = char,
                            style = MaterialTheme.typography.titleLarge,
                            color = if (isFocused) PrimaryGreen else Color.DarkGray,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }
    )
}
