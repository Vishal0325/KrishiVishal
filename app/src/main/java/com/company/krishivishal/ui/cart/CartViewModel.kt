package com.company.krishivishal.ui.cart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.CartItem
import com.company.krishivishal.core.model.CartWithProduct
import com.company.krishivishal.core.model.availableStock
import com.company.krishivishal.data.repository.CartRepository
import com.company.krishivishal.domain.usecase.auth.GetCurrentUserUseCase
import com.company.krishivishal.domain.usecase.cart.*
import com.company.krishivishal.core.util.Constants
import com.company.krishivishal.core.util.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class CartViewModel @Inject constructor(
    private val cartRepository: CartRepository,
    private val calculateCartTotalsUseCase: CalculateCartTotalsUseCase,
    private val getCurrentUserUseCase: GetCurrentUserUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(CartUiState())
    val uiState: StateFlow<CartUiState> = _uiState.asStateFlow()

    init {
        loadCartItems()
    }

    private fun loadCartItems() {
        viewModelScope.launch {
            getCurrentUserUseCase().flatMapLatest { user ->
                val userId = user?.id ?: Constants.GUEST_USER_ID
                cartRepository.getCartWithProducts(userId)
            }.collectLatest { resource ->
                when (resource) {
                    is Resource.Loading -> {
                        _uiState.update { it.copy(isLoading = true) }
                    }
                    is Resource.Success -> {
                        val items = resource.data ?: emptyList()
                        val totals = calculateCartTotalsUseCase(items)
                        _uiState.update { 
                            it.copy(
                                isLoading = false,
                                cartItems = items,
                                totals = totals,
                                isAllSelected = items.isNotEmpty() && items.all { it.cartItem.isSelected },
                                error = null
                            ) 
                        }
                    }
                    is Resource.Error -> {
                        _uiState.update { it.copy(isLoading = false, error = resource.message) }
                    }
                    else -> {}
                }
            }
        }
    }

    fun updateQuantity(cartItem: CartItem, newQuantity: Int) {
        if (newQuantity < 1) return
        
        // NEW: Validate stock before updating (Phase 2.2)
        // Get CartWithProduct to check available stock
        val cartWithProduct = _uiState.value.cartItems.find { it.cartItem.id == cartItem.id }
        if (cartWithProduct != null) {
            val availableStock = cartWithProduct.availableStock()  // Using extension function
            if (newQuantity > availableStock) {
                _uiState.update { it.copy(error = "Only $availableStock available in stock") }
                return
            }
        }
        
        viewModelScope.launch {
            cartRepository.updateCartItem(cartItem.copy(quantity = newQuantity)).collectLatest { resource ->
                if (resource is Resource.Error) {
                    _uiState.update { it.copy(error = resource.message) }
                }
            }
        }
    }

    fun removeFromCart(cartItem: CartItem) {
        viewModelScope.launch {
            cartRepository.removeFromCart(cartItem).collectLatest { resource ->
                if (resource is Resource.Error) {
                    _uiState.update { it.copy(error = resource.message) }
                }
            }
        }
    }

    fun toggleSelection(itemId: String, isSelected: Boolean) {
        viewModelScope.launch {
            cartRepository.updateSelection(itemId, isSelected).collect()
        }
    }

    fun toggleSelectAll(isSelected: Boolean) {
        viewModelScope.launch {
            val userId = getCurrentUserUseCase().firstOrNull()?.id ?: Constants.GUEST_USER_ID
            cartRepository.selectAll(userId, isSelected).collect()
        }
    }

    fun deleteSelected() {
        viewModelScope.launch {
            val userId = getCurrentUserUseCase().firstOrNull()?.id ?: Constants.GUEST_USER_ID
            cartRepository.deleteSelected(userId).collect()
        }
    }

    // Helper for collect since it's not a terminal op for Flow
    private suspend fun Flow<*>.collect() {
        this.collectLatest { }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}

data class CartUiState(
    val isLoading: Boolean = false,
    val cartItems: List<CartWithProduct> = emptyList(),
    val totals: CartTotals = CartTotals(),
    val isAllSelected: Boolean = false,
    val error: String? = null
)
