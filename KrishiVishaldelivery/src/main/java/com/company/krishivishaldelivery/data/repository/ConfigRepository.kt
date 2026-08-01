package com.company.krishivishaldelivery.data.repository

import com.company.krishivishal.core.model.AppConfig
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import com.company.krishivishaldelivery.di.IoDispatcher

interface ConfigRepository {
    fun getConfig(): Flow<Resource<AppConfig>>
}

@Singleton
class ConfigRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : ConfigRepository {

    override fun getConfig(): Flow<Resource<AppConfig>> = safeCall(ioDispatcher) {
        val snapshot = firestore.collection("settings").document("config").get().await()
        snapshot.toObject(AppConfig::class.java) ?: AppConfig()
    }
}
