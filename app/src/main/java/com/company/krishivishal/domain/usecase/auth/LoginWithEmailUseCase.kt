package com.company.krishivishal.domain.usecase.auth

import com.company.krishivishal.core.model.User
import com.company.krishivishal.data.repository.AuthRepository
import com.company.krishivishal.core.util.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase for email/password authentication.
 */
class LoginWithEmailUseCase @Inject constructor(
    private val repository: AuthRepository
) {
    operator fun invoke(email: String, password: String): Flow<Resource<User>> {
        return repository.login(email, password)
    }
}
