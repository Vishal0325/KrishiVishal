package com.company.krishivishal.domain.usecase.auth

import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.data.repository.AuthRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase to delete the current user's account and all associated data.
 */
class DeleteAccountUseCase @Inject constructor(
    private val repository: AuthRepository
) {
    operator fun invoke(): Flow<Resource<Unit>> {
        return repository.deleteAccount()
    }
}
