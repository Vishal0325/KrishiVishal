package com.company.krishivishal.domain.usecase.admin

import com.company.krishivishal.data.repository.AdminRepository
import com.company.krishivishal.utils.Resource
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertTrue
import org.junit.Test

class ManageUsersUseCaseTest {

    private val repository = mockk<AdminRepository>()
    private val useCase = ManageUsersUseCase(repository)

    @Test
    fun `getUsers should call repository and return flow`() = runTest {
        val role = "SELLER"
        every { repository.getUsers(role) } returns flowOf(Resource.Success(emptyList()))

        useCase.getUsers(role).collect { resource ->
            assertTrue(resource is Resource.Success)
        }
    }

    @Test
    fun `updateRole should call repository`() = runTest {
        val userId = "u1"
        val role = "ADMIN"
        every { repository.updateUserRole(userId, role) } returns flowOf(Resource.Success(Unit))

        useCase.updateRole(userId, role).collect { resource ->
            assertTrue(resource is Resource.Success)
        }
    }
}
