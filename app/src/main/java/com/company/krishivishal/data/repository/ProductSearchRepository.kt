package com.company.krishivishal.data.repository
 
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.VoiceIntentResult
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.SearchUnderstandingUtil
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
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
    private val productDao: com.company.krishivishal.data.local.ProductDao,
    private val functions: FirebaseFunctions = FirebaseFunctions.getInstance("asia-south1")
) {

    /**
     * Extract voice search AI intent using Cloud Functions extractVoiceIntent callable
     * with automatic fallback to SearchUnderstandingUtil.
     */
    suspend fun extractVoiceIntent(query: String): VoiceIntentResult {
        val cleanQuery = query.trim()
        if (cleanQuery.isBlank()) {
            return VoiceIntentResult()
        }

        return try {
            Timber.d("Calling extractVoiceIntent callable for query: $cleanQuery")
            val data = mapOf("query" to cleanQuery)
            val result = functions
                .getHttpsCallable("extractVoiceIntent")
                .call(data)
                .await()

            @Suppress("UNCHECKED_CAST")
            val resultMap = result.data as? Map<String, Any?>
                ?: throw Exception("Invalid response format from extractVoiceIntent")

            val crop = resultMap["crop"] as? String
            val problem = resultMap["problem"] as? String
            val category = resultMap["category"] as? String
            val rawKeywords = resultMap["keywords"] as? List<*>
            val keywordsList = rawKeywords?.mapNotNull { it?.toString() } ?: emptyList()
            val confidence = when (val conf = resultMap["confidence"]) {
                is Number -> conf.toDouble()
                else -> 0.0
            }

            VoiceIntentResult(
                crop = crop,
                problem = problem,
                category = category,
                keywords = keywordsList,
                confidence = confidence
            )
        } catch (e: Exception) {
            Timber.w(e, "extractVoiceIntent network call failed, falling back to local SearchUnderstandingUtil")
            val fallback = SearchUnderstandingUtil.understandQuery(cleanQuery)
            VoiceIntentResult(
                crop = fallback.crop,
                problem = fallback.problem,
                category = fallback.category,
                keywords = fallback.keywords,
                confidence = 0.5
            )
        }
    }

    /**
     * Search products by keywords and partial strings (2-3 chars or full word).
     */
    fun searchProductsByKeywords(
        query: String,
        intentOverride: VoiceIntentResult? = null
    ): Flow<Resource<List<Product>>> = flow {
        try {
            val cleanQuery = query.trim()
            if (cleanQuery.isBlank()) {
                emit(Resource.Success(emptyList()))
                return@flow
            }

            emit(Resource.Loading())

            val intent = intentOverride ?: run {
                val fallback = SearchUnderstandingUtil.understandQuery(cleanQuery)
                VoiceIntentResult(
                    crop = fallback.crop,
                    problem = fallback.problem,
                    category = fallback.category,
                    keywords = fallback.keywords,
                    confidence = 0.5
                )
            }
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

                // Intent Category match
                val intentCat = intent.category
                if (intentCat != null && product.category.equals(intentCat, ignoreCase = true)) score += 35

                val intentCrop = intent.crop
                if (intentCrop != null && (product.associatedCropNames.any { it.contains(intentCrop, ignoreCase = true) }
                            || product.cropName.contains(intentCrop, ignoreCase = true))) score += 25

                val intentProb = intent.problem
                if (intentProb != null && product.tags.any {
                        it.contains(intentProb, ignoreCase = true) }) score += 20

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
