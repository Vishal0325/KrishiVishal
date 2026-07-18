package com.company.krishivishal.ui.admin

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.data.model.Crop
import com.company.krishivishal.data.repository.CropRepository
import com.company.krishivishal.data.repository.StorageRepository
import com.company.krishivishal.utils.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AdminCropViewModel @Inject constructor(
    private val cropRepository: CropRepository,
    private val storageRepository: StorageRepository
) : ViewModel() {

    private val _crops = MutableStateFlow<Resource<List<Crop>>>(Resource.Loading())
    val crops: StateFlow<Resource<List<Crop>>> = _crops.asStateFlow()

    private val _uploadStatus = MutableStateFlow<Resource<String>?>(null)
    val uploadStatus: StateFlow<Resource<String>?> = _uploadStatus.asStateFlow()

    private val _saveStatus = MutableStateFlow<Resource<Unit>?>(null)
    val saveStatus: StateFlow<Resource<Unit>?> = _saveStatus.asStateFlow()

    init {
        loadCrops()
    }

    fun loadCrops() {
        viewModelScope.launch {
            cropRepository.getCrops().collectLatest {
                _crops.value = it
            }
        }
    }

    fun uploadCropImage(cropId: String, uri: Uri, onSuccess: (String) -> Unit) {
        viewModelScope.launch {
            storageRepository.uploadCropImage(cropId, uri).collectLatest { resource ->
                _uploadStatus.value = resource
                if (resource is Resource.Success) {
                    resource.data?.let { onSuccess(it) }
                }
            }
        }
    }

    fun saveCrop(crop: Crop) {
        viewModelScope.launch {
            cropRepository.saveCrop(crop).collectLatest {
                _saveStatus.value = it
                if (it is Resource.Success) {
                    loadCrops()
                }
            }
        }
    }

    fun deleteCrop(cropId: String) {
        viewModelScope.launch {
            cropRepository.deleteCrop(cropId).collectLatest {
                if (it is Resource.Success) {
                    loadCrops()
                }
            }
        }
    }

    fun resetSaveStatus() {
        _saveStatus.value = null
    }
}
