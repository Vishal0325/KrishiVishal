package com.company.krishivishal.domain.usecase.auth

import com.company.krishivishal.data.repository.AuthRepository
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase to merge the guest wishlist to the user's account after a successful login.
 */
class MergeWishlistUseCase @Inject constructor(
    private val repository: AuthRepository
) {
    operator fun invoke(userId: String): Flow<Resource<Unit>> {
        return repository.mergeGuestWishlistToFirestore(userId)
    }
}
