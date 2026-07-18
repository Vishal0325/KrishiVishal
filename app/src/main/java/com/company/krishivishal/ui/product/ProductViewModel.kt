package com.company.krishivishal.ui.product

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.data.model.Product
import com.company.krishivishal.data.repository.ProductRepository
import com.company.krishivishal.utils.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ProductViewModel @Inject constructor(
    private val productRepository: ProductRepository
) : ViewModel() {

    private val _brandProducts = MutableStateFlow<Resource<List<Product>>>(Resource.Idle())
    val brandProducts: StateFlow<Resource<List<Product>>> = _brandProducts.asStateFlow()

    private val _cropProducts = MutableStateFlow<Resource<List<Product>>>(Resource.Idle())
    val cropProducts: StateFlow<Resource<List<Product>>> = _cropProducts.asStateFlow()

    private val _productDetail = MutableStateFlow<Resource<Product?>>(Resource.Idle())
    val productDetail: StateFlow<Resource<Product?>> = _productDetail.asStateFlow()

    fun loadProductsByBrand(brand: String) {
        viewModelScope.launch {
            productRepository.getProductsByBrand(brand).collectLatest { resource ->
                _brandProducts.value = resource
            }
        }
    }

    fun loadProductsByCrop(cropId: String, cropName: String) {
        viewModelScope.launch {
            productRepository.getProductsByCrop(cropId, cropName).collectLatest { resource ->
                _cropProducts.value = resource
            }
        }
    }

    fun loadProductDetails(productId: String) {
        viewModelScope.launch {
            productRepository.getProductDetails(productId).collectLatest { resource ->
                _productDetail.value = resource
            }
        }
    }
}
