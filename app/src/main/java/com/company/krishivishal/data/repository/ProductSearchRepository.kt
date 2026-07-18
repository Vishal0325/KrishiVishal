package com.company.krishivishal.data.repository

import com.company.krishivishal.data.model.Product
import com.company.krishivishal.data.model.SearchResult
import com.company.krishivishal.utils.Resource
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.tasks.await
import timber.log.Timber
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Product Repository for Search Operations
 * Handles efficient Firestore keyword tokenization queries for KrishiVishal
 */
@Singleton
class ProductSearchRepository @Inject constructor(
    private val firestore: FirebaseFirestore
) {

    /**
     * Search products by keywords (Tokens)
     * Matches user query against the 'searchKeywords' array field in Firestore.
     * 
     * STRATEGY: Firestore document must have an array field 'searchKeywords'
     * containing substrings of name and associated crops.
     * 
     * @param query Cleaned search string from user
     */
    fun searchProductsByKeywords(query: String): Flow<Resource<List<Product>>> = flow {
        try {
            if (query.isBlank()) {
                emit(Resource.Success(emptyList()))
                return@flow
            }

            emit(Resource.Loading())

            // Normalize: trim, lowercase
            val cleanedQuery = query.trim().lowercase()

            Timber.d("Searching Firestore using keyword strategy for: $cleanedQuery")

            // Multi-field search simulated by 'searchKeywords' array contains
            val snapshot = firestore.collection("products")
                .whereEqualTo("isActive", true)
                .whereArrayContains("searchKeywords", cleanedQuery)
                .limit(40)
                .get()
                .await()

            val products = snapshot.toObjects(Product::class.java).onEachIndexed { index, product ->
                product.id = snapshot.documents[index].id
            }

            Timber.d("Search success: ${products.size} results found")
            emit(Resource.Success(products))

        } catch (e: IOException) {
            Timber.e(e, "Network error during product search")
            emit(Resource.Error("कृपया अपना इंटरनेट कनेक्शन जांचें! 🌾"))
        } catch (e: Exception) {
            Timber.e(e, "Unexpected search failure for query: $query")
            emit(Resource.Error(e.localizedMessage ?: "खोज विफल रही, फिर से प्रयास करें।"))
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
