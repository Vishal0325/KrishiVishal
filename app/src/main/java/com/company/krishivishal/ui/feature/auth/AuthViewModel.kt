package com.company.krishivishal.ui.feature.auth

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.R
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.data.repository.CartRepository
import com.company.krishivishal.data.repository.ReferralRepository
import com.company.krishivishal.domain.usecase.auth.LoginWithEmailUseCase
import com.company.krishivishal.domain.usecase.auth.MergeWishlistUseCase
import com.company.krishivishal.domain.usecase.auth.RegisterUseCase
import com.company.krishivishal.domain.usecase.auth.SendOtpUseCase
import com.company.krishivishal.domain.usecase.auth.SignInWithCredentialUseCase
import com.company.krishivishal.domain.usecase.auth.VerifyOtpUseCase
import com.google.firebase.FirebaseException
import com.google.firebase.auth.AuthCredential
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthProvider
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val sendOtpUseCase: SendOtpUseCase,
    private val verifyOtpUseCase: VerifyOtpUseCase,
    private val signInWithCredentialUseCase: SignInWithCredentialUseCase,
    private val loginWithEmailUseCase: LoginWithEmailUseCase,
    private val registerUseCase: RegisterUseCase,
    private val mergeWishlistUseCase: MergeWishlistUseCase,
    private val cartRepository: CartRepository
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

    fun onOtpChange(newValue: String) {
        if (newValue.length <= 6) {
            _uiState.update { it.copy(otp = newValue, error = null) }
        }
    }

    fun onOtpReceived(otp: String) {
        _uiState.update { it.copy(otp = otp, error = null) }
        verifyOtp()
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
                android.util.Log.e("AuthViewModel", "SMS Verification Failed: ${e.message}")
                
                viewModelScope.launch {
                    val message = when {
                        e.message?.contains("App Check", true) == true -> "Security check failed. Please try on a real device."
                        e.message?.contains("quota", true) == true -> "SMS quota exceeded. Please try again tomorrow."
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
        if (_uiState.value.isLoading) return // Prevent multiple calls

        val otp = _uiState.value.otp
        if (otp.length < 6) {
            viewModelScope.launch {
                _uiEvent.emit(AuthUiEvent.ShowSnackbar("Kripya 6-digit ka OTP dalein."))
            }
            return
        }

        if (verificationId.isEmpty()) {
            android.util.Log.e("AuthViewModel", "verificationId is empty during verifyOtp")
            viewModelScope.launch {
                _uiEvent.emit(AuthUiEvent.ShowSnackbar("OTP session expired. Please resend OTP."))
            }
            return
        }
        
        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                verifyOtpUseCase(verificationId, otp).collectLatest { resource ->
                    handleAuthResource(resource)
                }
            } catch (e: Exception) {
                android.util.Log.e("AuthViewModel", "Unexpected error in verifyOtp: ${e.message}")
                _uiState.update { it.copy(isLoading = false, error = e.localizedMessage) }
                _uiEvent.emit(AuthUiEvent.ShowSnackbar(e.localizedMessage ?: "Verification Failed"))
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
                _uiState.update { it.copy(isLoading = false) }
                _uiEvent.emit(AuthUiEvent.LoginSuccess)
                
                if (user != null) {
                    // Start sync in background independently
                    viewModelScope.launch {
                        try {
                            mergeWishlistUseCase(user.id).collectLatest { }
                            
                            val cartResource = cartRepository.getCart("guest_user").first()
                            if (cartResource is Resource.Success) {
                                cartResource.data?.forEach { item ->
                                    launch {
                                        cartRepository.addToCart(item.copy(
                                            id = java.util.UUID.randomUUID().toString(), 
                                            userId = user.id
                                        )).collect()
                                    }
                                }
                                cartRepository.clearCart("guest_user").collect()
                            }
                        } catch (e: Exception) {
                            android.util.Log.e("AuthViewModel", "Sync failed: ${e.message}")
                        }
                    }
                }
            }
            is Resource.Error -> {
                android.util.Log.e(
                    "AuthViewModel",
                    "Auth resource failed inside handleAuthResource: ${resource.message}"
                )
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
