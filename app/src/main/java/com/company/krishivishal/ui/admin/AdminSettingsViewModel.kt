package com.company.krishivishal.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.data.model.AppConfig
import com.company.krishivishal.data.repository.ConfigRepository
import com.company.krishivishal.utils.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class AdminSettingsUiEvent {
    data class ShowSnackbar(val message: String) : AdminSettingsUiEvent()
}

@HiltViewModel
class AdminSettingsViewModel @Inject constructor(
    private val configRepository: ConfigRepository
) : ViewModel() {

    private val _config = MutableStateFlow<Resource<AppConfig>>(Resource.Loading())
    val config: StateFlow<Resource<AppConfig>> = _config.asStateFlow()

    private val _uiEvent = MutableSharedFlow<AdminSettingsUiEvent>()
    val uiEvent = _uiEvent.asSharedFlow()

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

    fun updateConfig(whatsapp: String, call: String, email: String) {
        viewModelScope.launch {
            val newConfig = AppConfig(
                whatsappNumber = whatsapp,
                supportCallNumber = call,
                supportEmail = email
            )
            configRepository.updateConfig(newConfig).collectLatest { resource ->
                when (resource) {
                    is Resource.Success -> {
                        _uiEvent.emit(AdminSettingsUiEvent.ShowSnackbar("Settings updated successfully"))
                    }
                    is Resource.Error -> {
                        _uiEvent.emit(AdminSettingsUiEvent.ShowSnackbar(resource.message ?: "Failed to update settings"))
                    }
                    else -> {}
                }
            }
        }
    }
}
