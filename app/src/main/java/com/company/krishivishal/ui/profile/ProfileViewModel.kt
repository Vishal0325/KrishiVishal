package com.company.krishivishal.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.User
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.data.repository.AdminAuthManager
import com.company.krishivishal.data.repository.AuthRepository
import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.data.repository.ReferralRepository
import com.company.krishivishal.data.repository.WishlistRepository
import com.company.krishivishal.domain.usecase.auth.DeleteAccountUseCase
import com.company.krishivishal.session.SessionManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.company.krishivishal.core.model.Address
import com.company.krishivishal.data.repository.AddressRepository

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val adminAuthManager: AdminAuthManager,
    private val referralRepository: ReferralRepository,
    private val deleteAccountUseCase: DeleteAccountUseCase,
    private val orderRepository: OrderRepository,
    private val wishlistRepository: WishlistRepository,
    private val sessionManager: SessionManager,
    private val addressRepository: AddressRepository
) : ViewModel() {

    private val _userProfile = MutableStateFlow<User?>(null)
    val userProfile: StateFlow<User?> = _userProfile.asStateFlow()

    private val _defaultAddress = MutableStateFlow<Address?>(null)
    val defaultAddress: StateFlow<Address?> = _defaultAddress.asStateFlow()

    private val _totalOrdersCount = MutableStateFlow(0)
    val totalOrdersCount: StateFlow<Int> = _totalOrdersCount.asStateFlow()

    private val _wishlistItemsCount = MutableStateFlow(0)
    val wishlistItemsCount: StateFlow<Int> = _wishlistItemsCount.asStateFlow()

    private val _walletBalance = MutableStateFlow<Resource<Double>>(Resource.Loading())
    val walletBalance: StateFlow<Resource<Double>> = _walletBalance.asStateFlow()

    private val _isAdmin = MutableStateFlow(false)
    val isAdmin: StateFlow<Boolean> = _isAdmin.asStateFlow()

    private val _deleteAccountResult = MutableSharedFlow<Resource<Unit>>()
    val deleteAccountResult: SharedFlow<Resource<Unit>> = _deleteAccountResult.asSharedFlow()

    init {
        getCurrentUser()
        checkAdminStatus()
    }

    private fun getCurrentUser() {
        viewModelScope.launch {
            authRepository.getCurrentUser().collectLatest { currentUser ->
                _userProfile.value = currentUser
                currentUser?.let {
                    loadWallet(it.id)
                    loadStats(it.id)
                    loadDefaultAddress(it.id)
                }
            }
        }
    }

    private fun loadStats(userId: String) {
        viewModelScope.launch {
            orderRepository.getOrders(userId).collectLatest { resource ->
                if (resource is Resource.Success) {
                    _totalOrdersCount.value = resource.data?.size ?: 0
                }
            }
        }
        viewModelScope.launch {
            wishlistRepository.getWishlist(userId).collectLatest { resource ->
                if (resource is Resource.Success) {
                    _wishlistItemsCount.value = resource.data?.size ?: 0
                }
            }
        }
    }

    private fun loadDefaultAddress(userId: String) {
        viewModelScope.launch {
            addressRepository.getAddresses(userId).collectLatest { resource ->
                if (resource is Resource.Success) {
                    val addresses = resource.data ?: emptyList()
                    _defaultAddress.value = addresses.find { it.isDefault } ?: addresses.firstOrNull()
                }
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
            sessionManager.endSession()
            _userProfile.value = null
            _isAdmin.value = false
        }
    }

    fun deleteAccount() {
        viewModelScope.launch {
            deleteAccountUseCase().collectLatest {
                _deleteAccountResult.emit(it)
                if (it is Resource.Success) {
                    _userProfile.value = null
                    _isAdmin.value = false
                }
            }
        }
    }

    fun updateProfile(name: String, email: String, phone: String) {
        val currentUser = _userProfile.value ?: return
        val updatedUser = currentUser.copy(name = name, email = email, phone = phone)
        viewModelScope.launch {
            authRepository.updateUser(updatedUser).collectLatest {
                // UI will update automatically via getCurrentUser collector
            }
        }
    }

    private val _isSavingFarmProfile = MutableStateFlow(false)
    val isSavingFarmProfile: StateFlow<Boolean> = _isSavingFarmProfile.asStateFlow()

    private val _farmProfileSaveStatus = MutableSharedFlow<Resource<Unit>>()
    val farmProfileSaveStatus: SharedFlow<Resource<Unit>> = _farmProfileSaveStatus.asSharedFlow()

    fun updateFarmProfile(
        age: Int?,
        totalLand: Double,
        landUnit: String,
        cropAllocations: List<com.company.krishivishal.core.model.CropAllocation>,
        onResult: ((Boolean, String?) -> Unit)? = null
    ) {
        val currentUser = _userProfile.value ?: return
        val updatedUser = currentUser.copy(
            age = age,
            totalLand = totalLand,
            landUnit = landUnit,
            cropAllocations = cropAllocations
        )
        viewModelScope.launch {
            _isSavingFarmProfile.value = true
            authRepository.updateUser(updatedUser).collectLatest { res ->
                when (res) {
                    is Resource.Success -> {
                        _isSavingFarmProfile.value = false
                        _userProfile.value = updatedUser
                        _farmProfileSaveStatus.emit(Resource.Success(Unit))
                        onResult?.invoke(true, null)
                    }
                    is Resource.Error -> {
                        _isSavingFarmProfile.value = false
                        _farmProfileSaveStatus.emit(Resource.Error(res.message ?: "Failed to save profile"))
                        onResult?.invoke(false, res.message)
                    }
                    is Resource.Loading -> {
                        _isSavingFarmProfile.value = true
                    }
                    is Resource.Idle -> {}
                }
            }
        }
    }
}
