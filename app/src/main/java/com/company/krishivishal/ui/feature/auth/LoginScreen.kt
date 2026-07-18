package com.company.krishivishal.ui.feature.auth

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import com.company.krishivishal.R
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.ui.theme.PrimaryGreen
import kotlinx.coroutines.flow.collectLatest

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

    LaunchedEffect(Unit) {
        viewModel.uiEvent.collectLatest { event ->
            when (event) {
                is AuthUiEvent.LoginSuccess -> onLoginSuccess()
                is AuthUiEvent.ShowSnackbar -> snackbarHostState.showSnackbar(event.message)
                else -> {}
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        text = if (uiState.isOtpSent) "OTP Verification" else "Welcome to KrishiVishal", 
                        fontWeight = FontWeight.Bold 
                    ) 
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(40.dp))
            
            Icon(
                imageVector = if (uiState.isOtpSent) Icons.Default.VerifiedUser else Icons.Default.Phone,
                contentDescription = null,
                modifier = Modifier.size(100.dp),
                tint = PrimaryGreen
            )
            
            Spacer(modifier = Modifier.height(32.dp))
            
            AnimatedContent(
                targetState = uiState.isOtpSent,
                transitionSpec = {
                    fadeIn() togetherWith fadeOut()
                },
                label = "LoginFlowTransition"
            ) { isOtpSent ->
                if (!isOtpSent) {
                    PhoneInputSection(
                        phoneNumber = uiState.phoneNumber,
                        referralCode = uiState.referralCode,
                        isLoading = uiState.isLoading,
                        onPhoneNumberChange = viewModel::onPhoneNumberChange,
                        onReferralCodeChange = viewModel::onReferralCodeChange,
                        onSendOtp = {
                            if (uiState.phoneNumber.length == 10) {
                                focusManager.clearFocus()
                                val activity = context.findActivity()
                                if (activity != null) {
                                    viewModel.sendOtp("+91${uiState.phoneNumber}", activity)
                                }
                            }
                        },
                        onGoogleSignIn = {
                            viewModel.signInWithGoogle(context)
                        }
                    )
                } else {
                    OtpInputSection(
                        phoneNumber = uiState.phoneNumber,
                        otp = uiState.otp,
                        isLoading = uiState.isLoading,
                        resendTimer = uiState.resendTimer,
                        isResendEnabled = uiState.isResendEnabled,
                        onOtpChange = viewModel::onOtpChange,
                        onVerifyOtp = {
                            if (uiState.otp.length == 6) {
                                focusManager.clearFocus()
                                viewModel.verifyOtp()
                            }
                        },
                        onChangeNumber = { viewModel.onPhoneNumberChange("") },
                        onResendOtp = {
                            val activity = context.findActivity()
                            if (activity != null) {
                                viewModel.sendOtp("+91${uiState.phoneNumber}", activity)
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun PhoneInputSection(
    phoneNumber: String,
    referralCode: String,
    isLoading: Boolean,
    onPhoneNumberChange: (String) -> Unit,
    onReferralCodeChange: (String) -> Unit,
    onSendOtp: () -> Unit,
    onGoogleSignIn: () -> Unit
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = "Enter your mobile number",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )
        
        Text(
            text = "We will send you a 6-digit verification code",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.Gray,
            modifier = Modifier.padding(top = 8.dp)
        )
        
        Spacer(modifier = Modifier.height(32.dp))
        
        OutlinedTextField(
            value = phoneNumber,
            onValueChange = onPhoneNumberChange,
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

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = referralCode,
            onValueChange = onReferralCodeChange,
            label = { Text("Referral Code (Optional)") },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("e.g. KRISHI50") },
            singleLine = true,
            shape = RoundedCornerShape(16.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PrimaryGreen,
                focusedLabelColor = PrimaryGreen
            )
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Button(
            onClick = onSendOtp,
            modifier = Modifier.fillMaxWidth().height(56.dp),
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
            enabled = phoneNumber.length == 10 && !isLoading
        ) {
            if (isLoading) {
                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
            } else {
                Text("Get Started", fontSize = 18.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            HorizontalDivider(modifier = Modifier.weight(1f), color = Color.LightGray)
            Text(
                text = stringResource(R.string.or_divider),
                modifier = Modifier.padding(horizontal = 16.dp),
                color = Color.Gray,
                style = MaterialTheme.typography.bodyMedium
            )
            HorizontalDivider(modifier = Modifier.weight(1f), color = Color.LightGray)
        }

        Spacer(modifier = Modifier.height(24.dp))

        OutlinedButton(
            onClick = onGoogleSignIn,
            modifier = Modifier.fillMaxWidth().height(56.dp),
            shape = RoundedCornerShape(16.dp),
            border = BorderStroke(1.dp, Color.LightGray),
            enabled = !isLoading
        ) {
            Icon(
                painter = painterResource(id = R.drawable.ic_home), // Placeholder if ic_google is missing
                contentDescription = null,
                modifier = Modifier.size(24.dp),
                tint = Color.Unspecified
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = stringResource(R.string.continue_with_google),
                color = Color.DarkGray,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

@Composable
fun OtpInputSection(
    phoneNumber: String,
    otp: String,
    isLoading: Boolean,
    resendTimer: Int,
    isResendEnabled: Boolean,
    onOtpChange: (String) -> Unit,
    onVerifyOtp: () -> Unit,
    onChangeNumber: () -> Unit,
    onResendOtp: () -> Unit
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = "Verification Code",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )
        
        Text(
            text = "Sent to +91 $phoneNumber",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.Gray,
            modifier = Modifier.padding(top = 8.dp)
        )
        
        Spacer(modifier = Modifier.height(32.dp))
        
        OutlinedTextField(
            value = otp,
            onValueChange = onOtpChange,
            label = { Text("6-Digit OTP") },
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            shape = RoundedCornerShape(16.dp),
            textStyle = TextStyle(textAlign = TextAlign.Center),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PrimaryGreen,
                focusedLabelColor = PrimaryGreen
            )
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Button(
            onClick = onVerifyOtp,
            modifier = Modifier.fillMaxWidth().height(56.dp),
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
            enabled = otp.length == 6 && !isLoading
        ) {
            if (isLoading) {
                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
            } else {
                Text("Verify & Continue", fontSize = 18.sp, fontWeight = FontWeight.Bold)
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(onClick = onChangeNumber) {
                Text("Change Number", color = PrimaryGreen)
            }
            
            if (isResendEnabled) {
                TextButton(onClick = onResendOtp) {
                    Text("Resend OTP", color = PrimaryGreen, fontWeight = FontWeight.Bold)
                }
            } else {
                Text(
                    text = "Resend in ${resendTimer}s",
                    color = Color.Gray,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(end = 12.dp)
                )
            }
        }
    }
}
