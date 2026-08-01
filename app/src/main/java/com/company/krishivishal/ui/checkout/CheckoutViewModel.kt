package com.company.krishivishal.ui.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.*
import com.company.krishivishal.core.model.availableStock
import com.company.krishivishal.data.repository.*
import com.company.krishivishal.domain.usecase.auth.GetCurrentUserUseCase
import com.company.krishivishal.domain.usecase.cart.*
import com.company.krishivishal.domain.usecase.checkout.*
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.analytics.AnalyticsTracker
import com.company.krishivishal.payment.PaymentHandler
import com.company.krishivishal.payment.PaymentResult
import com.company.krishivishal.BuildConfig
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Payments
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class CheckoutSource {
    CART, BUY_NOW
}

enum class PaymentMethod {
    COD, ONLINE
}

data class PaymentOption(
    val method: PaymentMethod,
    val title: String,
    val subtitle: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val iconColor: androidx.compose.ui.graphics.Color
)

sealed class CheckoutUiEvent {
    data class InitiatePayment(val amount: Double, val orderId: String) : CheckoutUiEvent()
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
    private val analyticsTracker: AnalyticsTracker,
    private val paymentHandler: PaymentHandler
) : ViewModel() {

    private val _uiState = MutableStateFlow(CheckoutUiState(
        isOnlinePaymentEnabled = true // Default true until build syncs BuildConfig field
    ))
    val uiState: StateFlow<CheckoutUiState> = _uiState.asStateFlow()

    private val _uiEvent = MutableSharedFlow<CheckoutUiEvent>()
    val uiEvent = _uiEvent.asSharedFlow()

    private var userId: String = "guest_user"
    private var currentSource: CheckoutSource = CheckoutSource.CART
    private var quantityUpdateJob: Job? = null

    init {
        loadData()
        observePaymentResult()
        initializePaymentOptions()
    }

    private fun initializePaymentOptions() {
        val options = mutableListOf<PaymentOption>()
        
        // Use a safe check for IS_ONLINE_PAYMENT_ENABLED or default to true for now
        val isOnlineEnabled = true 
        
        if (isOnlineEnabled) {
            options.add(PaymentOption(
                method = PaymentMethod.ONLINE,
                title = "UPI",
                subtitle = "GPay, PhonePe, Paytm",
                icon = Icons.Default.AccountBalanceWallet,
                iconColor = androidx.compose.ui.graphics.Color(0xFF2196F3)
            ))
        }
        
        options.add(PaymentOption(
            method = PaymentMethod.COD,
            title = "Cash on delivery",
            subtitle = "Pay when order arrives",
            icon = Icons.Default.Payments,
            iconColor = androidx.compose.ui.graphics.Color(0xFFFF9800)
        ))

        _uiState.update { 
            it.copy(
                paymentOptions = options,
                selectedPaymentMethod = if (isOnlineEnabled) PaymentMethod.ONLINE else PaymentMethod.COD
            ) 
        }
    }

    fun setSource(source: CheckoutSource) {
        currentSource = source
        loadData()
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    private fun loadData() {
        viewModelScope.launch {
            // 1. Get current user first
            getCurrentUserUseCase().collectLatest { user ->
                userId = user?.id ?: "guest_user"
                _uiState.update { it.copy(userEmail = user?.email, userPhone = user?.phone) }

                // 2. Once we have userId, load addresses and items
                launch {
                    addressRepository.getAddresses(userId).collectLatest { resource ->
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

                launch {
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
        }
    }

    fun selectAddress(address: Address) {
        _uiState.update { it.copy(selectedAddress = address) }
    }

    fun updateQuantity(cartItemId: String, newQty: Int) {
        if (newQty < 1) return
        
        // NEW: Validate stock before optimistic update (Phase 2.2)
        val cartWithProduct = _uiState.value.checkoutItems.find { it.cartItem.id == cartItemId }
        if (cartWithProduct != null) {
            val availableStock = cartWithProduct.availableStock()  // Using extension function
            if (newQty > availableStock) {
                _uiState.update { it.copy(error = "Only $availableStock available in stock") }
                return
            }
        }
        
        // Optimistic UI update
        _uiState.update { state ->
            val updatedItems = state.checkoutItems.map { 
                if (it.cartItem.id == cartItemId) it.copy(cartItem = it.cartItem.copy(quantity = newQty)) else it 
            }
            state.copy(
                checkoutItems = updatedItems,
                totals = calculateCartTotalsUseCase(updatedItems)
            )
        }

        // Debounced DB update
        quantityUpdateJob?.cancel()
        quantityUpdateJob = viewModelScope.launch {
            delay(300)
            val item = _uiState.value.checkoutItems.find { it.cartItem.id == cartItemId }?.cartItem
            item?.let {
                cartRepository.updateCartItem(it).collectLatest { }
            }
        }
    }

    fun removeItem(cartItemId: String) {
        viewModelScope.launch {
            val item = _uiState.value.checkoutItems.find { it.cartItem.id == cartItemId }?.cartItem
            item?.let {
                cartRepository.removeFromCart(it).collectLatest { }
            }
        }
    }

    fun updatePaymentMethod(method: PaymentMethod) {
        _uiState.update { it.copy(selectedPaymentMethod = method) }
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

        if (currentState.selectedPaymentMethod == PaymentMethod.ONLINE) {
            viewModelScope.launch {
                _uiEvent.emit(CheckoutUiEvent.InitiatePayment(currentState.totals.grandTotal, "ORD_${System.currentTimeMillis()}"))
            }
        } else {
            executePlaceOrder()
        }
    }

    private fun executePlaceOrder() {
        val currentState = _uiState.value
        val address = currentState.selectedAddress!!
        
        // Ensure we don't use the placeholder ID
        if (userId == "guest_user" || userId.isBlank()) {
            _uiState.update { it.copy(error = "Error: Invalid user session. Please restart.") }
            return
        }

        viewModelScope.launch {
            placeOrderUseCase(
                userId = userId, 
                cartItems = currentState.checkoutItems, 
                address = address,
                paymentMethod = currentState.selectedPaymentMethod.name,
                status = if (currentState.selectedPaymentMethod == PaymentMethod.ONLINE) "PAID" else "PLACED"
            ).collect { resource ->
                _uiState.update { it.copy(checkoutResource = resource) }
                when (resource) {
                    is Resource.Success -> {
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
                    is Resource.Error -> {
                        _uiState.update { it.copy(error = "Order failed: ${resource.message}") }
                    }
                    else -> Unit
                }
            }
        }
    }

    private fun observePaymentResult() {
        viewModelScope.launch {
            paymentHandler.paymentResult.collect { result ->
                when (result) {
                    is PaymentResult.Success -> {
                        executePlaceOrder()
                    }
                    is PaymentResult.Error -> {
                        _uiState.update { it.copy(error = "Payment failed: ${result.description}") }
                    }
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
    val isOnlinePaymentEnabled: Boolean = false,
    val paymentOptions: List<PaymentOption> = emptyList(),
    val selectedPaymentMethod: PaymentMethod = PaymentMethod.COD,
    val checkoutResource: Resource<Unit>? = null,
    val error: String? = null,
    val userEmail: String? = null,
    val userPhone: String? = null
)
