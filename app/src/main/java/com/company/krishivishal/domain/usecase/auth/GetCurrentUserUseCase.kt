package com.company.krishivishal.domain.usecase.auth

import com.company.krishivishal.core.model.User
import com.company.krishivishal.data.repository.AuthRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase to get the currently authenticated user session.
 */
class GetCurrentUserUseCase @Inject constructor(
    private val repository: AuthRepository
) {
    operator fun invoke(): Flow<User?> {
        return repository.getCurrentUser()
    }
}
