package com.company.krishivishal.ui.wallet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.WalletTransaction
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.data.repository.TopUpOrderResult
import com.company.krishivishal.data.repository.WalletRepository
import com.company.krishivishal.domain.usecase.auth.GetCurrentUserUseCase
import com.company.krishivishal.payment.PaymentHandler
import com.company.krishivishal.payment.PaymentResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class WalletUiEvent {
    /** App should open Razorpay SDK with these details for top-up payment. */
    data class InitiateTopUpPayment(
        val razorpayOrderId: String,
        val topUpId: String,
        val amount: Double,
        val keyId: String,
    ) : WalletUiEvent()
    data class TopUpSuccess(val amount: Double) : WalletUiEvent()
    data class ShowError(val message: String) : WalletUiEvent()
}

data class WalletUiState(
    val balance: Double = 0.0,
    val transactions: List<WalletTransaction> = emptyList(),
    val isHistoryLoading: Boolean = true,
    val isTopUpProcessing: Boolean = false,
    val topUpAmount: String = "",
    val error: String? = null,
)

@HiltViewModel
class WalletViewModel @Inject constructor(
    private val walletRepository: WalletRepository,
    private val getCurrentUserUseCase: GetCurrentUserUseCase,
    private val paymentHandler: PaymentHandler,
) : ViewModel() {

    private val _uiState = MutableStateFlow(WalletUiState())
    val uiState: StateFlow<WalletUiState> = _uiState.asStateFlow()

    private val _uiEvent = MutableSharedFlow<WalletUiEvent>()
    val uiEvent: SharedFlow<WalletUiEvent> = _uiEvent.asSharedFlow()

    // Stored for the verify step after Razorpay SDK returns
    private var pendingTopUpId: String? = null

    init {
        loadWallet()
        observeWalletTopUpResult()
    }

    /** Observe Razorpay wallet top-up results from PaymentHandler. */
    private fun observeWalletTopUpResult() {
        viewModelScope.launch {
            paymentHandler.walletTopUpResult.collect { result ->
                when (result) {
                    is PaymentResult.Success -> {
                        verifyTopUp(
                            razorpayPaymentId = result.razorpayPaymentId ?: "",
                            razorpayOrderId = result.razorpayOrderId ?: "",
                            razorpaySignature = result.razorpaySignature ?: ""
                        )
                    }
                    is PaymentResult.Error -> {
                        _uiState.update { it.copy(isTopUpProcessing = false) }
                        _uiEvent.emit(WalletUiEvent.ShowError("Payment failed: ${result.description}"))
                    }
                }
            }
        }
    }

    private fun loadWallet() {
        viewModelScope.launch {
            getCurrentUserUseCase().collectLatest { user ->
                val uid = user?.id ?: return@collectLatest

                // Real-time balance
                launch {
                    walletRepository.getBalanceStream(uid).collectLatest { balance ->
                        _uiState.update { it.copy(balance = balance) }
                    }
                }

                // Transaction history
                loadHistory()
            }
        }
    }

    fun loadHistory() {
        viewModelScope.launch {
            _uiState.update { it.copy(isHistoryLoading = true) }
            walletRepository.getHistory("").collectLatest { resource ->
                when (resource) {
                    is Resource.Success -> _uiState.update {
                        it.copy(
                            transactions = resource.data ?: emptyList(),
                            isHistoryLoading = false
                        )
                    }
                    is Resource.Error -> _uiState.update {
                        it.copy(isHistoryLoading = false, error = resource.message)
                    }
                    else -> Unit
                }
            }
        }
    }

    fun updateTopUpAmount(amount: String) {
        _uiState.update { it.copy(topUpAmount = amount) }
    }

    /** Must be called before opening Razorpay for top-up so the result is routed correctly. */
    fun setWalletPaymentContext() {
        paymentHandler.pendingContext = PaymentHandler.PaymentContext.WALLET_TOP_UP
    }

    /** Called when user taps "Add Money" button. Creates Razorpay order. */
    fun initiateTopUp() {
        val amountStr = _uiState.value.topUpAmount
        val amount = amountStr.toDoubleOrNull() ?: run {
            viewModelScope.launch { _uiEvent.emit(WalletUiEvent.ShowError("Please enter a valid amount.")) }
            return
        }
        if (amount < 10 || amount > 100000) {
            viewModelScope.launch { _uiEvent.emit(WalletUiEvent.ShowError("Amount must be between ₹10 and ₹1,00,000.")) }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isTopUpProcessing = true) }
            walletRepository.createTopUpOrder(amount).collectLatest { resource ->
                when (resource) {
                    is Resource.Success -> {
                        val result = resource.data!!
                        pendingTopUpId = result.topUpId
                        _uiState.update { it.copy(isTopUpProcessing = false) }
                        _uiEvent.emit(WalletUiEvent.InitiateTopUpPayment(
                            razorpayOrderId = result.razorpayOrderId,
                            topUpId = result.topUpId,
                            amount = result.amount,
                            keyId = result.keyId,
                        ))
                    }
                    is Resource.Error -> {
                        _uiState.update { it.copy(isTopUpProcessing = false) }
                        _uiEvent.emit(WalletUiEvent.ShowError(resource.message ?: "Failed to initiate top-up."))
                    }
                    else -> Unit
                }
            }
        }
    }

    /** Called after Razorpay SDK returns success for a top-up payment. */
    fun verifyTopUp(
        razorpayPaymentId: String,
        razorpayOrderId: String,
        razorpaySignature: String
    ) {
        val topUpId = pendingTopUpId ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isTopUpProcessing = true) }
            walletRepository.verifyTopUp(topUpId, razorpayPaymentId, razorpayOrderId, razorpaySignature)
                .collectLatest { resource ->
                    when (resource) {
                        is Resource.Success -> {
                            val amount = resource.data ?: 0.0
                            _uiState.update { it.copy(isTopUpProcessing = false, topUpAmount = "") }
                            pendingTopUpId = null
                            _uiEvent.emit(WalletUiEvent.TopUpSuccess(amount))
                            loadHistory()
                        }
                        is Resource.Error -> {
                            _uiState.update { it.copy(isTopUpProcessing = false) }
                            _uiEvent.emit(WalletUiEvent.ShowError(resource.message ?: "Payment verification failed."))
                        }
                        else -> Unit
                    }
                }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
