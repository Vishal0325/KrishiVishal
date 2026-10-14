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
import com.company.krishivishal.core.model.AppConfig
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
import com.company.krishivishal.data.repository.WalletRepository
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
import timber.log.Timber

enum class CheckoutSource {
    CART, BUY_NOW
}

enum class PaymentMethod {
    COD, ONLINE, WALLET
}

data class PaymentOption(
    val method: PaymentMethod,
    val title: String,
    val subtitle: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val iconColor: androidx.compose.ui.graphics.Color
)

sealed class CheckoutUiEvent {
    // razorpayOrderId is the server-locked Razorpay Order ID.
    // The SDK MUST use this ID — amount is enforced server-side.
    data class InitiatePayment(
        val amount: Double,
        val orderId: String,
        val razorpayOrderId: String
    ) : CheckoutUiEvent()
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
    private val walletRepository: WalletRepository,
    private val configRepository: com.company.krishivishal.data.repository.ConfigRepository,
    private val featureFlagRepository: com.company.krishivishal.data.repository.FeatureFlagRepository,
    private val paymentResilienceManager: com.company.krishivishal.performance.PaymentResilienceManager,
    private val firebaseAuth: com.google.firebase.auth.FirebaseAuth,
    private val savedStateHandle: SavedStateHandle,
    private val firestore: com.google.firebase.firestore.FirebaseFirestore = com.google.firebase.firestore.FirebaseFirestore.getInstance()
) : ViewModel() {

    private val _uiState = MutableStateFlow(CheckoutUiState(
        isOnlinePaymentEnabled = BuildConfig.IS_ONLINE_PAYMENT_ENABLED
    ))
    val uiState: StateFlow<CheckoutUiState> = _uiState.asStateFlow()

    private val _hasPendingCodOverdue = MutableStateFlow(false)
    val hasPendingCodOverdue: StateFlow<Boolean> = _hasPendingCodOverdue.asStateFlow()

    private val _uiEvent = MutableSharedFlow<CheckoutUiEvent>()
    val uiEvent = _uiEvent.asSharedFlow()

    private var userId: String = ""
    private var currentSource: CheckoutSource = CheckoutSource.CART
    private var quantityUpdateJob: Job? = null
    private var appConfig = AppConfig()
    private var currentHubConfig = com.company.krishivishal.model.HubSystemConfig()
    private var currentGlobalConfig = com.company.krishivishal.model.GlobalSystemConfig()
    
    private var pendingOrderId: String?
        get() = savedStateHandle.get<String>("pending_order_id")
        set(value) = savedStateHandle.set("pending_order_id", value)

    private var pendingOrderOtp: String?
        get() = savedStateHandle.get<String>("pending_order_otp")
        set(value) = savedStateHandle.set("pending_order_otp", value)

    // Persisted so we can verify payment even after process death + restore
    private var pendingRazorpayOrderId: String?
        get() = savedStateHandle.get<String>("pending_razorpay_order_id")
        set(value) = savedStateHandle.set("pending_razorpay_order_id", value)

    init {
        loadData()
        observePaymentResult()
        initializePaymentOptions()
        observeWalletBalance()
        observeConfig()
        observeFeatureFlags()
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    private fun observeFeatureFlags() {
        viewModelScope.launch {
            featureFlagRepository.globalConfig.collectLatest { global ->
                currentGlobalConfig = global
                recomputeFlagsAndPayments()
            }
        }

        viewModelScope.launch {
            _uiState.map { it.selectedAddress?.assignedHubId ?: "" }
                .distinctUntilChanged()
                .flatMapLatest { hubId ->
                    featureFlagRepository.observeHubConfig(hubId)
                }
                .collectLatest { hubConfig ->
                    currentHubConfig = hubConfig
                    recomputeFlagsAndPayments()
                }
        }
    }

    private fun recomputeFlagsAndPayments() {
        val global = currentGlobalConfig
        val hub = currentHubConfig

        val isGlobalFrozen = global.isCheckoutFrozen
        val isHubLockdown = hub.isLockdown
        val isHubNotAccepting = !hub.acceptingOrders

        val isFrozen = isGlobalFrozen || isHubLockdown || isHubNotAccepting
        val frozenReason = when {
            isGlobalFrozen -> global.checkoutFrozen.reason ?: "Checkout is temporarily paused for system maintenance."
            isHubLockdown -> "This delivery zone is currently under lockdown. Orders cannot be placed at this time."
            isHubNotAccepting -> "The local fulfillment hub is temporarily not accepting new orders."
            else -> null
        }

        val isOnlineAllowed = global.payments.onlineEnabled && BuildConfig.IS_ONLINE_PAYMENT_ENABLED
        val isCodAllowed = global.payments.codEnabled && hub.codEnabled

        _uiState.update { state ->
            state.copy(
                isCheckoutFrozen = isFrozen,
                checkoutFrozenReason = frozenReason,
                isHubLockedDown = isHubLockdown,
                isOnlinePaymentEnabled = isOnlineAllowed,
                isCodAvailable = isCodAllowed
            )
        }

        initializePaymentOptions()
    }

    private fun observeConfig() {
        viewModelScope.launch {
            configRepository.getConfig().collectLatest { res ->
                res.data?.let { config ->
                    appConfig = config
                    val items = _uiState.value.checkoutItems
                    if (items.isNotEmpty()) {
                        _uiState.update { it.copy(totals = calculateCartTotalsUseCase(items, appConfig)) }
                    }
                }
            }
        }
    }

    private fun observeWalletBalance() {
        viewModelScope.launch {
            getCurrentUserUseCase().collectLatest { user ->
                val uid = user?.id ?: return@collectLatest
                walletRepository.getBalanceStream(uid).collectLatest { balance ->
                    _uiState.update { it.copy(walletBalance = balance) }
                    // Re-initialize options to show/hide wallet based on balance
                    initializePaymentOptions()
                }
            }
        }
    }

    private fun initializePaymentOptions() {
        val options = mutableListOf<PaymentOption>()
        val currentState = _uiState.value
        val isOnlineEnabled = currentState.isOnlinePaymentEnabled
        val isCodAllowed = currentState.isCodAvailable
        val walletBalance = currentState.walletBalance
        val grandTotal = currentState.totals.grandTotal
        val hasOverdue = _hasPendingCodOverdue.value

        // Wallet option — show if balance > 0
        if (walletBalance > 0) {
            options.add(PaymentOption(
                method = PaymentMethod.WALLET,
                title = "KrishiWallet",
                subtitle = "Balance: ₹${String.format("%.2f", walletBalance)}",
                icon = Icons.Default.AccountBalanceWallet,
                iconColor = androidx.compose.ui.graphics.Color(0xFF4CAF50)
            ))
        }

        if (isOnlineEnabled) {
            options.add(PaymentOption(
                method = PaymentMethod.ONLINE,
                title = "UPI",
                subtitle = "GPay, PhonePe, Paytm",
                icon = Icons.Default.AccountBalanceWallet,
                iconColor = androidx.compose.ui.graphics.Color(0xFF2196F3)
            ))
        }

        if (isCodAllowed) {
            options.add(PaymentOption(
                method = PaymentMethod.COD,
                title = "Cash on delivery",
                subtitle = if (hasOverdue) "Unavailable (Pending COD > 24 hrs)" else "Pay when order arrives",
                icon = Icons.Default.Payments,
                iconColor = androidx.compose.ui.graphics.Color(0xFFFF9800)
            ))
        }

        val currentMethod = currentState.selectedPaymentMethod
        val defaultMethod = when {
            walletBalance >= grandTotal && grandTotal > 0 -> PaymentMethod.WALLET
            isOnlineEnabled -> PaymentMethod.ONLINE
            isCodAllowed && !hasOverdue -> PaymentMethod.COD
            walletBalance > 0 -> PaymentMethod.WALLET
            else -> PaymentMethod.COD
        }

        val isCurrentStillValid = options.any { opt -> opt.method == currentMethod } &&
                !(currentMethod == PaymentMethod.COD && hasOverdue)

        _uiState.update {
            it.copy(
                paymentOptions = options,
                // Only change default if current method is no longer available or COD is locked
                selectedPaymentMethod = if (isCurrentStillValid) currentMethod else defaultMethod
            )
        }
    }

    fun setSource(source: CheckoutSource) {
        currentSource = source
        loadData()
    }

    private fun checkPendingCodOverdue(uid: String) {
        viewModelScope.launch {
            try {
                val snapshot = firestore.collection("orders")
                    .whereEqualTo("userId", uid)
                    .get()
                    .await()

                val cutoff = System.currentTimeMillis() - 86400000L // 24 hours ago
                val terminalStatuses = listOf("DELIVERED", "CANCELLED", "RETURNED")

                val isOverdue = snapshot.documents.any { doc ->
                    val paymentMethod = doc.getString("paymentMethod") 
                        ?: doc.getString("paymentMode") 
                        ?: ""
                    val isCod = paymentMethod.equals("COD", ignoreCase = true) || (doc.getBoolean("isCOD") == true)
                    val status = (doc.getString("status") ?: "").uppercase()

                    val createdAtDate = doc.getTimestamp("createdAt")?.toDate()
                        ?: doc.getDate("createdAt")
                    val createdAtMillis = createdAtDate?.time ?: 0L

                    isCod && status !in terminalStatuses && createdAtMillis > 0L && createdAtMillis < cutoff
                }

                _hasPendingCodOverdue.value = isOverdue
                _uiState.update { state ->
                    val newState = state.copy(hasPendingCodOverdue = isOverdue)
                    if (isOverdue && state.selectedPaymentMethod == PaymentMethod.COD) {
                        val isOnline = BuildConfig.IS_ONLINE_PAYMENT_ENABLED
                        val fallback = when {
                            state.walletBalance > 0 -> PaymentMethod.WALLET
                            isOnline -> PaymentMethod.ONLINE
                            else -> PaymentMethod.ONLINE
                        }
                        newState.copy(selectedPaymentMethod = fallback)
                    } else {
                        newState
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "Error checking overdue COD orders for user: $uid")
                _hasPendingCodOverdue.value = false
                _uiState.update { it.copy(hasPendingCodOverdue = false) }
            }
        }
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    private fun loadData() {
        viewModelScope.launch {
            getCurrentUserUseCase().collectLatest { user ->
                userId = user?.id ?: "guest_user"
                _uiState.update { it.copy(userEmail = user?.email, userPhone = user?.phone) }

                if (userId.isNotBlank() && userId != "guest_user") {
                    checkPendingCodOverdue(userId)
                }

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

                                    val totals = calculateCartTotalsUseCase(selectedItems, appConfig)
                                    val weightGrams = calculateTotalWeightGrams(selectedItems)
                                    _uiState.update { 
                                        it.copy(
                                            isCartLoading = false,
                                            checkoutItems = selectedItems,
                                            totals = totals,
                                            totalWeightGrams = weightGrams,
                                            isWeightLimitExceeded = weightGrams > it.maxWeightLimitGrams,
                                            error = if (selectedItems.isNotEmpty()) null else it.error
                                        ) 
                                    }
                                }
                            }
                        }
                        CheckoutSource.BUY_NOW -> {
                            checkoutSessionRepository.buyNowItem.collectLatest { item ->
                                val items = if (item != null) listOf(item) else emptyList()
                                val totals = calculateCartTotalsUseCase(items, appConfig)
                                val weightGrams = calculateTotalWeightGrams(items)
                                _uiState.update { 
                                    it.copy(
                                        isCartLoading = false,
                                        checkoutItems = items,
                                        totals = totals,
                                        totalWeightGrams = weightGrams,
                                        isWeightLimitExceeded = weightGrams > it.maxWeightLimitGrams
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
            val weightGrams = calculateTotalWeightGrams(updatedItems)
            state.copy(
                checkoutItems = updatedItems,
                totals = calculateCartTotalsUseCase(updatedItems, appConfig),
                totalWeightGrams = weightGrams,
                isWeightLimitExceeded = weightGrams > state.maxWeightLimitGrams
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
        val currentState = _uiState.value
        if (method == PaymentMethod.COD) {
            if (!currentState.isCodAvailable) {
                _uiState.update { it.copy(error = "Cash on delivery is currently disabled.") }
                return
            }
            if (_hasPendingCodOverdue.value) {
                _uiState.update { it.copy(error = "COD is unavailable due to an overdue pending order. Please choose an alternate payment method.") }
                return
            }
        }
        if (method == PaymentMethod.ONLINE && !currentState.isOnlinePaymentEnabled) {
            _uiState.update { it.copy(error = "Online payments are currently disabled.") }
            return
        }
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
        val currentState = _uiState.value

        if (currentState.isCheckoutFrozen) {
            _uiState.update { it.copy(error = currentState.checkoutFrozenReason ?: "Checkout is temporarily paused.") }
            return
        }

        if (!paymentResilienceManager.canAttemptPayment()) {
            val waitTime = paymentResilienceManager.getRemainingCooldownMinutes()
            _uiState.update { it.copy(error = "System maintenance chal rahi hai. Kripya $waitTime min baad prayas karein.") }
            return
        }

        if (currentState.isWeightLimitExceeded) {
            _uiState.update { it.copy(error = "Cart weight exceeds maximum allowed capacity (50 kg). Please reduce items.") }
            return
        }

        if (currentState.selectedPaymentMethod == PaymentMethod.COD && currentState.hasPendingCodOverdue) {
            _uiState.update { it.copy(error = "COD order pending for more than 24 hours. Please pay online or contact support.") }
            return
        }

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
            val fbUser = firebaseAuth.currentUser
            if (fbUser != null && !fbUser.isAnonymous) {
                userId = fbUser.uid
                timber.log.Timber.w("userId was blank, recovered from FirebaseAuth: $userId")
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
                lng = lng,
                deliverySlotId = currentState.selectedDeliverySlotId,
                vleCode = currentState.appliedVleCode
            ).collect { resource ->
                when (resource) {
                    is Resource.Loading -> { } // Already set above
                    is Resource.Success -> {
                        paymentResilienceManager.recordSuccess()
                        resource.data?.let { data ->
                            pendingOrderId = data.orderId
                            pendingOrderOtp = data.customerOtp
                            pendingRazorpayOrderId = data.razorpayOrderId
                            if (currentState.selectedPaymentMethod == PaymentMethod.ONLINE) {
                                val rzpOrderId = data.razorpayOrderId
                                if (rzpOrderId.isNullOrBlank()) {
                                    _uiState.update {
                                        it.copy(
                                            checkoutResource = Resource.Error("Payment init failed: missing Razorpay Order ID. Please try again."),
                                            error = "Payment init failed. Please try again."
                                        )
                                    }
                                    return@collect
                                }
                                _uiState.update { it.copy(checkoutResource = null) }
                                _uiEvent.emit(
                                    CheckoutUiEvent.InitiatePayment(
                                        amount = data.totalAmount,
                                        orderId = data.orderId,
                                        razorpayOrderId = rzpOrderId
                                    )
                                )
                            } else if (currentState.selectedPaymentMethod == PaymentMethod.WALLET) {
                                // Pay via wallet — call cloud function
                                walletRepository.payOrderWithWallet(data.orderId).collectLatest { walletRes ->
                                    when (walletRes) {
                                        is Resource.Success -> onOrderCompletionSuccess(data.totalAmount)
                                        is Resource.Error -> {
                                            paymentResilienceManager.recordFailure()
                                            _uiState.update { it.copy(
                                                checkoutResource = Resource.Error(walletRes.message ?: "Wallet payment failed"),
                                                error = walletRes.message
                                            )}
                                        }
                                        else -> Unit
                                    }
                                }
                            } else {
                                onOrderCompletionSuccess(data.totalAmount)
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

    fun selectDeliverySlot(slotId: String?) {
        _uiState.update { it.copy(selectedDeliverySlotId = slotId) }
    }

    fun onVleCodeChanged(code: String) {
        _uiState.update { it.copy(vleCodeInput = code, vleError = null) }
    }

    fun applyVleCode() {
        val code = _uiState.value.vleCodeInput.trim().uppercase()
        if (code.isBlank()) {
            _uiState.update { it.copy(vleError = "कृपया किसान मित्र कोड दर्ज करें") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isVleVerifying = true, vleError = null) }
            try {
                val snapshot = firestore.collection("vle_profiles")
                    .whereEqualTo("vleCode", code)
                    .limit(1)
                    .get()
                    .await()

                if (!snapshot.isEmpty) {
                    val doc = snapshot.documents.first()
                    val mitraName = doc.getString("name") ?: "किसान मित्र"
                    _uiState.update {
                        it.copy(
                            isVleVerifying = false,
                            appliedVleCode = code,
                            vleMessage = "सत्यापित: $mitraName ($code)",
                            vleError = null
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isVleVerifying = false,
                            vleError = "अमान्य किसान मित्र कोड ($code)"
                        )
                    }
                }
            } catch (e: Exception) {
                // If offline / query error, accept valid format KM-*
                if (code.startsWith("KM-") || code.length >= 4) {
                    _uiState.update {
                        it.copy(
                            isVleVerifying = false,
                            appliedVleCode = code,
                            vleMessage = "कोड लागू: $code",
                            vleError = null
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isVleVerifying = false,
                            vleError = "कोड सत्यापित नहीं हो सका"
                        )
                    }
                }
            }
        }
    }

    fun removeVleCode() {
        _uiState.update {
            it.copy(
                appliedVleCode = null,
                vleCodeInput = "",
                vleMessage = null,
                vleError = null
            )
        }
    }

    private fun calculateTotalWeightGrams(items: List<CartWithProduct>): Double {
        return items.sumOf { item ->
            val directWeightGrams = item.variant?.weightGrams?.toDouble()
                ?: item.product?.weightGrams?.toDouble()
            val finalWeightGrams = if (directWeightGrams != null && directWeightGrams > 0.0) {
                directWeightGrams
            } else {
                val weightStr = item.variant?.weight ?: item.product?.weight ?: ""
                parseWeightToGrams(weightStr)
            }
            val qty = item.cartItem.quantity
            finalWeightGrams * qty
        }
    }

    private fun parseWeightToGrams(raw: String): Double {
        if (raw.isBlank()) return 0.0
        val clean = raw.trim().lowercase()
        val regex = Regex("""^([\d.]+)\s*(kg|g|gm|gms|l|ltr|litre|litres|ml)?$""")
        val match = regex.find(clean) ?: return clean.toDoubleOrNull() ?: 0.0
        val value = match.groupValues[1].toDoubleOrNull() ?: 0.0
        val unit = match.groupValues.getOrNull(2) ?: "g"
        return when (unit) {
            "kg", "l", "ltr", "litre", "litres" -> value * 1000.0
            else -> value
        }
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
    val isCodAvailable: Boolean = true,
    val isCheckoutFrozen: Boolean = false,
    val checkoutFrozenReason: String? = null,
    val isHubLockedDown: Boolean = false,
    val paymentOptions: List<PaymentOption> = emptyList(),
    val selectedPaymentMethod: PaymentMethod = PaymentMethod.COD,
    val walletBalance: Double = 0.0,
    val checkoutResource: Resource<Unit>? = null,
    val error: String? = null,
    val isSessionExpired: Boolean = false,
    val userEmail: String? = null,
    val userPhone: String? = null,
    val totalWeightGrams: Double = 0.0,
    val maxWeightLimitGrams: Double = 50000.0,
    val isWeightLimitExceeded: Boolean = false,
    val selectedDeliverySlotId: String? = null,
    val vleCodeInput: String = "",
    val appliedVleCode: String? = null,
    val isVleVerifying: Boolean = false,
    val vleMessage: String? = null,
    val vleError: String? = null,
    val hasPendingCodOverdue: Boolean = false
)
