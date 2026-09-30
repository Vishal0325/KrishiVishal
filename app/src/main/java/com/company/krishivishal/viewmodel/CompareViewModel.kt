package com.company.krishivishal.viewmodel

import androidx.lifecycle.ViewModel
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.data.repository.ProductRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

@HiltViewModel
class CompareViewModel @Inject constructor(
    private val productRepository: ProductRepository
) : ViewModel() {

    private val _comparedProducts = MutableStateFlow<List<Product>>(emptyList())
    val comparedProducts: StateFlow<List<Product>> = _comparedProducts.asStateFlow()

    fun addProduct(product: Product): Boolean {
        val current = _comparedProducts.value
        if (current.size >= 3) {
            return false
        }
        if (current.none { it.id == product.id }) {
            _comparedProducts.value = current + product
        }
        return true
    }

    fun removeProduct(productId: String) {
        _comparedProducts.value = _comparedProducts.value.filter { it.id != productId }
    }

    fun clearAll() {
        _comparedProducts.value = emptyList()
    }
}
