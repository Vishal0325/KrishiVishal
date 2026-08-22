package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.CategoryDao
import com.company.krishivishal.core.model.Category
import com.company.krishivishal.core.util.Constants
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.networkBoundResource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import com.google.firebase.firestore.snapshots
import javax.inject.Inject
import javax.inject.Singleton
import com.company.krishivishal.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher

interface CategoryRepository {
    fun getCategories(): Flow<Resource<List<Category>>>
    fun getCategoryById(categoryId: String): Flow<Resource<Category?>>
    fun addCategory(category: Category): Flow<Resource<Unit>>
    fun updateCategory(category: Category): Flow<Resource<Unit>>
    fun deleteCategory(category: Category): Flow<Resource<Unit>>
    suspend fun seedCategories()
}

@Singleton
class CategoryRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val categoryDao: CategoryDao,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : CategoryRepository {

    override fun getCategories(): Flow<Resource<List<Category>>> = firestore.collection("categories")
        .snapshots()
        .map { snapshot ->
            val fetched = snapshot.toObjects(Category::class.java)
            if (fetched.isNotEmpty()) Resource.Success(fetched)
            else Resource.Success(com.company.krishivishal.core.util.Constants.SAMPLE_CATEGORIES)
        }
        .catch { e ->
            timber.log.Timber.e(e, "Error fetching categories from Firestore")
            emit(Resource.Success(com.company.krishivishal.core.util.Constants.SAMPLE_CATEGORIES))
        }
        .flowOn(ioDispatcher)

    override fun getCategoryById(categoryId: String): Flow<Resource<Category?>> = 
        networkBoundResource(
            query = { categoryDao.getCategoryById(categoryId) },
            fetch = {
                firestore.collection("categories").document(categoryId).get().await().toObject(Category::class.java)
            },
            saveFetchResult = { category ->
                category?.let { categoryDao.insertCategories(listOf(it)) }
            },
            dispatcher = ioDispatcher
        )

    override fun addCategory(category: Category): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        firestore.collection("categories").document(category.id).set(category).await()
        categoryDao.insertCategories(listOf(category))
    }

    override fun updateCategory(category: Category): Flow<Resource<Unit>> = addCategory(category)

    override fun deleteCategory(category: Category): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        firestore.collection("categories").document(category.id).delete().await()
        categoryDao.deleteCategory(category)
    }

    override suspend fun seedCategories() {
        Constants.PRODUCT_CATEGORIES.forEach { name ->
            val id = name.lowercase().replace(" ", "_")
            val category = Category(id = id, name = name)
            firestore.collection("categories").document(id).set(category).await()
        }
    }
}
