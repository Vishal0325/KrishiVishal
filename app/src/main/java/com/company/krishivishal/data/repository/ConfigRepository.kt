package com.company.krishivishal.data.repository

import com.company.krishivishal.core.model.AppConfig
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton
import com.company.krishivishal.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher

interface ConfigRepository {
    fun getConfig(): Flow<Resource<AppConfig>>
    fun updateConfig(config: AppConfig): Flow<Resource<Unit>>
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

    override fun updateConfig(config: AppConfig): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        firestore.collection("settings").document("config").set(config).await()
    }
}
