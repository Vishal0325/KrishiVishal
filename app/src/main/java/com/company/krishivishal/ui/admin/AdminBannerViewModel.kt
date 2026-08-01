package com.company.krishivishal.ui.admin

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.BannerItem
import com.company.krishivishal.data.repository.BannerRepository
import com.company.krishivishal.data.repository.StorageRepository
import com.company.krishivishal.core.util.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AdminBannerViewModel @Inject constructor(
    private val bannerRepository: BannerRepository,
    private val storageRepository: StorageRepository
) : ViewModel() {

    private val _banners = MutableStateFlow<Resource<List<BannerItem>>>(Resource.Loading())
    val banners: StateFlow<Resource<List<BannerItem>>> = _banners.asStateFlow()

    init {
        loadBanners()
    }

    fun loadBanners() {
        viewModelScope.launch {
            bannerRepository.getBanners().collect { resource ->
                _banners.value = resource
            }
        }
    }

    fun saveBanner(banner: BannerItem) {
        viewModelScope.launch {
            bannerRepository.saveBanner(banner).collect { resource ->
                if (resource is Resource.Success) {
                    loadBanners()
                }
            }
        }
    }

    fun deleteBanner(bannerId: String) {
        viewModelScope.launch {
            bannerRepository.deleteBanner(bannerId).collect { resource ->
                if (resource is Resource.Success) {
                    loadBanners()
                }
            }
        }
    }

    fun uploadBannerImage(bannerId: String, uri: Uri, onComplete: (String) -> Unit) {
        viewModelScope.launch {
            storageRepository.uploadBannerImage(bannerId, uri).collect { resource ->
                if (resource is Resource.Success) {
                    resource.data?.let { onComplete(it) }
                }
            }
        }
    }
}
