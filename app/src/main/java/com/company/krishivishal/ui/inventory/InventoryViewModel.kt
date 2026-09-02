package com.company.krishivishal.ui.inventory

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.Batch
import com.company.krishivishal.core.model.Sku
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.data.repository.SkuRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class InventoryUiState(
    val isLoading: Boolean = false,
    val lowStockSkus: List<Sku> = emptyList(),
    val expiringBatches: List<Batch> = emptyList(),
    val scannedSku: Sku? = null,
    val errorMessage: String? = null,
    val successMessage: String? = null
)

@HiltViewModel
class InventoryViewModel @Inject constructor(
    private val skuRepository: SkuRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(InventoryUiState())
    val uiState: StateFlow<InventoryUiState> = _uiState.asStateFlow()

    init {
        loadDashboardData()
    }

    fun loadDashboardData() {
        viewModelScope.launch {
            skuRepository.getLowStockSkus().collect { res ->
                when (res) {
                    is Resource.Loading -> _uiState.update { it.copy(isLoading = true) }
                    is Resource.Success -> _uiState.update {
                        it.copy(isLoading = false, lowStockSkus = res.data ?: emptyList())
                    }
                    is Resource.Error -> _uiState.update {
                        it.copy(isLoading = false, errorMessage = res.message)
                    }
                }
            }
        }

        viewModelScope.launch {
            skuRepository.getExpiringBatches(thresholdDays = 45).collect { res ->
                when (res) {
                    is Resource.Success -> _uiState.update {
                        it.copy(expiringBatches = res.data ?: emptyList())
                    }
                    is Resource.Error -> _uiState.update {
                        it.copy(errorMessage = res.message)
                    }
                    else -> {}
                }
            }
        }
    }

    fun lookupBarcode(barcode: String) {
        viewModelScope.launch {
            skuRepository.getSkuByBarcode(barcode).collect { res ->
                when (res) {
                    is Resource.Loading -> _uiState.update { it.copy(isLoading = true) }
                    is Resource.Success -> _uiState.update {
                        it.copy(isLoading = false, scannedSku = res.data, errorMessage = null)
                    }
                    is Resource.Error -> _uiState.update {
                        it.copy(isLoading = false, errorMessage = res.message, scannedSku = null)
                    }
                }
            }
        }
    }

    fun adjustStock(skuCode: String, adjustment: Int, reason: String) {
        viewModelScope.launch {
            skuRepository.adjustInventory(skuCode, adjustment, reason).collect { res ->
                when (res) {
                    is Resource.Loading -> _uiState.update { it.copy(isLoading = true) }
                    is Resource.Success -> {
                        _uiState.update {
                            it.copy(isLoading = false, successMessage = "Stock updated successfully")
                        }
                        loadDashboardData()
                    }
                    is Resource.Error -> _uiState.update {
                        it.copy(isLoading = false, errorMessage = res.message)
                    }
                }
            }
        }
    }

    fun clearMessages() {
        _uiState.update { it.copy(errorMessage = null, successMessage = null) }
    }
}
