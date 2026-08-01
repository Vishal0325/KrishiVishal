package com.company.krishivishal.payment

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

sealed class PaymentResult {
    data class Success(val razorpayPaymentId: String?) : PaymentResult()
    data class Error(val code: Int, val description: String?) : PaymentResult()
}

@Singleton
class PaymentHandler @Inject constructor() {
    private val _paymentResult = MutableSharedFlow<PaymentResult>()
    val paymentResult = _paymentResult.asSharedFlow()

    suspend fun onPaymentSuccess(razorpayPaymentId: String?) {
        _paymentResult.emit(PaymentResult.Success(razorpayPaymentId))
    }

    suspend fun onPaymentError(code: Int, description: String?) {
        _paymentResult.emit(PaymentResult.Error(code, description))
    }
}
