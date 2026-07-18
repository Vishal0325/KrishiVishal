package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.HistoryDao
import com.company.krishivishal.data.local.ProductDao
import com.company.krishivishal.data.model.Product
import com.company.krishivishal.data.model.SearchHistory
import com.company.krishivishal.utils.Resource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton
import com.company.krishivishal.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher

interface SearchRepository {
    fun searchProducts(query: String): Flow<Resource<List<Product>>>
    fun getSearchHistory(userId: String): Flow<Resource<List<SearchHistory>>>
    fun saveSearchQuery(searchHistory: SearchHistory): Flow<Resource<Unit>>
    fun clearSearchHistory(userId: String): Flow<Resource<Unit>>
}

@Singleton
class SearchRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val productDao: ProductDao,
    private val historyDao: HistoryDao,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : SearchRepository {

    override fun searchProducts(query: String): Flow<Resource<List<Product>>> = safeCall(ioDispatcher) {
        val q = query.lowercase()
        
        // Fetch all active products once to perform fuzzy search on client side
        // Note: For very large databases, Algolia or ElasticSearch is better.
        // For current scale, client-side filtering on a small set or prefix matching works.
        
        val snapshot = firestore.collection("products")
            .whereEqualTo("isActive", true)
            .get()
            .await()
            
        val allProducts = snapshot.toObjects(Product::class.java)
        
        // Smart fuzzy filtering: Name, Brand, Category, subCategory
        allProducts.filter { product ->
            product.name.lowercase().contains(q) ||
            product.brand.lowercase().contains(q) ||
            product.category.lowercase().contains(q) ||
            product.subCategory.lowercase().contains(q)
        }
    }

    override fun getSearchHistory(userId: String): Flow<Resource<List<SearchHistory>>> =
        historyDao.getSearchHistory(userId).map { Resource.Success(it) }

    override fun saveSearchQuery(searchHistory: SearchHistory): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        historyDao.insertSearchQuery(searchHistory)
    }

    override fun clearSearchHistory(userId: String): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        historyDao.clearSearchHistory(userId)
    }
}
