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
import kotlinx.coroutines.tasks.await
import java.util.concurrent.TimeUnit
import javax.inject.Inject

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val auth: FirebaseAuth,
    private val firestore: com.google.firebase.firestore.FirebaseFirestore
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
                if (task.isSuccessful) {
                    val firebaseUser = task.result?.user
                    if (firebaseUser != null) {
                        // V4: Ensure user document exists to trigger auto-promotion
                        viewModelScope.launch {
                            try {
                                val userDoc = firestore.collection("users").document(firebaseUser.uid).get().await()
                                if (!userDoc.exists()) {
                                    val userData = mapOf(
                                        "id" to firebaseUser.uid,
                                        "phone" to firebaseUser.phoneNumber,
                                        "name" to (firebaseUser.displayName ?: "New Rider"),
                                        "createdAt" to com.google.firebase.firestore.FieldValue.serverTimestamp()
                                    )
                                    firestore.collection("users").document(firebaseUser.uid).set(userData).await()
                                }
                                _isLoading.value = false
                                _uiEvent.emit(AuthUiEvent.LoginSuccess)
                            } catch (e: Exception) {
                                android.util.Log.e("AuthViewModel", "User sync failed", e)
                                _isLoading.value = false
                                _uiEvent.emit(AuthUiEvent.LoginSuccess) // Proceed anyway
                            }
                        }
                    } else {
                        _isLoading.value = false
                        viewModelScope.launch { _uiEvent.emit(AuthUiEvent.LoginSuccess) }
                    }
                } else {
                    _isLoading.value = false
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
