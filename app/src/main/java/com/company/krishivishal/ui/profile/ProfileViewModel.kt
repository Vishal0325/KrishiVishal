package com.company.krishivishal.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.data.model.User
import com.company.krishivishal.data.repository.AdminAuthManager
import com.company.krishivishal.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

import com.company.krishivishal.data.repository.ReferralRepository
import com.company.krishivishal.utils.Resource

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val adminAuthManager: AdminAuthManager,
    private val referralRepository: ReferralRepository
) : ViewModel() {

    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user.asStateFlow()

    private val _walletBalance = MutableStateFlow<Resource<Double>>(Resource.Loading())
    val walletBalance: StateFlow<Resource<Double>> = _walletBalance.asStateFlow()

    private val _isAdmin = MutableStateFlow(false)
    val isAdmin: StateFlow<Boolean> = _isAdmin.asStateFlow()

    init {
        getCurrentUser()
        checkAdminStatus()
    }

    private fun getCurrentUser() {
        viewModelScope.launch {
            authRepository.getCurrentUser().collectLatest { currentUser ->
                _user.value = currentUser
                currentUser?.let { loadWallet(it.id) }
            }
        }
    }

    private fun loadWallet(userId: String) {
        viewModelScope.launch {
            referralRepository.getWalletBalance(userId).collectLatest {
                _walletBalance.value = it
            }
        }
    }

    private fun checkAdminStatus() {
        viewModelScope.launch {
            _isAdmin.value = adminAuthManager.isCurrentUserAdmin()
        }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
            _user.value = null
            _isAdmin.value = false
        }
    }

    fun updateProfile(name: String, email: String, phone: String) {
        val currentUser = _user.value ?: return
        val updatedUser = currentUser.copy(name = name, email = email, phone = phone)
        viewModelScope.launch {
            authRepository.updateUser(updatedUser).collectLatest {
                // UI will update automatically via getCurrentUser collector
            }
        }
    }
}
