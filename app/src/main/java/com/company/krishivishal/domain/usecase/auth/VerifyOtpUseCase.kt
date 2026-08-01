package com.company.krishivishal.domain.usecase.auth

import com.company.krishivishal.core.model.User
import com.company.krishivishal.data.repository.AuthRepository
import com.company.krishivishal.core.util.Resource
import com.google.firebase.auth.PhoneAuthProvider
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase to verify the OTP received and sign in the user.
 */
class VerifyOtpUseCase @Inject constructor(
    private val repository: AuthRepository
) {
    operator fun invoke(verificationId: String, otp: String): Flow<Resource<User>> {
        val credential = PhoneAuthProvider.getCredential(verificationId, otp)
        return repository.signInWithCredential(credential)
    }
}
