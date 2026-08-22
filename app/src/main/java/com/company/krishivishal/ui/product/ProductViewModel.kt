package com.company.krishivishal.ui.product

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.data.repository.ProductRepository
import com.company.krishivishal.core.util.Resource
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

    private val _categoryProducts = MutableStateFlow<Resource<List<Product>>>(Resource.Idle())
    val categoryProducts: StateFlow<Resource<List<Product>>> = _categoryProducts.asStateFlow()

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

    fun loadProductsByCategory(category: String) {
        viewModelScope.launch {
            productRepository.getProductsByCategory(category).collectLatest { resource ->
                _categoryProducts.value = resource
            }
        }
    }

    fun loadProductsBySubCategory(category: String, subCategory: String) {
        viewModelScope.launch {
            // Reusing getProductsByCategory but filtering locally in the repository or adding a new method
            productRepository.getProductsByCategory(category).collectLatest { resource ->
                if (resource is Resource.Success) {
                    val filtered = resource.data?.filter { it.subCategory == subCategory } ?: emptyList()
                    _categoryProducts.value = Resource.Success(filtered)
                } else {
                    _categoryProducts.value = resource
                }
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
