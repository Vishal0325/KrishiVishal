package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.HistoryDao
import com.company.krishivishal.data.local.ProductDao
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.SearchHistory
import com.company.krishivishal.core.util.Resource
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
        
        // LIMIT fetch to prevent memory pressure on large catalogs
        val snapshot = firestore.collection("products")
            .whereEqualTo("isActive", true)
            .limit(100) // Optimization: Don't fetch more than 100 products for client-side fuzzy search
            .get()
            .await()
            
        val allProducts = snapshot.mapNotNull { it.toProduct() }
        
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
