package com.company.krishivishal.domain.usecase.home

import com.company.krishivishal.data.model.BannerItem
import com.company.krishivishal.data.model.Brand
import com.company.krishivishal.data.model.Category
import com.company.krishivishal.data.model.Crop
import com.company.krishivishal.data.repository.BannerRepository
import com.company.krishivishal.data.repository.BrandRepository
import com.company.krishivishal.data.repository.CategoryRepository
import com.company.krishivishal.data.repository.CropRepository
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import javax.inject.Inject

/**
 * Aggregated data model for the Home Feed.
 */
data class HomeFeedData(
    val banners: List<BannerItem> = emptyList(),
    val categories: List<Category> = emptyList(),
    val crops: List<Crop> = emptyList(),
    val brands: List<Brand> = emptyList()
)

/**
 * UseCase to fetch and aggregate all static/catalog data for the Home screen.
 */
class GetHomeFeedUseCase @Inject constructor(
    private val bannerRepository: BannerRepository,
    private val categoryRepository: CategoryRepository,
    private val cropRepository: CropRepository,
    private val brandRepository: BrandRepository
) {
    operator fun invoke(): Flow<HomeFeedData> {
        return combine(
            bannerRepository.getBanners(),
            categoryRepository.getCategories(),
            cropRepository.getCrops(),
            brandRepository.getBrands()
        ) { banners, categories, crops, brands ->
            HomeFeedData(
                banners = banners.data ?: emptyList(),
                categories = categories.data ?: emptyList(),
                crops = crops.data ?: emptyList(),
                brands = brands.data ?: emptyList()
            )
        }
    }
}
