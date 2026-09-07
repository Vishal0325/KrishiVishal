package com.company.krishivishal.payment

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

sealed class PaymentResult {
    data class Success(
        val razorpayPaymentId: String?,
        val razorpayOrderId: String? = null,
        val razorpaySignature: String? = null
    ) : PaymentResult()

    data class Error(
        val code: Int,
        val description: String?
    ) : PaymentResult()
}

/**
 * PaymentHandler — global Razorpay result bus.
 *
 * [paymentResult]        → used by CheckoutViewModel for order payments.
 * [walletTopUpResult]    → used by WalletViewModel for wallet top-up payments.
 *
 * MainActivity sets [pendingContext] before opening Razorpay to route
 * the callback to the correct stream.
 */
@Singleton
class PaymentHandler @Inject constructor() {
    private val _paymentResult = MutableSharedFlow<PaymentResult>()
    val paymentResult = _paymentResult.asSharedFlow()

    private val _walletTopUpResult = MutableSharedFlow<PaymentResult>()
    val walletTopUpResult = _walletTopUpResult.asSharedFlow()

    /** Set before calling Razorpay to indicate which flow should receive the result. */
    var pendingContext: PaymentContext = PaymentContext.ORDER

    enum class PaymentContext { ORDER, WALLET_TOP_UP }

    suspend fun onPaymentSuccess(
        razorpayPaymentId: String?,
        razorpayOrderId: String? = null,
        razorpaySignature: String? = null
    ) {
        val result = PaymentResult.Success(razorpayPaymentId, razorpayOrderId, razorpaySignature)
        if (pendingContext == PaymentContext.WALLET_TOP_UP) {
            _walletTopUpResult.emit(result)
        } else {
            _paymentResult.emit(result)
        }
        pendingContext = PaymentContext.ORDER // reset
    }

    suspend fun onPaymentError(code: Int, description: String?) {
        val result = PaymentResult.Error(code, description)
        if (pendingContext == PaymentContext.WALLET_TOP_UP) {
            _walletTopUpResult.emit(result)
        } else {
            _paymentResult.emit(result)
        }
        pendingContext = PaymentContext.ORDER // reset
    }
}

