package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.CropDao
import com.company.krishivishal.core.model.Crop
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.networkBoundResource
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import com.google.firebase.firestore.snapshots
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton
import com.company.krishivishal.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.flow
import timber.log.Timber

interface CropRepository {
    fun getCrops(): Flow<Resource<List<Crop>>>
    suspend fun saveCrop(crop: Crop): Flow<Resource<Unit>>
    suspend fun deleteCrop(cropId: String): Flow<Resource<Unit>>
}

@Singleton
class CropRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val cropDao: CropDao,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : CropRepository {

    override fun getCrops(): Flow<Resource<List<Crop>>> = firestore.collection("crops")
        .snapshots()
        .map { snapshot ->
            val fetched = snapshot.documents.mapNotNull { doc ->
                val isActive = doc.getBoolean("isActive") ?: true
                if (isActive) {
                    Crop(id = doc.id, name = doc.getString("name") ?: "", imageUrl = doc.getString("imageUrl") ?: "", isActive = true)
                } else null
            }
            if (fetched.isNotEmpty()) Resource.Success(fetched)
            else Resource.Success(com.company.krishivishal.core.util.Constants.SAMPLE_CROPS)
        }
        .catch { e ->
            Timber.e(e, "Failed to fetch crops from Firestore")
            emit(Resource.Success(com.company.krishivishal.core.util.Constants.SAMPLE_CROPS))
        }
        .flowOn(ioDispatcher)



    override suspend fun saveCrop(crop: Crop): Flow<Resource<Unit>> = flow {
        emit(Resource.Loading())
        try {
            val cropId = if (crop.id.isEmpty()) firestore.collection("crops").document().id else crop.id
            val finalCrop = crop.copy(id = cropId)
            firestore.collection("crops").document(cropId).set(finalCrop).await()
            cropDao.insertCrops(listOf(finalCrop))
            emit(Resource.Success(Unit))
        } catch (e: Exception) {
            emit(Resource.Error(e.message ?: "Error saving crop"))
        }
    }

    override suspend fun deleteCrop(cropId: String): Flow<Resource<Unit>> = flow {
        emit(Resource.Loading())
        try {
            firestore.collection("crops").document(cropId).delete().await()
            cropDao.deleteCrop(Crop(id = cropId))
            emit(Resource.Success(Unit))
        } catch (e: Exception) {
            emit(Resource.Error(e.message ?: "Error deleting crop"))
        }
    }
}
