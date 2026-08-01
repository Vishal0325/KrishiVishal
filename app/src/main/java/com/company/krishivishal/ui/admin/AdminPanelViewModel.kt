package com.company.krishivishal.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.AdminLog
import com.company.krishivishal.domain.usecase.admin.AdminStats
import com.company.krishivishal.domain.usecase.admin.GetAdminRecentLogsUseCase
import com.company.krishivishal.domain.usecase.admin.GetAdminStatsUseCase
import com.company.krishivishal.core.util.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AdminPanelViewModel @Inject constructor(
    private val getAdminStatsUseCase: GetAdminStatsUseCase,
    private val getAdminRecentLogsUseCase: GetAdminRecentLogsUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(AdminDashboardUiState())
    val uiState: StateFlow<AdminDashboardUiState> = _uiState.asStateFlow()

    init {
        loadDashboard()
    }

    fun loadDashboard() {
        viewModelScope.launch {
            combine(
                getAdminStatsUseCase(),
                getAdminRecentLogsUseCase()
            ) { stats, logs ->
                AdminDashboardUiState(
                    stats = stats,
                    recentLogs = logs,
                    isLoading = stats is Resource.Loading || logs is Resource.Loading
                )
            }.collect { newState ->
                _uiState.value = newState
            }
        }
    }
}

data class AdminDashboardUiState(
    val stats: Resource<AdminStats> = Resource.Loading(),
    val recentLogs: Resource<List<AdminLog>> = Resource.Loading(),
    val isLoading: Boolean = false
)
