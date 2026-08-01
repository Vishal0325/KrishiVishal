package com.company.krishivishal.domain.usecase.admin

import com.company.krishivishal.core.model.AdminLog
import com.company.krishivishal.data.repository.AdminRepository
import com.company.krishivishal.core.util.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class GetAdminRecentLogsUseCase @Inject constructor(
    private val repository: AdminRepository
) {
    operator fun invoke(): Flow<Resource<List<AdminLog>>> {
        return repository.getActivityLogs()
    }
}
