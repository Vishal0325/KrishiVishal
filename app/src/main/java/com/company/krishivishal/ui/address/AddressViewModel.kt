package com.company.krishivishal.ui.address

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.data.model.Address
import com.company.krishivishal.data.repository.AddressRepository
import com.company.krishivishal.data.repository.AuthRepository
import com.company.krishivishal.utils.Resource
import com.company.krishivishal.ui.home.HomeViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

sealed class AddressUiEvent {
    data class ShowSnackbar(val message: String) : AddressUiEvent()
    object AddressSaved : AddressUiEvent()
}

@HiltViewModel
class AddressViewModel @Inject constructor(
    private val addressRepository: AddressRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _addresses = MutableStateFlow<Resource<List<Address>>>(Resource.Loading())
    val addresses: StateFlow<Resource<List<Address>>> = _addresses.asStateFlow()

    private val _uiEvent = MutableSharedFlow<AddressUiEvent>()
    val uiEvent = _uiEvent.asSharedFlow()

    init {
        loadAddresses()
    }

    fun loadAddresses() {
        viewModelScope.launch {
            authRepository.getCurrentUser().collectLatest { user ->
                val userId = user?.id ?: HomeViewModel.GUEST_USER_ID
                addressRepository.getAddresses(userId).collectLatest { resource ->
                    _addresses.value = resource
                }
            }
        }
    }

    fun addAddress(
        fullName: String,
        mobileNumber: String,
        houseNo: String,
        street: String,
        ward: String,
        pincode: String,
        block: String,
        district: String,
        state: String,
        landmark: String,
        isDefault: Boolean,
        addressType: String = "Farm"
    ) {
        viewModelScope.launch {
            val user = authRepository.getCurrentUser().firstOrNull()
            val userId = user?.id ?: HomeViewModel.GUEST_USER_ID
            
            val newAddress = Address(
                id = UUID.randomUUID().toString(),
                userId = userId,
                fullName = fullName,
                mobileNumber = mobileNumber,
                houseNo = houseNo,
                street = street,
                ward = ward,
                pincode = pincode,
                block = block,
                district = district,
                state = state,
                landmark = landmark,
                isDefault = isDefault,
                addressType = addressType
            )

            addressRepository.addAddress(newAddress).collectLatest { resource ->
                when (resource) {
                    is Resource.Success -> {
                        _uiEvent.emit(AddressUiEvent.AddressSaved)
                        _uiEvent.emit(AddressUiEvent.ShowSnackbar("Address saved successfully"))
                    }
                    is Resource.Error -> {
                        _uiEvent.emit(AddressUiEvent.ShowSnackbar(resource.message ?: "Failed to save address"))
                    }
                    else -> {}
                }
            }
        }
    }

    fun deleteAddress(address: Address) {
        viewModelScope.launch {
            addressRepository.deleteAddress(address).collectLatest { resource ->
                if (resource is Resource.Error) {
                    _uiEvent.emit(AddressUiEvent.ShowSnackbar(resource.message ?: "Failed to delete address"))
                }
            }
        }
    }
}
