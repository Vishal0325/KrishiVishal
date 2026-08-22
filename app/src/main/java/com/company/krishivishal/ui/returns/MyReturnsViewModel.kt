package com.company.krishivishal.ui.returns

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.ReturnRequest
import com.company.krishivishal.core.model.User
import com.company.krishivishal.data.repository.ReturnRepository
import com.company.krishivishal.domain.usecase.auth.GetCurrentUserUseCase
import com.company.krishivishal.core.util.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlinx.coroutines.ExperimentalCoroutinesApi

@HiltViewModel
class MyReturnsViewModel @Inject constructor(
    private val returnRepository: ReturnRepository,
    private val getCurrentUserUseCase: GetCurrentUserUseCase
) : ViewModel() {

    private val _returns = MutableStateFlow<List<ReturnRequest>>(emptyList())
    val returns: StateFlow<List<ReturnRequest>> = _returns.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    init {
        loadReturns()
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    private fun loadReturns() {
        viewModelScope.launch {
            getCurrentUserUseCase().flatMapLatest { user: User? ->
                val userId = user?.id ?: "guest_user"
                returnRepository.getReturnsByUser(userId)
            }.collectLatest { resource ->
                when (resource) {
                    is Resource.Success -> {
                        _returns.value = resource.data ?: emptyList()
                        _isLoading.value = false
                    }
                    is Resource.Error -> {
                        _isLoading.value = false
                    }
                    is Resource.Loading -> {
                        _isLoading.value = true
                    }
                    else -> {}
                }
            }
        }
    }
}
