package com.company.krishivishal.ui.support

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.AppConfig
import com.company.krishivishal.data.repository.ConfigRepository
import com.company.krishivishal.core.util.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SupportViewModel @Inject constructor(
    private val configRepository: ConfigRepository
) : ViewModel() {

    private val _config = MutableStateFlow<Resource<AppConfig>>(Resource.Loading())
    val config: StateFlow<Resource<AppConfig>> = _config.asStateFlow()

    init {
        loadConfig()
    }

    private fun loadConfig() {
        viewModelScope.launch {
            configRepository.getConfig().collectLatest { resource ->
                _config.value = resource
            }
        }
    }
}
