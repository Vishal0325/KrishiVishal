package com.company.krishivishaldelivery.ui.auth

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.FirebaseException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit
import javax.inject.Inject

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val auth: FirebaseAuth
) : ViewModel() {

    private val _isLoading = MutableStateFlow(false)
    val isLoading = _isLoading.asStateFlow()

    private val _uiEvent = MutableSharedFlow<AuthUiEvent>()
    val uiEvent = _uiEvent.asSharedFlow()

    private var verificationId: String? = null

    fun sendOtp(phoneNumber: String, activity: Activity) {
        _isLoading.value = true
        val options = PhoneAuthOptions.newBuilder(auth)
            .setPhoneNumber(phoneNumber)
            .setTimeout(60L, TimeUnit.SECONDS)
            .setActivity(activity)
            .setCallbacks(object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
                override fun onVerificationCompleted(credential: PhoneAuthCredential) {
                    signInWithCredential(credential)
                }

                override fun onVerificationFailed(e: FirebaseException) {
                    _isLoading.value = false
                    viewModelScope.launch {
                        _uiEvent.emit(AuthUiEvent.ShowSnackbar(e.message ?: "Verification failed"))
                    }
                }

                override fun onCodeSent(id: String, token: PhoneAuthProvider.ForceResendingToken) {
                    _isLoading.value = false
                    verificationId = id
                    viewModelScope.launch {
                        _uiEvent.emit(AuthUiEvent.OtpSent)
                    }
                }
            })
            .build()
        PhoneAuthProvider.verifyPhoneNumber(options)
    }

    fun verifyOtp(otp: String) {
        val id = verificationId ?: return
        val credential = PhoneAuthProvider.getCredential(id, otp)
        signInWithCredential(credential)
    }

    private fun signInWithCredential(credential: PhoneAuthCredential) {
        _isLoading.value = true
        auth.signInWithCredential(credential)
            .addOnCompleteListener { task ->
                _isLoading.value = false
                if (task.isSuccessful) {
                    viewModelScope.launch {
                        _uiEvent.emit(AuthUiEvent.LoginSuccess)
                    }
                } else {
                    viewModelScope.launch {
                        _uiEvent.emit(AuthUiEvent.ShowSnackbar(task.exception?.message ?: "Login failed"))
                    }
                }
            }
    }
    
    fun isUserLoggedIn() = auth.currentUser != null
}

sealed class AuthUiEvent {
    object OtpSent : AuthUiEvent()
    object LoginSuccess : AuthUiEvent()
    data class ShowSnackbar(val message: String) : AuthUiEvent()
}
