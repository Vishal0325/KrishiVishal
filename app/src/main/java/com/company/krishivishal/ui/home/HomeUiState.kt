package com.company.krishivishal.ui.home

import com.company.krishivishal.core.model.BannerItem
import com.company.krishivishal.core.model.Brand
import com.company.krishivishal.core.model.Category
import com.company.krishivishal.core.model.Crop
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.util.Resource

/**
 * Atomic UI State for the Home Screen.
 */
data class HomeUiState(
    val banners: List<BannerItem> = emptyList(),
    val categories: List<Category> = emptyList(),
    val crops: List<Crop> = emptyList(),
    val brands: List<Brand> = emptyList(),
    val products: Resource<List<Product>> = Resource.Loading(),
    val wishlistItems: List<Product> = emptyList(),
    val cartCount: Int = 0,
    val searchQuery: String = "",
    val sortOrder: ProductSortOrder = ProductSortOrder.DEFAULT,
    val isRefreshing: Boolean = false,
    val isLoadingFeed: Boolean = true
)
