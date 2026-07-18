package com.company.krishivishal.ui.category

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.data.model.Category
import com.company.krishivishal.data.repository.CategoryRepository
import com.company.krishivishal.utils.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class CategoryViewModel @Inject constructor(
    private val repository: CategoryRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<Resource<List<Category>>>(Resource.Loading())
    val uiState: StateFlow<Resource<List<Category>>> = _uiState.asStateFlow()

    init {
        loadCategories()
    }

    private fun loadCategories() {
        viewModelScope.launch {
            repository.getCategories().collectLatest { resource ->
                _uiState.value = resource
            }
        }
    }
}
