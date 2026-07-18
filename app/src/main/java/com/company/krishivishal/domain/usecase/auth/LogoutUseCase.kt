package com.company.krishivishal.domain.usecase.auth

import com.company.krishivishal.data.repository.AuthRepository
import javax.inject.Inject

/**
 * UseCase to sign out the current user.
 */
class LogoutUseCase @Inject constructor(
    private val repository: AuthRepository
) {
    suspend operator fun invoke() {
        repository.logout()
    }
}
