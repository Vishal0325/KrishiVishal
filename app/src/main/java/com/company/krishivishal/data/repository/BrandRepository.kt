package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.BrandDao
import com.company.krishivishal.core.model.Brand
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.networkBoundResource
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton
import com.company.krishivishal.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.flow
import timber.log.Timber

interface BrandRepository {
    fun getBrands(): Flow<Resource<List<Brand>>>
    suspend fun saveBrand(brand: Brand): Flow<Resource<Unit>>
    suspend fun deleteBrand(brandId: String): Flow<Resource<Unit>>
}

@Singleton
class BrandRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val brandDao: BrandDao,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : BrandRepository {

    override fun getBrands(): Flow<Resource<List<Brand>>> = kotlinx.coroutines.flow.flow {
        emit(Resource.Success(com.company.krishivishal.core.util.Constants.SAMPLE_BRANDS))
        try {
            val snapshot = firestore.collection("brands").whereEqualTo("isActive", true).get().await()
            val fetched = snapshot.documents.mapNotNull { doc ->
                Brand(id = doc.id, name = doc.getString("name") ?: "", imageUrl = doc.getString("imageUrl") ?: "", isActive = true)
            }
            if (fetched.isNotEmpty()) emit(Resource.Success(fetched))
        } catch (e: Exception) {
            Timber.e(e, "Failed to fetch brands from Firestore, using fallback data")
        }
    }

    private suspend fun seedBrands() {
        com.company.krishivishal.core.util.Constants.SAMPLE_BRANDS.forEach { brand ->
            firestore.collection("brands").document(brand.id).set(brand).await()
        }
    }

    private suspend fun fetchBrandsFromFirestore(): List<Brand> {
        val snapshot = firestore.collection("brands")
            .whereEqualTo("isActive", true)
            .get()
            .await()
        
        return snapshot.documents.mapNotNull { doc ->
            Brand(
                id = doc.id,
                name = doc.getString("name") ?: "",
                imageUrl = doc.getString("imageUrl") ?: "",
                isActive = doc.getBoolean("isActive") ?: true
            )
        }
    }

    override suspend fun saveBrand(brand: Brand): Flow<Resource<Unit>> = flow {
        emit(Resource.Loading())
        try {
            firestore.collection("brands").document(brand.id).set(brand).await()
            brandDao.insertBrands(listOf(brand))
            emit(Resource.Success(Unit))
        } catch (e: Exception) {
            emit(Resource.Error(e.message ?: "Error saving brand"))
        }
    }

    override suspend fun deleteBrand(brandId: String): Flow<Resource<Unit>> = flow {
        emit(Resource.Loading())
        try {
            firestore.collection("brands").document(brandId).delete().await()
            emit(Resource.Success(Unit))
        } catch (e: Exception) {
            emit(Resource.Error(e.message ?: "Error deleting brand"))
        }
    }
}
