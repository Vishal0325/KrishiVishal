package com.company.krishivishal.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.*
import com.company.krishivishal.data.repository.*
import com.company.krishivishal.domain.usecase.admin.DeleteProductUseCase
import com.company.krishivishal.domain.usecase.admin.UpdateProductUseCase
import com.company.krishivishal.domain.usecase.product.GetProductDetailsUseCase
import com.company.krishivishal.core.util.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

import com.company.krishivishal.domain.usecase.admin.BulkManageProductsUseCase
import android.net.Uri

@HiltViewModel
class AdminProductViewModel @Inject constructor(
    private val productRepository: ProductRepository,
    private val getProductDetailsUseCase: GetProductDetailsUseCase,
    private val updateProductUseCase: UpdateProductUseCase,
    private val deleteProductUseCase: DeleteProductUseCase,
    private val bulkManageUseCase: BulkManageProductsUseCase,
    private val categoryRepository: CategoryRepository,
    private val brandRepository: BrandRepository,
    private val cropRepository: CropRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AdminProductUiState())
    val uiState: StateFlow<AdminProductUiState> = _uiState.asStateFlow()

    private val _csvEvent = MutableSharedFlow<Resource<*>>()
    val csvEvent = _csvEvent.asSharedFlow()

    init {
        loadAllData()
    }

    fun importCsv(uri: Uri) {
        viewModelScope.launch {
            bulkManageUseCase.importFromCsv(uri).collect { 
                _csvEvent.emit(it)
                if (it is Resource.Success) loadProducts()
            }
        }
    }

    fun exportCsv() {
        viewModelScope.launch {
            bulkManageUseCase.exportToCsv().collect { 
                _csvEvent.emit(it)
            }
        }
    }

    private fun loadAllData() {
        loadProducts()
        loadCategories()
        loadBrands()
        loadCrops()
    }

    fun loadProducts() {
        viewModelScope.launch {
            productRepository.getProducts().collect { resource ->
                _uiState.update { it.copy(productsResource = resource) }
            }
        }
    }

    private fun loadCategories() {
        viewModelScope.launch {
            categoryRepository.getCategories().collect { resource ->
                _uiState.update { it.copy(categoriesResource = resource) }
            }
        }
    }

    private fun loadBrands() {
        viewModelScope.launch {
            brandRepository.getBrands().collect { resource ->
                _uiState.update { it.copy(brandsResource = resource) }
            }
        }
    }

    private fun loadCrops() {
        viewModelScope.launch {
            cropRepository.getCrops().collect { resource ->
                _uiState.update { it.copy(cropsResource = resource) }
            }
        }
    }

    fun loadProductDetails(productId: String) {
        viewModelScope.launch {
            getProductDetailsUseCase(productId).collect { resource ->
                _uiState.update { it.copy(productDetailResource = resource) }
            }
        }
    }

    fun saveProduct(product: Product) {
        viewModelScope.launch {
            updateProductUseCase(product).collect { resource ->
                _uiState.update { it.copy(saveStatus = resource) }
                if (resource is Resource.Success) {
                    loadProducts()
                }
            }
        }
    }

    fun deleteProduct(productId: String) {
        viewModelScope.launch {
            deleteProductUseCase(productId).collect { resource ->
                if (resource is Resource.Success) {
                    loadProducts()
                }
            }
        }
    }

    fun resetSaveStatus() {
        _uiState.update { it.copy(saveStatus = null) }
    }

    fun clearProductDetail() {
        _uiState.update { it.copy(productDetailResource = null) }
    }
}

data class AdminProductUiState(
    val productsResource: Resource<List<Product>> = Resource.Loading(),
    val productDetailResource: Resource<Product?>? = null,
    val saveStatus: Resource<Unit>? = null,
    val categoriesResource: Resource<List<Category>> = Resource.Loading(),
    val brandsResource: Resource<List<Brand>> = Resource.Loading(),
    val cropsResource: Resource<List<Crop>> = Resource.Loading()
)
