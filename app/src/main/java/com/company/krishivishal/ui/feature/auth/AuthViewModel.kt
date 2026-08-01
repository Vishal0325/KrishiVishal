package com.company.krishivishal.ui.feature.auth

import android.app.Activity
import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.R
import com.company.krishivishal.domain.usecase.auth.*
import com.company.krishivishal.core.util.Resource
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.FirebaseException
import com.google.firebase.auth.AuthCredential
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthProvider
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

import com.company.krishivishal.data.repository.ReferralRepository

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val sendOtpUseCase: SendOtpUseCase,
    private val verifyOtpUseCase: VerifyOtpUseCase,
    private val signInWithCredentialUseCase: SignInWithCredentialUseCase,
    private val loginWithEmailUseCase: LoginWithEmailUseCase,
    private val registerUseCase: RegisterUseCase,
    private val mergeWishlistUseCase: MergeWishlistUseCase,
    private val referralRepository: ReferralRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    private val _uiEvent = MutableSharedFlow<AuthUiEvent>()
    val uiEvent: SharedFlow<AuthUiEvent> = _uiEvent.asSharedFlow()

    private var timerJob: Job? = null
    private var verificationId: String = ""
    private var forceResendingToken: PhoneAuthProvider.ForceResendingToken? = null

    fun onPhoneNumberChange(newValue: String) {
        if (newValue.length <= 10) {
            _uiState.update { it.copy(phoneNumber = newValue, error = null) }
        }
    }

    fun onReferralCodeChange(newValue: String) {
        _uiState.update { it.copy(referralCode = newValue) }
    }

    fun onOtpChange(newValue: String) {
        if (newValue.length <= 6) {
            _uiState.update { it.copy(otp = newValue, error = null) }
        }
    }

    fun sendOtp(phoneNumber: String, activity: Activity) {
        _uiState.update { it.copy(isLoading = true, error = null) }
        
        val callbacks = object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
            override fun onVerificationCompleted(credential: PhoneAuthCredential) {
                _uiState.update { it.copy(isLoading = false) }
                signInWithFirebaseCredential(credential)
            }

            override fun onVerificationFailed(e: FirebaseException) {
                _uiState.update { it.copy(isLoading = false, error = e.localizedMessage) }
                viewModelScope.launch {
                    val message = when (e.message) {
                        "This app is not authorized to use Firebase Authentication. Please verify that the correct package name and SHA-1 are configured in the Firebase Console." -> "App not authorized. Check SHA-1 configuration."
                        else -> e.message ?: "Verification Failed"
                    }
                    _uiEvent.emit(AuthUiEvent.ShowSnackbar(message))
                }
            }

            override fun onCodeSent(
                vId: String,
                token: PhoneAuthProvider.ForceResendingToken
            ) {
                verificationId = vId
                forceResendingToken = token
                _uiState.update { it.copy(isLoading = false, isOtpSent = true) }
                startResendTimer()
                viewModelScope.launch {
                    _uiEvent.emit(AuthUiEvent.OtpSent)
                }
            }
        }
        
        sendOtpUseCase(phoneNumber, activity, callbacks)
    }

    fun verifyOtp() {
        val otp = _uiState.value.otp
        if (verificationId.isEmpty()) {
            viewModelScope.launch {
                _uiEvent.emit(AuthUiEvent.ShowSnackbar("OTP session expired. Please resend OTP."))
            }
            return
        }
        
        _uiState.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            verifyOtpUseCase(verificationId, otp).collectLatest { resource ->
                handleAuthResource(resource)
            }
        }
    }

    fun signInWithGoogle(context: Context) {
        val credentialManager = CredentialManager.create(context)
        
        // IMPORTANT: You must replace this with your actual Web Client ID from Firebase Console
        // It usually looks like "409780110248-xxxxxxxx.apps.googleusercontent.com"
        val webClientId = "409780110248-v8h6g2m6p4u3l1p2v5e7v9r6q4k7k6b5.apps.googleusercontent.com" // Placeholder/Example

        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(webClientId)
            .setAutoSelectEnabled(true)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()

        _uiState.update { it.copy(isLoading = true) }

        viewModelScope.launch {
            try {
                val result = credentialManager.getCredential(
                    context = context,
                    request = request
                )
                
                val credential = result.credential
                if (credential is GoogleIdTokenCredential) {
                    val firebaseCredential = GoogleAuthProvider.getCredential(credential.idToken, null)
                    signInWithFirebaseCredential(firebaseCredential)
                } else {
                    _uiState.update { it.copy(isLoading = false) }
                    _uiEvent.emit(AuthUiEvent.ShowSnackbar("Unexpected credential type"))
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false) }
                _uiEvent.emit(AuthUiEvent.ShowSnackbar("Google Sign-In failed: ${e.localizedMessage}"))
            }
        }
    }

    fun login(email: String, password: String) {
        _uiState.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            loginWithEmailUseCase(email, password).collectLatest { resource ->
                handleAuthResource(resource)
            }
        }
    }

    private suspend fun handleAuthResource(resource: Resource<com.company.krishivishal.core.model.User>) {
        when (resource) {
            is Resource.Success -> {
                val user = resource.data
                if (user != null) {
                    // Process referral if code provided and user is new (name empty initially)
                    val refCode = _uiState.value.referralCode
                    if (refCode.isNotBlank() && user.name.isEmpty()) {
                        referralRepository.processReferral(user.id, refCode).collectLatest { }
                    }

                    mergeWishlistUseCase(user.id).collect {
                        _uiState.update { it.copy(isLoading = false) }
                        _uiEvent.emit(AuthUiEvent.LoginSuccess)
                    }
                } else {
                    _uiState.update { it.copy(isLoading = false) }
                    _uiEvent.emit(AuthUiEvent.LoginSuccess)
                }
            }
            is Resource.Error -> {
                _uiState.update { it.copy(isLoading = false, error = resource.message) }
                _uiEvent.emit(AuthUiEvent.ShowSnackbar(resource.message ?: "Action Failed"))
            }
            else -> {}
        }
    }

    private fun signInWithFirebaseCredential(credential: AuthCredential) {
        _uiState.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            signInWithCredentialUseCase(credential).collectLatest { resource ->
                handleAuthResource(resource)
            }
        }
    }

    private fun startResendTimer() {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            _uiState.update { it.copy(resendTimer = 60, isResendEnabled = false) }
            while (_uiState.value.resendTimer > 0) {
                delay(1000)
                _uiState.update { it.copy(resendTimer = it.resendTimer - 1) }
            }
            _uiState.update { it.copy(isResendEnabled = true) }
        }
    }

    override fun onCleared() {
        super.onCleared()
        timerJob?.cancel()
    }
}
