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
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import kotlin.random.Random

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore
) : ViewModel() {

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
            _resendTimer.value = 120
            while (_resendTimer.value > 0) {
                delay(1000)
                _resendTimer.value -= 1
            }
        }
    }

    fun sendOtp(phoneNumber: String, activity: Activity, isResend: Boolean = false) {
        if (isResend && _resendTimer.value > 0) return
        _isLoading.value = true
        val optionsBuilder = PhoneAuthOptions.newBuilder(auth)
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
                    resendToken = token
                    startResendTimer()
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
                        val handler = kotlinx.coroutines.CoroutineExceptionHandler { _, exception ->
                            android.util.Log.e("AuthViewModel", "Fatal Auth Exception", exception)
                            auth.signOut()
                            _isLoading.value = false
                            viewModelScope.launch {
                                _uiEvent.emit(AuthUiEvent.ShowSnackbar("Authorization failed: ${exception.message}"))
                            }
                        }
                        viewModelScope.launch(handler) {
                            try {
                                val rawPhone = firebaseUser.phoneNumber ?: ""
                                val plainPhone = rawPhone.replace("+91", "").trim()

                                // 1. Check whitelisted_riders by document ID and by query
                                var whitelistedDoc = if (rawPhone.isNotEmpty()) {
                                    try { firestore.collection("whitelisted_riders").document(rawPhone).get().await() } catch (e: Exception) { null }
                                } else null

                                if (whitelistedDoc == null || !whitelistedDoc.exists()) {
                                    if (plainPhone.isNotEmpty()) {
                                        whitelistedDoc = try { firestore.collection("whitelisted_riders").document(plainPhone).get().await() } catch (e: Exception) { null }
                                    }
                                }

                                if (whitelistedDoc == null || !whitelistedDoc.exists()) {
                                    whitelistedDoc = try {
                                        val q = firestore.collection("whitelisted_riders").whereEqualTo("phone", rawPhone).get().await()
                                        if (!q.isEmpty) q.documents.firstOrNull() else {
                                            val q2 = firestore.collection("whitelisted_riders").whereEqualTo("phone", plainPhone).get().await()
                                            q2.documents.firstOrNull()
                                        }
                                    } catch (e: Exception) { null }
                                }

                                // 2. Check users collection
                                val userDoc = try { firestore.collection("users").document(firebaseUser.uid).get().await() } catch (e: Exception) { null }

                                // 3. Check riders collection by UID and by phone
                                var riderDoc = try { firestore.collection("riders").document(firebaseUser.uid).get().await() } catch (e: Exception) { null }
                                if (riderDoc == null || !riderDoc.exists()) {
                                    riderDoc = try {
                                        val q = firestore.collection("riders").whereEqualTo("phone", rawPhone).get().await()
                                        if (!q.isEmpty) q.documents.firstOrNull() else {
                                            val q2 = firestore.collection("riders").whereEqualTo("phone", plainPhone).get().await()
                                            q2.documents.firstOrNull()
                                        }
                                    } catch (e: Exception) { null }
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
                                    // REJECT LOGIN: Sign out unauthorized user
                                    auth.signOut()
                                    _isLoading.value = false
                                    _uiEvent.emit(AuthUiEvent.ShowSnackbar("Aapka number approved Delivery Rider nahi hai. Kripya Admin se permission lein."))
                                    return@launch
                                }

                                // Wait for a short moment to ensure Firebase Auth state is recognized by Firestore
                                delay(300)

                                // 4. Determine or Generate Rider ID
                                val existingDisplayId = riderDoc?.getString("riderIdDisplay")
                                    ?: userDoc?.getString("riderIdDisplay")
                                val existingSerialId = riderDoc?.getString("riderSerialId")
                                    ?: userDoc?.getString("riderSerialId")

                                val (serialId, displayId) = if (!existingDisplayId.isNullOrEmpty() && !existingSerialId.isNullOrEmpty()) {
                                    Pair(existingSerialId, existingDisplayId)
                                } else {
                                    val randomNum = Random.nextInt(10000, 99999).toString()
                                    Pair(randomNum, "KV-$randomNum")
                                }

                                val riderName = whitelistedDoc?.getString("name")
                                    ?: riderDoc?.getString("name")
                                    ?: userDoc?.getString("name")
                                    ?: firebaseUser.displayName
                                    ?: "Delivery Rider"

                                // 5. Save/Update in 'riders' collection (Admin and Delivery app view)
                                val riderData = mutableMapOf<String, Any>(
                                    "id" to firebaseUser.uid,
                                    "phone" to rawPhone,
                                    "name" to riderName,
                                    "riderSerialId" to serialId,
                                    "riderIdDisplay" to displayId,
                                    "status" to "ACTIVE",
                                    "online" to true,
                                    "updatedAt" to FieldValue.serverTimestamp()
                                )
                                firestore.collection("riders").document(firebaseUser.uid)
                                    .set(riderData, SetOptions.merge()).await()

                                // 6. Save/Update in 'users' collection
                                val userData = mutableMapOf<String, Any>(
                                    "id" to firebaseUser.uid,
                                    "phone" to rawPhone,
                                    "name" to riderName,
                                    "role" to "Rider",
                                    "riderSerialId" to serialId,
                                    "riderIdDisplay" to displayId,
                                    "updatedAt" to FieldValue.serverTimestamp()
                                )
                                firestore.collection("users").document(firebaseUser.uid)
                                    .set(userData, SetOptions.merge()).await()

                                // 7. Update whitelisted_riders document to REGISTERED if it exists
                                val whitelistUpdate = mapOf(
                                    "status" to "REGISTERED",
                                    "uid" to firebaseUser.uid,
                                    "riderIdDisplay" to displayId,
                                    "registeredAt" to FieldValue.serverTimestamp()
                                )
                                if (rawPhone.isNotEmpty()) {
                                    try { firestore.collection("whitelisted_riders").document(rawPhone).set(whitelistUpdate, SetOptions.merge()) } catch (e: Exception) {}
                                }
                                if (plainPhone.isNotEmpty()) {
                                    try { firestore.collection("whitelisted_riders").document(plainPhone).set(whitelistUpdate, SetOptions.merge()) } catch (e: Exception) {}
                                }

                                _isLoading.value = false
                                _uiEvent.emit(AuthUiEvent.LoginSuccess)
                            } catch (e: Exception) {
                                android.util.Log.e("AuthViewModel", "Rider authorization failed", e)
                                auth.signOut()
                                _isLoading.value = false
                                _uiEvent.emit(AuthUiEvent.ShowSnackbar(e.message ?: "Rider authorization failed. Please contact admin."))
                            }
                        }
                    } else {
                        _isLoading.value = false
                        viewModelScope.launch { _uiEvent.emit(AuthUiEvent.ShowSnackbar("User profile not found.")) }
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
