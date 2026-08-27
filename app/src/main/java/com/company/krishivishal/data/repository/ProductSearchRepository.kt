package com.company.krishivishal.data.repository
 
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.SearchUnderstandingUtil
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.tasks.await
import com.company.krishivishal.data.mapper.toProduct
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Product Repository for Search Operations
 * Handles both local Room and Firestore search with intelligent ranking.
 */
@Singleton
class ProductSearchRepository @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val productDao: com.company.krishivishal.data.local.ProductDao
) {

    /**
     * Search products by keywords and partial strings (2-3 chars or full word).
     */
    fun searchProductsByKeywords(query: String): Flow<Resource<List<Product>>> = flow {
        try {
            val cleanQuery = query.trim()
            if (cleanQuery.isBlank()) {
                emit(Resource.Success(emptyList()))
                return@flow
            }

            emit(Resource.Loading())

            val intent = SearchUnderstandingUtil.understandQuery(cleanQuery)
            Timber.d("Search intent: $intent")

            // 1. Fetch local cached products matching query immediately (fast offline & online)
            val localMatches = try {
                val directLocal = productDao.searchProductsLocally(cleanQuery)
                val keywordLocals = intent.keywords.flatMap { kw ->
                    if (kw.isNotBlank() && kw.length >= 2) productDao.searchProductsLocally(kw) else emptyList()
                }
                (directLocal + keywordLocals).distinctBy { it.id }.filter { it.isActive }
            } catch (e: Exception) {
                emptyList()
            }

            // 2. Fetch targeted remote products from Firestore using searchKeywords
            val remoteProducts = try {
                val baseQuery = firestore.collection("products").whereEqualTo("isActive", true)
                
                val snapshot = if (intent.keywords.isNotEmpty()) {
                    // Firestore limits whereArrayContainsAny to 10 items
                    val limitedKeywords = intent.keywords.take(10)
                    baseQuery.whereArrayContainsAny("searchKeywords", limitedKeywords)
                        .limit(50)
                        .get()
                        .await()
                } else {
                    baseQuery.limit(100).get().await()
                }

                val parsed = snapshot.documents.mapNotNull { it.toProduct() }
                if (parsed.isNotEmpty()) {
                    try {
                        productDao.insertProducts(parsed)
                        Timber.d("Local cache updated with ${parsed.size} targeted search results")
                    } catch (e: Exception) {
                        Timber.w(e, "Failed to cache products locally")
                    }
                }
                parsed
            } catch (e: Exception) {
                Timber.w(e, "Firestore fetch failed - check if 'searchKeywords' field exists in products")
                emptyList()
            }

            val combinedProducts = (localMatches + remoteProducts).distinctBy { it.id }

            // 3. Intelligent scoring and ranking
            val rankedProducts = combinedProducts.map { product ->
                var score = 0

                // Direct exact / substring match on user query (handles "su", "kri", "sulpher", etc.)
                if (product.name.contains(cleanQuery, ignoreCase = true)) score += 50
                if (product.brand.contains(cleanQuery, ignoreCase = true)) score += 30
                if (product.technicalName.contains(cleanQuery, ignoreCase = true)) score += 30
                if (product.composition.contains(cleanQuery, ignoreCase = true)) score += 25
                if (product.category.contains(cleanQuery, ignoreCase = true)) score += 20
                if (product.subCategory.contains(cleanQuery, ignoreCase = true)) score += 15
                if (product.cropName.contains(cleanQuery, ignoreCase = true)) score += 15

                // Keyword match
                intent.keywords.forEach { keyword ->
                    if (keyword.isNotBlank()) {
                        if (product.name.contains(keyword, ignoreCase = true)) score += 15
                        if (product.technicalName.contains(keyword, ignoreCase = true)) score += 12
                        if (product.composition.contains(keyword, ignoreCase = true)) score += 10
                        if (product.brand.contains(keyword, ignoreCase = true)) score += 8
                        if (product.category.contains(keyword, ignoreCase = true)) score += 5
                        if (product.subCategory.contains(keyword, ignoreCase = true)) score += 4
                        if (product.cropName.contains(keyword, ignoreCase = true)) score += 4
                    }
                }

                if (intent.crop != null && (product.associatedCropNames.contains(intent.crop)
                            || product.cropName.contains(intent.crop, ignoreCase = true))) score += 20
                if (intent.problem != null && product.tags.any {
                        it.contains(intent.problem, ignoreCase = true) }) score += 15

                product to score
            }.filter { it.second > 0 }
             .sortedByDescending { it.second }
             .map { it.first }

            emit(Resource.Success(rankedProducts))

        } catch (e: Exception) {
            Timber.e(e, "Search failed for query: $query")
            try {
                val fallback = productDao.searchProductsLocally(query.trim()).filter { it.isActive }
                emit(Resource.Success(fallback))
            } catch (ex: Exception) {
                emit(Resource.Error("खोज विफल रही, फिर से प्रयास करें।"))
            }
        }
    }

    /**
     * Get trending searches for farmers
     */
    fun getTrendingSearches(): Flow<Resource<List<String>>> = flow {
        try {
            val trending = listOf(
                "Fertilizer", "Urea", "DAP", "Pesticide", 
                "Wheat Seeds", "Organic", "Crop Protection"
            )
            emit(Resource.Success(trending))
        } catch (e: Exception) {
            emit(Resource.Error("ट्रेंडिंग सर्च लोड करने में विफल"))
        }
    }
}
