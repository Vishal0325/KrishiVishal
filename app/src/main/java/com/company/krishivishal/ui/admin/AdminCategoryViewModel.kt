package com.company.krishivishal.ui.admin

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.data.model.Category
import com.company.krishivishal.data.model.SubCategory
import com.company.krishivishal.data.repository.CategoryRepository
import com.company.krishivishal.data.repository.StorageRepository
import com.company.krishivishal.utils.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AdminCategoryViewModel @Inject constructor(
    private val categoryRepository: CategoryRepository,
    private val storageRepository: StorageRepository
) : ViewModel() {

    private val _categories = MutableStateFlow<Resource<List<Category>>>(Resource.Loading())
    val categories: StateFlow<Resource<List<Category>>> = _categories.asStateFlow()

    private val _uploadStatus = MutableStateFlow<Resource<String>?>(null)
    val uploadStatus: StateFlow<Resource<String>?> = _uploadStatus.asStateFlow()

    private val _editingCategory = MutableStateFlow<Category?>(null)
    val editingCategory: StateFlow<Category?> = _editingCategory.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _selectedIds = MutableStateFlow<Set<String>>(emptySet())
    val selectedIds: StateFlow<Set<String>> = _selectedIds.asStateFlow()

    val filteredCategories: StateFlow<Resource<List<Category>>> = combine(
        _categories,
        _searchQuery
    ) { resource, query ->
        if (query.isEmpty()) {
            resource
        } else {
            when (resource) {
                is Resource.Success -> {
                    val filteredList = resource.data?.filter { category ->
                        category.name.contains(query, ignoreCase = true)
                    }
                    Resource.Success(filteredList ?: emptyList())
                }
                else -> resource
            }
        }
    }.stateIn(viewModelScope, SharingStarted.Lazily, Resource.Loading())

    fun setEditingCategory(category: Category?) {
        _editingCategory.value = category
    }

    fun updateEditingCategory(category: Category) {
        _editingCategory.value = category
    }

    init {
        loadCategories()
    }

    fun loadCategories() {
        viewModelScope.launch {
            categoryRepository.getCategories().collectLatest {
                _categories.value = it
            }
        }
    }

    fun uploadCategoryImage(categoryId: String, uri: Uri, onSuccess: (String) -> Unit) {
        viewModelScope.launch {
            storageRepository.uploadCategoryImage(categoryId, uri).collectLatest { resource ->
                _uploadStatus.value = resource
                if (resource is Resource.Success) {
                    resource.data?.let { onSuccess(it) }
                }
            }
        }
    }

    fun uploadSubCategoryImage(subCategoryId: String, uri: Uri, onSuccess: (String) -> Unit) {
        viewModelScope.launch {
            storageRepository.uploadSubCategoryImage(subCategoryId, uri).collectLatest { resource ->
                _uploadStatus.value = resource
                if (resource is Resource.Success) {
                    resource.data?.let { onSuccess(it) }
                }
            }
        }
    }

    fun saveCategory(category: Category) {
        viewModelScope.launch {
            categoryRepository.updateCategory(category).collectLatest {
                if (it is Resource.Success) {
                    loadCategories()
                }
            }
        }
    }

    fun onSearchQueryChange(query: String) {
        _searchQuery.value = query
    }

    fun toggleSelection(id: String) {
        val current = _selectedIds.value.toMutableSet()
        if (current.contains(id)) current.remove(id)
        else current.add(id)
        _selectedIds.value = current
    }

    fun clearSelection() {
        _selectedIds.value = emptySet()
    }

    fun deleteSelectedCategories() {
        val ids = _selectedIds.value
        if (ids.isEmpty()) return

        viewModelScope.launch {
            val categoriesToDelete = (_categories.value as? Resource.Success)?.data?.filter { ids.contains(it.id) } ?: emptyList()
            categoriesToDelete.forEach { category ->
                categoryRepository.deleteCategory(category).collectLatest {}
            }
            clearSelection()
            loadCategories()
        }
    }
}
