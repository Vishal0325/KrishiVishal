package com.company.krishivishal.ui.category

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.Category
import com.company.krishivishal.data.repository.CategoryRepository
import com.company.krishivishal.core.util.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SubCategoryViewModel @Inject constructor(
    private val repository: CategoryRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<Resource<Category?>>(Resource.Loading())
    val uiState: StateFlow<Resource<Category?>> = _uiState.asStateFlow()

    fun loadCategory(categoryId: String) {
        viewModelScope.launch {
            repository.getCategoryById(categoryId).collectLatest { resource ->
                _uiState.value = resource
            }
        }
    }
}
