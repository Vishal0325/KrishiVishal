package com.company.krishivishal.ui.admin

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.Brand
import com.company.krishivishal.data.repository.BrandRepository
import com.company.krishivishal.data.repository.StorageRepository
import com.company.krishivishal.core.util.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AdminBrandViewModel @Inject constructor(
    private val brandRepository: BrandRepository,
    private val storageRepository: StorageRepository
) : ViewModel() {

    private val _brands = MutableStateFlow<Resource<List<Brand>>>(Resource.Loading())
    val brands: StateFlow<Resource<List<Brand>>> = _brands.asStateFlow()

    private val _uploadStatus = MutableStateFlow<Resource<String>?>(null)
    val uploadStatus: StateFlow<Resource<String>?> = _uploadStatus.asStateFlow()

    init {
        loadBrands()
    }

    fun loadBrands() {
        viewModelScope.launch {
            brandRepository.getBrands().collectLatest {
                _brands.value = it
            }
        }
    }

    fun uploadBrandImage(brandId: String, uri: Uri, onSuccess: (String) -> Unit) {
        viewModelScope.launch {
            storageRepository.uploadBrandImage(brandId, uri).collectLatest { resource ->
                _uploadStatus.value = resource
                if (resource is Resource.Success) {
                    resource.data?.let { onSuccess(it) }
                }
            }
        }
    }

    fun saveBrand(brand: Brand) {
        viewModelScope.launch {
            brandRepository.saveBrand(brand).collectLatest {
                if (it is Resource.Success) {
                    loadBrands()
                }
            }
        }
    }

    fun deleteBrand(brandId: String) {
        viewModelScope.launch {
            brandRepository.deleteBrand(brandId).collectLatest {
                if (it is Resource.Success) {
                    loadBrands()
                }
            }
        }
    }
}
