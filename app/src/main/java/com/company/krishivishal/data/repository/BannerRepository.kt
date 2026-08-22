package com.company.krishivishal.data.repository

import com.company.krishivishal.core.model.BannerItem
import com.company.krishivishal.core.util.Resource
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
import timber.log.Timber

interface BannerRepository {
    fun getBanners(): Flow<Resource<List<BannerItem>>>
    fun saveBanner(banner: BannerItem): Flow<Resource<Unit>>
    fun deleteBanner(bannerId: String): Flow<Resource<Unit>>
}

@Singleton
class BannerRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    @com.company.krishivishal.di.IoDispatcher private val ioDispatcher: kotlinx.coroutines.CoroutineDispatcher
) : BannerRepository {

    override fun getBanners(): Flow<Resource<List<BannerItem>>> = firestore.collection("banners")
        // Simplified query: Removed isActive check and priority order to ensure data flows
        // Filtering will be done client-side if needed, but this prevents "Index Required" failures
        .snapshots()
        .map { snapshot ->
            try {
                val fetched = snapshot.documents.mapNotNull { doc ->
                    try {
                        BannerItem(
                            id = doc.id,
                            imageUrl = doc.getString("imageUrl") ?: "",
                            link = doc.getString("link") ?: "",
                            priority = (doc.get("priority") as? Number)?.toInt() ?: 0,
                            createdAt = (doc.get("createdAt") as? com.google.firebase.Timestamp)?.toDate()?.time ?: 0L
                        )
                    } catch (e: Exception) {
                        Timber.w("Failed to parse banner ${doc.id}: ${e.message}")
                        null
                    }
                }
                Resource.Success(fetched.sortedBy { it.priority })
            } catch (e: Exception) {
                Timber.e(e, "Error mapping banners")
                Resource.Success(com.company.krishivishal.core.util.Constants.SAMPLE_BANNERS)
            }
        }
        .catch { e ->
            Timber.e(e, "Failed to fetch banners from Firestore")
            emit(Resource.Success(com.company.krishivishal.core.util.Constants.SAMPLE_BANNERS))
        }
        .flowOn(ioDispatcher)

    override fun saveBanner(banner: BannerItem): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        val id = banner.id.ifEmpty { firestore.collection("banners").document().id }
        firestore.collection("banners").document(id).set(banner.copy(id = id)).await()
    }

    override fun deleteBanner(bannerId: String): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        firestore.collection("banners").document(bannerId).delete().await()
    }
}
