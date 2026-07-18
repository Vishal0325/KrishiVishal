package com.company.krishivishal.ui.base

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import timber.log.Timber

abstract class BaseViewModel : ViewModel() {

    protected fun <T> handleResource(
        flow: kotlinx.coroutines.flow.Flow<Resource<T>>,
        stateFlow: MutableStateFlow<Resource<T>>
    ) {
        viewModelScope.launch {
            flow.collect { resource ->
                stateFlow.value = resource
                if (resource is Resource.Error) {
                    Timber.e(resource.message)
                }
            }
        }
    }
}
