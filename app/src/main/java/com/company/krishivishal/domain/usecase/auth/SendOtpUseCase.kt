package com.company.krishivishal.domain.usecase.auth

import android.app.Activity
import com.company.krishivishal.data.repository.AuthRepository
import com.google.firebase.auth.PhoneAuthProvider
import javax.inject.Inject

/**
 * UseCase to initiate phone number verification by sending an OTP.
 */
class SendOtpUseCase @Inject constructor(
    private val repository: AuthRepository
) {
    operator fun invoke(
        phoneNumber: String,
        activity: Activity,
        callbacks: PhoneAuthProvider.OnVerificationStateChangedCallbacks
    ) {
        repository.startPhoneVerification(phoneNumber, activity, callbacks)
    }
}
