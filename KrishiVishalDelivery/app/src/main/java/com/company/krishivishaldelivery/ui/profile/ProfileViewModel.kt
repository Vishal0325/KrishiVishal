package com.company.krishivishaldelivery.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.data.model.Rider
import com.company.krishivishaldelivery.data.repository.RiderRepository
import com.google.firebase.auth.FirebaseAuth
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val auth: FirebaseAuth,
    private val riderRepository: RiderRepository
) : ViewModel() {

    private val _riderProfile = MutableStateFlow<Resource<Rider?>>(Resource.Loading())
    val riderProfile: StateFlow<Resource<Rider?>> = _riderProfile.asStateFlow()

    private val _deleteAccountResult = MutableSharedFlow<Resource<Unit>>()
    val deleteAccountResult = _deleteAccountResult.asSharedFlow()

    private val currentRiderId: String get() = auth.currentUser?.uid ?: ""

    init {
        loadRiderProfile()
    }

    private fun loadRiderProfile() {
        val riderId = currentRiderId
        if (riderId.isNotEmpty()) {
            viewModelScope.launch {
                riderRepository.getRiderProfile(riderId)
                    .catch { e -> _riderProfile.value = Resource.Error(e.message ?: "Profile error") }
                    .collectLatest { _riderProfile.value = Resource.Success(it) }
            }
        }
    }

    fun updateProfile(name: String, bankAccount: String, bankName: String, ifsc: String, vehicleNumber: String, vehicleType: String) {
        viewModelScope.launch {
            try {
                riderRepository.updateRiderProfile(currentRiderId, mapOf(
                    "name" to name, "bankAccount" to bankAccount, "bankName" to bankName,
                    "ifscCode" to ifsc, "vehicleNumber" to vehicleNumber, "vehicleType" to vehicleType
                ))
            } catch (e: Exception) {
                // Error handling
            }
        }
    }

    fun deleteAccount() {
        viewModelScope.launch {
            try {
                _deleteAccountResult.emit(Resource.Loading())
                val riderId = currentRiderId
                val firebaseUser = auth.currentUser ?: throw Exception("User not logged in")

                riderRepository.deleteRiderAccount(riderId)
                firebaseUser.delete().await()
                _deleteAccountResult.emit(Resource.Success(Unit))
            } catch (e: Exception) {
                _deleteAccountResult.emit(Resource.Error(e.message ?: "Deletion failed"))
            }
        }
    }
}
