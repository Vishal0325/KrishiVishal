package com.company.krishivishal.domain.usecase.auth

import com.company.krishivishal.data.model.User
import com.company.krishivishal.data.repository.AuthRepository
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase to register a new user with email and password.
 */
class RegisterUseCase @Inject constructor(
    private val repository: AuthRepository
) {
    operator fun invoke(name: String, email: String, password: String): Flow<Resource<User>> {
        return repository.register(name, email, password)
    }
}
