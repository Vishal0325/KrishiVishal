package com.company.krishivishal.data.repository

import com.company.krishivishal.data.model.CartWithProduct
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CheckoutSessionRepository @Inject constructor() {
    private val _buyNowItem = MutableStateFlow<CartWithProduct?>(null)
    val buyNowItem: StateFlow<CartWithProduct?> = _buyNowItem.asStateFlow()

    fun setBuyNowItem(item: CartWithProduct?) {
        _buyNowItem.value = item
    }

    fun clear() {
        _buyNowItem.value = null
    }
}
