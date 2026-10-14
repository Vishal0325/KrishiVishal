package com.company.krishivishal.data.repository

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.company.krishivishal.di.IoDispatcher
import com.company.krishivishal.model.GlobalSystemConfig
import com.company.krishivishal.model.HubSystemConfig
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.gson.Gson
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import timber.log.Timber
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject
import javax.inject.Singleton

private val Context.featureFlagsDataStore: DataStore<Preferences> by preferencesDataStore(name = "feature_flags_prefs")

interface FeatureFlagRepository {
    val globalConfig: StateFlow<GlobalSystemConfig>
    fun observeHubConfig(hubId: String): Flow<HubSystemConfig>
    suspend fun refreshGlobalConfig(): GlobalSystemConfig
}

@Singleton
class FeatureFlagRepositoryImpl @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val firestore: FirebaseFirestore,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : FeatureFlagRepository {

    private val gson = Gson()
    private val repositoryScope = CoroutineScope(SupervisorJob() + ioDispatcher)

    private val _globalConfig = MutableStateFlow(GlobalSystemConfig())
    override val globalConfig: StateFlow<GlobalSystemConfig> = _globalConfig.asStateFlow()

    private var globalListenerRegistration: ListenerRegistration? = null
    private val foregroundActivityCount = AtomicInteger(0)
    private var isChangingConfigurations = false

    companion object {
        private val KEY_CACHED_GLOBAL_CONFIG = stringPreferencesKey("cached_global_config")
    }

    init {
        // 1. Immediately hydrate from DataStore cache for instant offline / cold-start readiness
        loadCachedConfig()

        // 2. Setup lifecycle callbacks to ensure Firestore listener is attached ONLY in foreground
        setupForegroundLifecycleListener()
    }

    private fun loadCachedConfig() {
        repositoryScope.launch {
            try {
                val prefs = context.featureFlagsDataStore.data.first()
                val json = prefs[KEY_CACHED_GLOBAL_CONFIG]
                if (!json.isNullOrBlank()) {
                    val cached = gson.fromJson(json, GlobalSystemConfig::class.java)
                    if (cached != null) {
                        _globalConfig.value = cached
                        Timber.d("Hydrated global system config from DataStore cache")
                    }
                }
            } catch (e: Exception) {
                Timber.w(e, "Failed to load cached global config from DataStore")
            }
        }
    }

    private suspend fun persistCachedConfig(config: GlobalSystemConfig) {
        try {
            val json = gson.toJson(config)
            context.featureFlagsDataStore.edit { prefs ->
                prefs[KEY_CACHED_GLOBAL_CONFIG] = json
            }
        } catch (e: Exception) {
            Timber.w(e, "Failed to save global config to DataStore")
        }
    }

    private fun setupForegroundLifecycleListener() {
        val app = context.applicationContext as? Application
        if (app != null) {
            app.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
                override fun onActivityStarted(activity: Activity) {
                    val count = foregroundActivityCount.incrementAndGet()
                    if (count == 1 && !isChangingConfigurations) {
                        Timber.d("App entered foreground -> Attaching Firestore globalConfig listener")
                        attachGlobalListener()
                    }
                }

                override fun onActivityStopped(activity: Activity) {
                    isChangingConfigurations = activity.isChangingConfigurations
                    val count = foregroundActivityCount.decrementAndGet()
                    if (count == 0 && !isChangingConfigurations) {
                        Timber.d("App entered background -> Detaching Firestore globalConfig listener")
                        detachGlobalListener()
                    }
                }

                override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
                override fun onActivityResumed(activity: Activity) {}
                override fun onActivityPaused(activity: Activity) {}
                override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
                override fun onActivityDestroyed(activity: Activity) {}
            })
        } else {
            // Fallback: If application callbacks unavailable, attach directly
            attachGlobalListener()
        }
    }

    @Synchronized
    private fun attachGlobalListener() {
        if (globalListenerRegistration != null) return

        try {
            val docRef = firestore.collection("system_configs").document("global")
            globalListenerRegistration = docRef.addSnapshotListener { snapshot, error ->
                if (error != null) {
                    Timber.w(error, "Failed to listen to system_configs/global")
                    return@addSnapshotListener
                }

                if (snapshot != null) {
                    val config = GlobalSystemConfig.fromDocument(snapshot)
                    _globalConfig.value = config
                    repositoryScope.launch {
                        persistCachedConfig(config)
                    }
                    Timber.d("Received system_configs/global snapshot update: maintenance=%b, checkoutFrozen=%b",
                        config.isMaintenanceMode, config.isCheckoutFrozen)
                }
            }
        } catch (e: Exception) {
            Timber.e(e, "Error attaching global system_configs listener")
        }
    }

    @Synchronized
    private fun detachGlobalListener() {
        globalListenerRegistration?.remove()
        globalListenerRegistration = null
    }

    override fun observeHubConfig(hubId: String): Flow<HubSystemConfig> = callbackFlow {
        if (hubId.isBlank()) {
            trySend(HubSystemConfig())
            close()
            return@callbackFlow
        }

        val docRef = firestore.collection("system_configs").document("hubs_$hubId")
        val registration = docRef.addSnapshotListener { snapshot, error ->
            if (error != null) {
                Timber.w(error, "Error listening to system_configs/hubs_$hubId")
                return@addSnapshotListener
            }

            val config = HubSystemConfig.fromDocument(snapshot, hubId)
            trySend(config)
        }

        awaitClose {
            registration.remove()
        }
    }.flowOn(ioDispatcher)

    override suspend fun refreshGlobalConfig(): GlobalSystemConfig {
        return try {
            val snapshot = firestore.collection("system_configs").document("global").get().await()
            val config = GlobalSystemConfig.fromDocument(snapshot)
            _globalConfig.value = config
            persistCachedConfig(config)
            config
        } catch (e: Exception) {
            Timber.w(e, "Failed to refresh global config directly")
            _globalConfig.value
        }
    }
}
