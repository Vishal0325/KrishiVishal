package com.company.krishivishal.data.repository

import com.company.krishivishal.core.model.BannerItem
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
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

    override fun getBanners(): Flow<Resource<List<BannerItem>>> = kotlinx.coroutines.flow.flow {
        emit(Resource.Success(com.company.krishivishal.core.util.Constants.SAMPLE_BANNERS))
        try {
            val snapshot = firestore.collection("banners").get().await()
            val fetched = snapshot.toObjects(BannerItem::class.java)
            if (fetched.isNotEmpty()) emit(Resource.Success(fetched))
        } catch (e: Exception) {
            Timber.e(e, "Failed to fetch banners from Firestore, using fallback data")
        }
    }

    override fun saveBanner(banner: BannerItem): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        val id = banner.id.ifEmpty { firestore.collection("banners").document().id }
        firestore.collection("banners").document(id).set(banner.copy(id = id)).await()
    }

    override fun deleteBanner(bannerId: String): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        firestore.collection("banners").document(bannerId).delete().await()
    }
}
