package com.company.krishivishal.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.data.local.dao.RecentSearchDao
import com.company.krishivishal.core.model.RecentSearch
import com.company.krishivishal.core.model.SearchUiState
import com.company.krishivishal.core.model.VoiceIntentResult
import com.company.krishivishal.data.repository.ProductSearchRepository
import com.company.krishivishal.core.util.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject
import com.company.krishivishal.core.model.isAvailable
import com.company.krishivishal.core.model.getEffectiveSellingPrice
import com.company.krishivishal.core.model.getEffectiveMrp

@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val searchRepository: ProductSearchRepository,
    private val recentSearchDao: RecentSearchDao
) : ViewModel() {

    private val _queryFlow = MutableStateFlow("")
    
    private val _searchState = MutableStateFlow(SearchUiState())
    val searchState: StateFlow<SearchUiState> = _searchState.asStateFlow()

    init {
        setupSearchFlow()
        loadRecentSearches()
    }

    /**
     * Reactive search pipeline:
     * Debounce (300ms) + filter non-blank + distinct + fetch
     */
    private fun setupSearchFlow() {
        _queryFlow
            .debounce(300L)
            .distinctUntilChanged()
            .filter { it.isNotBlank() }
            .flatMapLatest { query ->
                searchRepository.searchProductsByKeywords(query, _searchState.value.detectedIntent)
            }
            .onEach { resource ->
                handleSearchResource(resource)
            }
            .launchIn(viewModelScope)
    }

    /**
     * Triggered when speech-to-text returns a voice search query.
     * Extracts AI intent on Dispatchers.IO and injects enriched keywords & category filter.
     */
    fun onVoiceSearchResult(spokenText: String) {
        val cleanQuery = spokenText.trim()
        if (cleanQuery.isBlank()) return

        _searchState.update { it.copy(query = cleanQuery, isLoading = true, error = null) }

        viewModelScope.launch(Dispatchers.IO) {
            val intent = searchRepository.extractVoiceIntent(cleanQuery)
            Timber.d("Voice search extracted intent: $intent")

            _searchState.update {
                it.copy(
                    selectedCategory = intent.category,
                    detectedIntent = intent
                )
            }

            searchRepository.searchProductsByKeywords(cleanQuery, intent)
                .collect { resource ->
                    handleSearchResource(resource)
                }
        }
    }

    private fun handleSearchResource(resource: Resource<List<com.company.krishivishal.core.model.Product>>) {
        when (resource) {
            is Resource.Loading -> {
                _searchState.update { it.copy(isLoading = true, error = null) }
            }
            is Resource.Success -> {
                val products = resource.data ?: emptyList()
                // Convert Product to SearchResult for the UI
                val searchResults = products.map { p ->
                    com.company.krishivishal.core.model.SearchResult(
                        id = p.id,
                        name = p.name,
                        price = p.getEffectiveMrp(),
                        discountedPrice = p.getEffectiveSellingPrice(),
                        images = p.images.ifEmpty { listOf(p.imageUrl) },
                        category = p.category,
                        brand = p.brand,
                        rating = p.rating,
                        reviewCount = p.reviewsCount,
                        inStock = p.isAvailable(),
                        cropAssociatedIds = p.associatedCropIds,
                        cropAssociatedNames = p.associatedCropNames
                    )
                }
                
                _searchState.update { it.copy(
                    results = searchResults,
                    isLoading = false,
                    isEmpty = searchResults.isEmpty() && _queryFlow.value.isNotBlank(),
                    error = null
                ) }

                if (searchResults.isNotEmpty()) {
                    saveSearchQuery(_queryFlow.value)
                }
            }
            is Resource.Error -> {
                _searchState.update { it.copy(
                    isLoading = false, 
                    error = resource.message ?: "An error occurred"
                ) }
            }
            is Resource.Idle -> {
                _searchState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun updateSearchQuery(query: String) {
        _searchState.update { it.copy(query = query, selectedCategory = null, detectedIntent = null) }
        _queryFlow.value = query
        if (query.isBlank()) {
            _searchState.update { it.copy(results = emptyList(), isLoading = false, isEmpty = false, error = null, selectedCategory = null, detectedIntent = null) }
        }
    }

    private fun loadRecentSearches() {
        viewModelScope.launch {
            recentSearchDao.getRecentSearches().collect { list ->
                _searchState.update { it.copy(recentSearches = list) }
            }
        }
    }

    private fun saveSearchQuery(query: String) {
        viewModelScope.launch {
            recentSearchDao.insertRecentSearch(RecentSearch(query = query.trim()))
        }
    }

    fun clearRecentSearch(search: RecentSearch) {
        viewModelScope.launch {
            recentSearchDao.deleteRecentSearch(search)
        }
    }

    fun clearAllRecentSearches() {
        viewModelScope.launch {
            recentSearchDao.clearAllRecentSearches()
        }
    }

    fun searchFromRecent(query: String) {
        updateSearchQuery(query)
    }
}
