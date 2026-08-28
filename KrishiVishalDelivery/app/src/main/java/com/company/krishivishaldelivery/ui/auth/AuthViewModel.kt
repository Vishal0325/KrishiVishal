package com.company.krishivishaldelivery.ui.auth

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.FirebaseException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.security.SecureRandom
import java.util.concurrent.TimeUnit
import javax.inject.Inject

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore
) : ViewModel() {

    companion object {
        private const val TAG = "DeliveryAuthVM"
        private const val RESEND_TIMER_SECONDS = 120
        private const val OTP_TIMEOUT_SECONDS = 60L
        private val secureRandom = SecureRandom()

        fun normalizePhoneNumber(phone: String): String {
            val digits = phone.replace(Regex("\\D"), "")
            val clean10 = if (digits.startsWith("91") && digits.length > 10) digits.substring(2) else digits
            return if (clean10.length == 10) "+91$clean10" else phone.trim()
        }

        fun maskPhone(phone: String): String {
            val digits = phone.replace(Regex("\\D"), "")
            return if (digits.length >= 10) {
                "+91******" + digits.takeLast(4)
            } else "****"
        }
    }

    private val _isLoading = MutableStateFlow(false)
    val isLoading = _isLoading.asStateFlow()

    private val _uiEvent = MutableSharedFlow<AuthUiEvent>()
    val uiEvent = _uiEvent.asSharedFlow()

    private var verificationId: String? = null
    private var resendToken: PhoneAuthProvider.ForceResendingToken? = null

    private val _resendTimer = MutableStateFlow(0)
    val resendTimer = _resendTimer.asStateFlow()

    private fun startResendTimer() {
        viewModelScope.launch {
            _resendTimer.value = RESEND_TIMER_SECONDS
            while (_resendTimer.value > 0) {
                delay(1000)
                _resendTimer.value -= 1
            }
        }
    }

    /**
     * D3 & D4: Phone validation and normalization
     */
    fun sendOtp(phoneNumber: String, activity: Activity, isResend: Boolean = false) {
        if (isResend && _resendTimer.value > 0) return

        val normalizedPhone = normalizePhoneNumber(phoneNumber)
        val clean10 = normalizedPhone.replace("+91", "").trim()
        if (clean10.length != 10 || !clean10.all { it.isDigit() } || clean10.first() !in '6'..'9') {
            viewModelScope.launch {
                _uiEvent.emit(AuthUiEvent.ShowSnackbar("Kripya sahi 10-digit mobile number enter karein."))
            }
            return
        }

        _isLoading.value = true
        android.util.Log.d(TAG, "Initiating OTP send to ${maskPhone(normalizedPhone)}")

        val optionsBuilder = PhoneAuthOptions.newBuilder(auth)
            .setPhoneNumber(normalizedPhone)
            .setTimeout(OTP_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .setActivity(activity)
            .setCallbacks(object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
                override fun onVerificationCompleted(credential: PhoneAuthCredential) {
                    android.util.Log.d(TAG, "Instant verification completed")
                    signInWithCredential(credential)
                }

                override fun onVerificationFailed(e: FirebaseException) {
                    _isLoading.value = false
                    android.util.Log.e(TAG, "Phone verification failed: ${e.message}", e)
                    viewModelScope.launch {
                        _uiEvent.emit(AuthUiEvent.ShowSnackbar(e.localizedMessage ?: "OTP bhejne me samasya aayi. Kripya punah prayas karein."))
                    }
                }

                override fun onCodeSent(id: String, token: PhoneAuthProvider.ForceResendingToken) {
                    _isLoading.value = false
                    verificationId = id
                    resendToken = token
                    startResendTimer()
                    android.util.Log.d(TAG, "OTP code successfully sent")
                    viewModelScope.launch {
                        _uiEvent.emit(AuthUiEvent.OtpSent)
                    }
                }
            })

        if (isResend) {
            resendToken?.let { optionsBuilder.setForceResendingToken(it) }
        }
        PhoneAuthProvider.verifyPhoneNumber(optionsBuilder.build())
    }

    /**
     * D3: Validate OTP format (6 digits, numeric) before sending to Firebase
     */
    fun verifyOtp(otp: String) {
        val trimmedOtp = otp.trim()
        if (trimmedOtp.length != 6 || !trimmedOtp.all { it.isDigit() }) {
            viewModelScope.launch {
                _uiEvent.emit(AuthUiEvent.ShowSnackbar("OTP 6 anko ka hona chahiye."))
            }
            return
        }

        val id = verificationId
        if (id == null) {
            viewModelScope.launch {
                _uiEvent.emit(AuthUiEvent.ShowSnackbar("Verification session expire ho gaya. Kripya OTP punah mangwayen."))
            }
            return
        }

        val credential = PhoneAuthProvider.getCredential(id, trimmedOtp)
        signInWithCredential(credential)
    }

    private fun signInWithCredential(credential: PhoneAuthCredential) {
        _isLoading.value = true
        auth.signInWithCredential(credential)
            .addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    val firebaseUser = task.result?.user
                    if (firebaseUser != null) {
                        val handler = kotlinx.coroutines.CoroutineExceptionHandler { _, exception ->
                            android.util.Log.e(TAG, "Auth Coroutine Exception", exception)
                            auth.signOut()
                            _isLoading.value = false
                            viewModelScope.launch {
                                _uiEvent.emit(AuthUiEvent.ShowSnackbar("Authorization error: ${exception.localizedMessage ?: "Unknown error"}"))
                            }
                        }
                        viewModelScope.launch(handler) {
                            try {
                                val rawPhone = firebaseUser.phoneNumber ?: ""
                                val normalizedPhone = normalizePhoneNumber(rawPhone)
                                val plainPhone = normalizedPhone.replace("+91", "").trim()

                                // D1: Optimized parallel queries using async
                                val (whitelistedDoc, userDoc, riderDoc) = coroutineScope {
                                    val wDocDeferred = async {
                                        var doc = try { firestore.collection("whitelisted_riders").document(normalizedPhone).get().await() } catch (e: Exception) { null }
                                        if (doc == null || !doc.exists()) {
                                            if (plainPhone.isNotEmpty()) {
                                                doc = try { firestore.collection("whitelisted_riders").document(plainPhone).get().await() } catch (e: Exception) { null }
                                            }
                                        }
                                        doc
                                    }
                                    val uDocDeferred = async {
                                        try { firestore.collection("users").document(firebaseUser.uid).get().await() } catch (e: Exception) { null }
                                    }
                                    val rDocDeferred = async {
                                        try { firestore.collection("riders").document(firebaseUser.uid).get().await() } catch (e: Exception) { null }
                                    }
                                    Triple(wDocDeferred.await(), uDocDeferred.await(), rDocDeferred.await())
                                }

                                val isWhitelisted = whitelistedDoc != null && (whitelistedDoc.exists() || whitelistedDoc.data != null)
                                val hasUserRiderRole = userDoc?.exists() == true && (
                                    userDoc.getString("role").equals("Rider", ignoreCase = true) ||
                                    userDoc.getBoolean("isAdmin") == true ||
                                    userDoc.getBoolean("whitelisted") == true
                                )
                                val hasRiderProfile = riderDoc != null && (riderDoc.exists() || riderDoc.data != null)

                                val isAuthorized = isWhitelisted || hasUserRiderRole || hasRiderProfile

                                if (!isAuthorized) {
                                    android.util.Log.w(TAG, "Unauthorized rider login attempt: ${maskPhone(normalizedPhone)}")
                                    auth.signOut()
                                    _isLoading.value = false
                                    _uiEvent.emit(AuthUiEvent.ShowSnackbar("Aapka number approved Delivery Rider nahi hai. Kripya Admin se permission lein."))
                                    return@launch
                                }

                                // D8: Cryptographically strong random for Rider ID
                                val existingDisplayId = riderDoc?.getString("riderIdDisplay")
                                    ?: userDoc?.getString("riderIdDisplay")
                                val existingSerialId = riderDoc?.getString("riderSerialId")
                                    ?: userDoc?.getString("riderSerialId")

                                val (serialId, displayId) = if (!existingDisplayId.isNullOrEmpty() && !existingSerialId.isNullOrEmpty()) {
                                    Pair(existingSerialId, existingDisplayId)
                                } else {
                                    val randomNum = (10000 + secureRandom.nextInt(90000)).toString()
                                    Pair(randomNum, "KV-$randomNum")
                                }

                                val riderName = whitelistedDoc?.getString("name")
                                    ?: riderDoc?.getString("name")
                                    ?: userDoc?.getString("name")
                                    ?: firebaseUser.displayName
                                    ?: "Delivery Rider"

                                // D5: Atomic Batch Write for all collections
                                val batch = firestore.batch()

                                // 1. Set riders collection
                                val riderRef = firestore.collection("riders").document(firebaseUser.uid)
                                val riderData = mapOf(
                                    "id" to firebaseUser.uid,
                                    "phone" to normalizedPhone,
                                    "name" to riderName,
                                    "role" to "Rider",
                                    "riderSerialId" to serialId,
                                    "riderIdDisplay" to displayId,
                                    "status" to "ACTIVE",
                                    "online" to true,
                                    "updatedAt" to FieldValue.serverTimestamp()
                                )
                                batch.set(riderRef, riderData, SetOptions.merge())

                                // 2. Set users collection
                                val userRef = firestore.collection("users").document(firebaseUser.uid)
                                val userData = mapOf(
                                    "id" to firebaseUser.uid,
                                    "phone" to normalizedPhone,
                                    "name" to riderName,
                                    "role" to "Rider",
                                    "riderSerialId" to serialId,
                                    "riderIdDisplay" to displayId,
                                    "updatedAt" to FieldValue.serverTimestamp()
                                )
                                batch.set(userRef, userData, SetOptions.merge())

                                // 3. Set whitelisted_riders collection
                                val whitelistUpdate = mapOf(
                                    "status" to "REGISTERED",
                                    "uid" to firebaseUser.uid,
                                    "riderIdDisplay" to displayId,
                                    "registeredAt" to FieldValue.serverTimestamp()
                                )
                                if (normalizedPhone.isNotEmpty()) {
                                    val wRef1 = firestore.collection("whitelisted_riders").document(normalizedPhone)
                                    batch.set(wRef1, whitelistUpdate, SetOptions.merge())
                                }

                                batch.commit().await()

                                android.util.Log.i(TAG, "Rider login authorized and committed atomically: $displayId")
                                _isLoading.value = false
                                _uiEvent.emit(AuthUiEvent.LoginSuccess)
                            } catch (e: Exception) {
                                android.util.Log.e(TAG, "Rider authorization failed", e)
                                auth.signOut()
                                _isLoading.value = false
                                _uiEvent.emit(AuthUiEvent.ShowSnackbar(e.localizedMessage ?: "Rider authorization failed. Kripya admin se sampark karein."))
                            }
                        }
                    } else {
                        _isLoading.value = false
                        viewModelScope.launch { _uiEvent.emit(AuthUiEvent.ShowSnackbar("User profile create nahi ho saki.")) }
                    }
                } else {
                    _isLoading.value = false
                    val errorMsg = task.exception?.localizedMessage ?: "Login failed"
                    android.util.Log.e(TAG, "Firebase signInWithCredential failed: $errorMsg", task.exception)
                    viewModelScope.launch {
                        _uiEvent.emit(AuthUiEvent.ShowSnackbar(errorMsg))
                    }
                }
            }
    }

    fun isUserLoggedIn(): Boolean = auth.currentUser != null
}

sealed class AuthUiEvent {
    object OtpSent : AuthUiEvent()
    object LoginSuccess : AuthUiEvent()
    data class ShowSnackbar(val message: String) : AuthUiEvent()
}
