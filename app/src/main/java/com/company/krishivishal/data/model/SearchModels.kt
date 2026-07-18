package com.company.krishivishal.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.firebase.Timestamp

/**
 * Recent Search Entity for Room Database
 * Stores user's last 5 search queries
 */
@Entity(tableName = "recent_searches")
data class RecentSearch(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val query: String,
    val searchedAt: Long = System.currentTimeMillis()
)

/**
 * Search Result Item
 * Represents a product returned from search
 */
data class SearchResult(
    val id: String,
    val name: String,
    val price: Double,
    val discountedPrice: Double,
    val images: List<String>,
    val category: String,
    val brand: String,
    val rating: Float = 0f,
    val reviewCount: Int = 0,
    val inStock: Boolean = true,
    val cropAssociatedIds: List<String> = emptyList()
)

/**
 * Search UI State
 * Manages all search-related UI states
 */
data class SearchUiState(
    val query: String = "",
    val results: List<SearchResult> = emptyList(),
    val recentSearches: List<RecentSearch> = emptyList(),
    val isLoading: Boolean = false,
    val isEmpty: Boolean = false,
    val error: String? = null
)

/**
 * Search Category Tag
 * For displaying category tags below product names
 */
data class SearchCategoryTag(
    val category: String,
    val icon: String? = null,
    val color: String = "#2D7D5F" // Primary green
)
