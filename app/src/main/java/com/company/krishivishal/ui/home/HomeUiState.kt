package com.company.krishivishal.ui.home

import com.company.krishivishal.data.model.BannerItem
import com.company.krishivishal.data.model.Brand
import com.company.krishivishal.data.model.Category
import com.company.krishivishal.data.model.Crop
import com.company.krishivishal.data.model.Product
import com.company.krishivishal.utils.Resource

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
