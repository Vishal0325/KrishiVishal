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
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ProductViewModel @Inject constructor(
    private val productRepository: ProductRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProductUiState())
    val uiState: StateFlow<ProductUiState> = _uiState.asStateFlow()

    val brandProducts: StateFlow<Resource<List<Product>>> = uiState.map { it.brandProducts }
        .stateIn(viewModelScope, SharingStarted.Eagerly, Resource.Idle())
    val categoryProducts: StateFlow<Resource<List<Product>>> = uiState.map { it.categoryProducts }
        .stateIn(viewModelScope, SharingStarted.Eagerly, Resource.Idle())
    val cropProducts: StateFlow<Resource<List<Product>>> = uiState.map { it.cropProducts }
        .stateIn(viewModelScope, SharingStarted.Eagerly, Resource.Idle())
    val productDetail: StateFlow<Resource<Product?>> = uiState.map { it.productDetail }
        .stateIn(viewModelScope, SharingStarted.Eagerly, Resource.Idle())

    fun loadProductsByBrand(brand: String) {
        viewModelScope.launch {
            productRepository.getProductsByBrand(brand).collectLatest { resource ->
                _uiState.update { it.copy(brandProducts = resource) }
            }
        }
    }

    fun loadProductsByCategory(category: String) {
        viewModelScope.launch {
            productRepository.getProductsByCategory(category).collectLatest { resource ->
                _uiState.update { it.copy(categoryProducts = resource) }
            }
        }
    }

    fun loadProductsBySubCategory(category: String, subCategory: String) {
        viewModelScope.launch {
            // Reusing getProductsByCategory but filtering locally in the repository or adding a new method
            productRepository.getProductsByCategory(category).collectLatest { resource ->
                if (resource is Resource.Success) {
                    val filtered = resource.data?.filter { it.subCategory == subCategory } ?: emptyList()
                    _uiState.update { it.copy(categoryProducts = Resource.Success(filtered)) }
                } else {
                    _uiState.update { it.copy(categoryProducts = resource) }
                }
            }
        }
    }

    fun loadProductsByCrop(cropId: String, cropName: String) {
        viewModelScope.launch {
            productRepository.getProductsByCrop(cropId, cropName).collectLatest { resource ->
                _uiState.update { it.copy(cropProducts = resource) }
            }
        }
    }

    fun loadProductDetails(productId: String) {
        viewModelScope.launch {
            productRepository.getProductDetails(productId).collectLatest { resource ->
                _uiState.update { it.copy(productDetail = resource) }
            }
        }
    }
}

data class ProductUiState(
    val brandProducts: Resource<List<Product>> = Resource.Idle(),
    val categoryProducts: Resource<List<Product>> = Resource.Idle(),
    val cropProducts: Resource<List<Product>> = Resource.Idle(),
    val productDetail: Resource<Product?> = Resource.Idle()
)
