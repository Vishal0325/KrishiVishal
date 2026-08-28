package com.company.krishivishal.ui.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.Address
import com.company.krishivishal.core.model.CartWithProduct
import com.company.krishivishal.core.model.availableStock
import com.company.krishivishal.data.repository.CartRepository
import com.company.krishivishal.data.repository.CheckoutSessionRepository
import com.company.krishivishal.data.repository.AddressRepository
import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.domain.usecase.auth.GetCurrentUserUseCase
import com.company.krishivishal.domain.usecase.cart.CalculateCartTotalsUseCase
import com.company.krishivishal.domain.usecase.cart.CartTotals
import com.company.krishivishal.domain.usecase.checkout.PlaceOrderUseCase
import com.company.krishivishal.domain.usecase.checkout.ValidateCheckoutUseCase
import com.company.krishivishal.domain.usecase.checkout.CheckoutValidationResult
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.analytics.AnalyticsTracker
import com.company.krishivishal.payment.PaymentHandler
import com.company.krishivishal.payment.PaymentResult
import com.company.krishivishal.BuildConfig
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Payments
import androidx.lifecycle.SavedStateHandle
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
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
    data class OrderSuccess(val orderId: String, val otp: String) : CheckoutUiEvent()
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
    private val paymentHandler: PaymentHandler,
    private val orderRepository: OrderRepository,
    private val paymentResilienceManager: com.company.krishivishal.performance.PaymentResilienceManager,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val _uiState = MutableStateFlow(CheckoutUiState(
        isOnlinePaymentEnabled = true
    ))
    val uiState: StateFlow<CheckoutUiState> = _uiState.asStateFlow()

    private val _uiEvent = MutableSharedFlow<CheckoutUiEvent>()
    val uiEvent = _uiEvent.asSharedFlow()

    private var userId: String = ""
    private var currentSource: CheckoutSource = CheckoutSource.CART
    private var quantityUpdateJob: Job? = null
    
    private var pendingOrderId: String?
        get() = savedStateHandle.get<String>("pending_order_id")
        set(value) = savedStateHandle.set("pending_order_id", value)

    private var pendingOrderOtp: String?
        get() = savedStateHandle.get<String>("pending_order_otp")
        set(value) = savedStateHandle.set("pending_order_otp", value)

    init {
        loadData()
        observePaymentResult()
        initializePaymentOptions()
    }

    private fun initializePaymentOptions() {
        val options = mutableListOf<PaymentOption>()
        val isOnlineEnabled = BuildConfig.IS_ONLINE_PAYMENT_ENABLED 
        
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
            getCurrentUserUseCase().collectLatest { user ->
                userId = user?.id ?: "guest_user"
                _uiState.update { it.copy(userEmail = user?.email, userPhone = user?.phone) }

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
                                    var allItems = resource.data ?: emptyList()
                                    var selectedItems = allItems.filter { it.cartItem.isSelected }

                                    // If user just logged in and user-specific cart is empty, seamlessly migrate guest cart
                                    if (selectedItems.isEmpty() && userId != "guest_user" && userId.isNotBlank()) {
                                        val guestCart = cartRepository.getCartWithProducts("guest_user").firstOrNull()
                                        val guestData = guestCart?.data
                                        if (guestCart is Resource.Success && !guestData.isNullOrEmpty()) {
                                            val guestItems = guestData.filter { it.cartItem.isSelected }
                                            if (guestItems.isNotEmpty()) {
                                                guestItems.forEach { gItem ->
                                                    cartRepository.addToCart(gItem.cartItem.copy(
                                                        id = java.util.UUID.randomUUID().toString(),
                                                        userId = userId
                                                    )).collectLatest { }
                                                }
                                                cartRepository.clearCart("guest_user").collectLatest { }
                                                return@collectLatest
                                            }
                                        }
                                    }

                                    val totals = calculateCartTotalsUseCase(selectedItems)
                                    _uiState.update { 
                                        it.copy(
                                            isCartLoading = false,
                                            checkoutItems = selectedItems,
                                            totals = totals,
                                            error = if (selectedItems.isNotEmpty()) null else it.error
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
        
        val cartWithProduct = _uiState.value.checkoutItems.find { it.cartItem.id == cartItemId }
        if (cartWithProduct != null) {
            val availableStock = cartWithProduct.availableStock()
            if (newQty > availableStock) {
                _uiState.update { it.copy(error = "Only $availableStock available in stock") }
                return
            }
        }
        
        _uiState.update { state ->
            val updatedItems = state.checkoutItems.map { 
                if (it.cartItem.id == cartItemId) it.copy(cartItem = it.cartItem.copy(quantity = newQty)) else it 
            }
            state.copy(
                checkoutItems = updatedItems,
                totals = calculateCartTotalsUseCase(updatedItems)
            )
        }

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

    fun placeOrder(lat: Double = 0.0, lng: Double = 0.0) {
        if (!paymentResilienceManager.canAttemptPayment()) {
            val waitTime = paymentResilienceManager.getRemainingCooldownMinutes()
            _uiState.update { it.copy(error = "System maintenance chal rahi hai. Kripya $waitTime min baad prayas karein.") }
            return
        }
        val currentState = _uiState.value

        val validation = validateCheckoutUseCase(currentState.checkoutItems, currentState.selectedAddress)
        if (validation is CheckoutValidationResult.Invalid) {
            _uiState.update { it.copy(error = validation.message) }
            return
        }

        val selectedAddress = currentState.selectedAddress
        if (selectedAddress == null) {
            _uiState.update { it.copy(error = "Please select a delivery address.") }
            return
        }

        if (userId.isBlank() || userId == "guest_user") {
            // Fallback: check FirebaseAuth directly in case the flow hasn't emitted yet
            val fbUser = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser
            if (fbUser != null && !fbUser.isAnonymous) {
                userId = fbUser.uid
                android.util.Log.w("CheckoutVM", "userId was blank, recovered from FirebaseAuth: $userId")
            } else {
                _uiState.update { it.copy(error = "Login karo pehle order karne ke liye.") }
                return
            }
        }

        viewModelScope.launch {
            _uiState.update { it.copy(checkoutResource = Resource.Loading(), error = null) }

            // Note: Token refresh is now handled inside placeOrderUseCase via OrderRepository
            placeOrderUseCase(
                userId = userId,
                cartItems = currentState.checkoutItems,
                address = selectedAddress,
                paymentMethod = currentState.selectedPaymentMethod.name,
                lat = lat,
                lng = lng
            ).collect { resource ->
                when (resource) {
                    is Resource.Loading -> { } // Already set above
                    is Resource.Success -> {
                        paymentResilienceManager.recordSuccess()
                        resource.data?.let { data ->
                            pendingOrderId = data.first
                            pendingOrderOtp = data.third
                            if (currentState.selectedPaymentMethod == PaymentMethod.ONLINE) {
                                _uiState.update { it.copy(checkoutResource = null) }
                                _uiEvent.emit(CheckoutUiEvent.InitiatePayment(data.second, data.first))
                            } else {
                                onOrderCompletionSuccess(data.second)
                            }
                        }
                    }
                    is Resource.Error -> {
                        paymentResilienceManager.recordFailure()
                        val isSessionExpired = resource.message?.contains("login again", ignoreCase = true) == true
                        _uiState.update {
                            it.copy(
                                checkoutResource = Resource.Error(resource.message ?: "Failed"),
                                error = resource.message,
                                isSessionExpired = isSessionExpired
                            )
                        }
                    }
                    else -> Unit
                }
            }
        }
    }

    private fun onOrderCompletionSuccess(totalAmount: Double) {
        val currentState = _uiState.value
        _uiState.update { it.copy(checkoutResource = Resource.Success(Unit)) }
        
        viewModelScope.launch {
            if (currentSource == CheckoutSource.CART) {
                cartRepository.deleteSelected(userId).collectLatest { }
            } else {
                checkoutSessionRepository.clear()
            }
            _uiEvent.emit(CheckoutUiEvent.OrderSuccess(pendingOrderId ?: "", pendingOrderOtp ?: ""))
        }
        
        analyticsTracker.trackPurchase(
            pendingOrderId ?: java.util.UUID.randomUUID().toString(),
            totalAmount,
            "INR",
            currentState.checkoutItems.mapNotNull { 
                val product = it.product ?: return@mapNotNull null
                AnalyticsTracker.PurchaseItem(
                    it.cartItem.productId, product.name, 
                    it.variant?.price ?: product.discountedPrice.takeIf { it > 0 } ?: product.basePrice, 
                    it.cartItem.quantity
                )
            }
        )
    }

    private fun observePaymentResult() {
        viewModelScope.launch {
            paymentHandler.paymentResult.collect { result ->
                when (result) {
                    is PaymentResult.Success -> {
                        val orderId = pendingOrderId ?: return@collect
                        orderRepository.verifyPayment(
                            orderId = orderId,
                            paymentId = result.razorpayPaymentId ?: "",
                            orderRazorpayId = result.razorpayOrderId ?: "",
                            signature = result.razorpaySignature ?: ""
                        ).collect { resource ->
                            when (resource) {
                                is Resource.Success -> {
                                    paymentResilienceManager.recordSuccess()
                                    onOrderCompletionSuccess(_uiState.value.totals.grandTotal)
                                }
                                is Resource.Error -> {
                                    paymentResilienceManager.recordFailure()
                                    _uiState.update { it.copy(error = "Verification failed: ${resource.message}") }
                                }
                                else -> Unit
                            }
                        }
                    }
                    is PaymentResult.Error -> {
                        paymentResilienceManager.recordFailure()
                        _uiState.update { it.copy(error = "Payment failed: ${result.description}") }
                    }
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null, isSessionExpired = false) }
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
    val isSessionExpired: Boolean = false,
    val userEmail: String? = null,
    val userPhone: String? = null
)
