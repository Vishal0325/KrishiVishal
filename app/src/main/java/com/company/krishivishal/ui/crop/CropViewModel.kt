package com.company.krishivishal.ui.crop

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.data.model.Crop
import com.company.krishivishal.data.repository.CropRepository
import com.company.krishivishal.utils.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class CropViewModel @Inject constructor(
    private val cropRepository: CropRepository
) : ViewModel() {

    private val _crops = MutableStateFlow<Resource<List<Crop>>>(Resource.Loading())
    val crops: StateFlow<Resource<List<Crop>>> = _crops.asStateFlow()

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
}
