package com.company.krishivishal.ui.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.data.model.*
import com.company.krishivishal.data.repository.*
import com.company.krishivishal.domain.usecase.auth.GetCurrentUserUseCase
import com.company.krishivishal.domain.usecase.cart.*
import com.company.krishivishal.domain.usecase.checkout.*
import com.company.krishivishal.utils.Resource
import com.company.krishivishal.analytics.AnalyticsTracker
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class CheckoutSource {
    CART, BUY_NOW
}

@HiltViewModel
class CheckoutViewModel @Inject constructor(
    private val cartRepository: CartRepository,
    private val checkoutSessionRepository: CheckoutSessionRepository,
    private val placeOrderUseCase: PlaceOrderUseCase,
    private val calculateCartTotalsUseCase: CalculateCartTotalsUseCase,
    private val validateCheckoutUseCase: ValidateCheckoutUseCase,
    private val addressRepository: AddressRepository,
    private val getCurrentUserUseCase: GetCurrentUserUseCase,
    private val analyticsTracker: AnalyticsTracker
) : ViewModel() {

    private val _uiState = MutableStateFlow(CheckoutUiState())
    val uiState: StateFlow<CheckoutUiState> = _uiState.asStateFlow()

    private var userId: String = "guest_user"
    private var currentSource: CheckoutSource = CheckoutSource.CART

    fun setSource(source: CheckoutSource) {
        currentSource = source
        loadData()
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    private fun loadData() {
        // Load Addresses
        viewModelScope.launch {
            getCurrentUserUseCase().flatMapLatest { user ->
                userId = user?.id ?: "guest_user"
                addressRepository.getAddresses(userId)
            }.collectLatest { resource ->
                if (resource is Resource.Success) {
                    val addresses = resource.data ?: emptyList()
                    val defaultAddr = addresses.find { it.isDefault } ?: addresses.firstOrNull()
                    _uiState.update { 
                        it.copy(
                            isAddressesLoading = false,
                            addresses = addresses,
                            selectedAddress = defaultAddr
                        ) 
                    }
                }
            }
        }

        // Load Items based on source
        viewModelScope.launch {
            when (currentSource) {
                CheckoutSource.CART -> {
                    cartRepository.getCartWithProducts(userId).collectLatest { resource ->
                        if (resource is Resource.Success) {
                            val allItems = resource.data ?: emptyList()
                            val selectedItems = allItems.filter { it.cartItem.isSelected }
                            val totals = calculateCartTotalsUseCase(selectedItems)
                            _uiState.update { 
                                it.copy(
                                    isCartLoading = false,
                                    checkoutItems = selectedItems,
                                    totals = totals
                                ) 
                            }
                        }
                    }
                }
                CheckoutSource.BUY_NOW -> {
                    checkoutSessionRepository.buyNowItem.collectLatest { item ->
                        val items = if (item != null) listOf(item) else emptyList()
                        val totals = calculateCartTotalsUseCase(items)
                        _uiState.update { 
                            it.copy(
                                isCartLoading = false,
                                checkoutItems = items,
                                totals = totals
                            ) 
                        }
                    }
                }
            }
        }
    }

    fun selectAddress(address: Address) {
        _uiState.update { it.copy(selectedAddress = address) }
    }

    fun addAddress(
        name: String, mobile: String, house: String, street: String, ward: String,
        pin: String, block: String, district: String, state: String, landmark: String,
        isDefault: Boolean, type: String
    ) {
        val newAddress = Address(
            id = java.util.UUID.randomUUID().toString(),
            userId = userId,
            fullName = name,
            mobileNumber = mobile,
            houseNo = house,
            street = street,
            ward = ward,
            pincode = pin,
            block = block,
            district = district,
            state = state,
            landmark = landmark,
            isDefault = isDefault,
            addressType = type
        )

        viewModelScope.launch {
            addressRepository.addAddress(newAddress).collectLatest { resource ->
                when (resource) {
                    is Resource.Loading -> {
                        _uiState.update { it.copy(isAddressesLoading = true) }
                    }
                    is Resource.Success -> {
                        // The addresses list is automatically updated via loadData() collect
                        _uiState.update { it.copy(selectedAddress = newAddress, isAddressesLoading = false) }
                    }
                    is Resource.Error -> {
                        _uiState.update { it.copy(error = resource.message, isAddressesLoading = false) }
                    }
                    else -> Unit
                }
            }
        }
    }

    fun placeOrder() {
        val currentState = _uiState.value
        
        val validation = validateCheckoutUseCase(currentState.checkoutItems, currentState.selectedAddress)
        if (validation is CheckoutValidationResult.Invalid) {
            _uiState.update { it.copy(error = validation.message) }
            return
        }

        val address = currentState.selectedAddress!!
        
        viewModelScope.launch {
            placeOrderUseCase(userId, currentState.checkoutItems, address).collect { resource ->
                _uiState.update { it.copy(checkoutResource = resource) }
                if (resource is Resource.Success) {
                    // Cleanup
                    if (currentSource == CheckoutSource.CART) {
                        cartRepository.deleteSelected(userId).collectLatest { }
                    } else {
                        checkoutSessionRepository.clear()
                    }
                    
                    analyticsTracker.trackPurchase(
                        java.util.UUID.randomUUID().toString(),
                        currentState.totals.grandTotal,
                        "INR",
                        currentState.checkoutItems.map { 
                            AnalyticsTracker.PurchaseItem(
                                it.cartItem.productId, it.product.name, 
                                it.variant?.price ?: it.product.discountedPrice.takeIf { it > 0 } ?: it.product.basePrice, 
                                it.cartItem.quantity
                            )
                        }
                    )
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}

data class CheckoutUiState(
    val isCartLoading: Boolean = false,
    val isAddressesLoading: Boolean = false,
    val checkoutItems: List<CartWithProduct> = emptyList(),
    val totals: CartTotals = CartTotals(),
    val addresses: List<Address> = emptyList(),
    val selectedAddress: Address? = null,
    val checkoutResource: Resource<Unit>? = null,
    val error: String? = null
)
