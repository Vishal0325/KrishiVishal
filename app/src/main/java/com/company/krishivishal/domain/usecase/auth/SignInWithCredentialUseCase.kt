package com.company.krishivishal.domain.usecase.auth

import com.company.krishivishal.data.model.User
import com.company.krishivishal.data.repository.AuthRepository
import com.company.krishivishal.utils.Resource
import com.google.firebase.auth.AuthCredential
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase to sign in using a Firebase AuthCredential (used for Phone or Google).
 */
class SignInWithCredentialUseCase @Inject constructor(
    private val repository: AuthRepository
) {
    operator fun invoke(credential: AuthCredential): Flow<Resource<User>> {
        return repository.signInWithCredential(credential)
    }
}
