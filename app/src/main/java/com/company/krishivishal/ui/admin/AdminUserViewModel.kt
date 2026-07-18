package com.company.krishivishal.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.data.model.User
import com.company.krishivishal.domain.usecase.admin.ManageUsersUseCase
import com.company.krishivishal.utils.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AdminUserViewModel @Inject constructor(
    private val manageUsersUseCase: ManageUsersUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(AdminUserUiState())
    val uiState: StateFlow<AdminUserUiState> = _uiState.asStateFlow()

    fun loadUsers(role: String? = null) {
        viewModelScope.launch {
            manageUsersUseCase.getUsers(role).collect { resource ->
                _uiState.update { it.copy(usersResource = resource) }
            }
        }
    }

    fun updateUserRole(userId: String, newRole: String) {
        viewModelScope.launch {
            manageUsersUseCase.updateRole(userId, newRole).collect { resource ->
                if (resource is Resource.Success) {
                    loadUsers(_uiState.value.selectedRole)
                }
            }
        }
    }

    fun setFilterRole(role: String?) {
        _uiState.update { it.copy(selectedRole = role) }
        loadUsers(role)
    }
}

data class AdminUserUiState(
    val usersResource: Resource<List<User>> = Resource.Loading(),
    val selectedRole: String? = null
)
