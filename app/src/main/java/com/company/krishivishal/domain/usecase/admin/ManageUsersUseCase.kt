package com.company.krishivishal.domain.usecase.admin

import com.company.krishivishal.data.model.User
import com.company.krishivishal.data.repository.AdminRepository
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class ManageUsersUseCase @Inject constructor(
    private val repository: AdminRepository
) {
    fun getUsers(role: String? = null): Flow<Resource<List<User>>> = repository.getUsers(role)
    
    fun updateRole(userId: String, role: String): Flow<Resource<Unit>> = repository.updateUserRole(userId, role)
}
