package com.company.krishivishaldelivery.data.repository

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import com.company.krishivishaldelivery.data.model.DeliveryGlobalConfig
import com.company.krishivishaldelivery.data.model.DeliveryHubConfig
import com.company.krishivishaldelivery.data.model.DeliveryMaintenanceMode
import com.company.krishivishaldelivery.data.model.DeliveryOperationalConfig
import com.company.krishivishaldelivery.data.model.DeliveryVersioningConfig
import com.company.krishivishaldelivery.di.IoDispatcher
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import timber.log.Timber
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject
import javax.inject.Singleton

private val Context.deliveryDataStore: DataStore<Preferences> by preferencesDataStore(name = "delivery_feature_flags_prefs")

interface DeliveryFeatureFlagRepository {
    val globalConfig: StateFlow<DeliveryGlobalConfig>
    val hubConfig: StateFlow<DeliveryHubConfig>
    fun setRiderHubId(hubId: String)
    suspend fun refresh()
}

@Singleton
class DeliveryFeatureFlagRepositoryImpl @Inject constructor(
    @ApplicationContext private val context: Context,
    private val firestore: FirebaseFirestore,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : DeliveryFeatureFlagRepository {

    private val repositoryScope = CoroutineScope(SupervisorJob() + ioDispatcher)

    private val _globalConfig = MutableStateFlow(DeliveryGlobalConfig())
    override val globalConfig: StateFlow<DeliveryGlobalConfig> = _globalConfig.asStateFlow()

    private val _hubConfig = MutableStateFlow(DeliveryHubConfig())
    override val hubConfig: StateFlow<DeliveryHubConfig> = _hubConfig.asStateFlow()

    private var currentHubId: String = ""
    private var globalListener: ListenerRegistration? = null
    private var hubListener: ListenerRegistration? = null

    private val activeActivityCount = AtomicInteger(0)
    private var isForeground = false

    // DataStore Preference Keys
    companion object {
        private val KEY_MAINTENANCE_ENABLED = booleanPreferencesKey("maint_enabled")
        private val KEY_MAINTENANCE_MSG_EN = stringPreferencesKey("maint_msg_en")
        private val KEY_MAINTENANCE_MSG_HI = stringPreferencesKey("maint_msg_hi")
        private val KEY_MIN_VERSION = intPreferencesKey("min_version")
        private val KEY_BLOCKED_VERSIONS = stringPreferencesKey("blocked_versions")
        private val KEY_ASSIGNMENT_ENABLED = booleanPreferencesKey("assignment_enabled")
        private val KEY_CASH_COLLECTION_ENABLED = booleanPreferencesKey("cash_collection_enabled")
        private val KEY_GLOBAL_UPDATED_AT = longPreferencesKey("global_updated_at")

        private val KEY_HUB_ID = stringPreferencesKey("hub_id")
        private val KEY_HUB_LOCKDOWN = booleanPreferencesKey("hub_lockdown")
        private val KEY_HUB_ACCEPTING_ORDERS = booleanPreferencesKey("hub_accepting_orders")
        private val KEY_HUB_CASH_COLLECTION = booleanPreferencesKey("hub_cash_collection")
        private val KEY_HUB_UPDATED_AT = longPreferencesKey("hub_updated_at")
    }

    init {
        // 1. Load initial cache synchronously/immediately from DataStore
        repositoryScope.launch {
            loadFromDataStore()
        }

        // 2. Register ActivityLifecycleCallbacks to ensure foreground-only Firestore listening
        setupLifecycleCallbacks()
    }

    private suspend fun loadFromDataStore() {
        try {
            val prefs = context.deliveryDataStore.data.first()

            val maintEnabled = prefs[KEY_MAINTENANCE_ENABLED] ?: false
            val msgEn = prefs[KEY_MAINTENANCE_MSG_EN] ?: ""
            val msgHi = prefs[KEY_MAINTENANCE_MSG_HI] ?: ""
            val messages = mutableMapOf<String, String>()
            if (msgEn.isNotBlank()) messages["en"] = msgEn
            if (msgHi.isNotBlank()) messages["hi"] = msgHi

            val minVersion = prefs[KEY_MIN_VERSION] ?: 0
            val blockedRaw = prefs[KEY_BLOCKED_VERSIONS] ?: ""
            val blockedList = if (blockedRaw.isNotBlank()) {
                blockedRaw.split(",").mapNotNull { it.trim().toIntOrNull() }
            } else emptyList()

            val assignment = prefs[KEY_ASSIGNMENT_ENABLED] ?: true
            val cashCollection = prefs[KEY_CASH_COLLECTION_ENABLED] ?: true
            val globalUpdatedAt = prefs[KEY_GLOBAL_UPDATED_AT] ?: 0L

            _globalConfig.value = DeliveryGlobalConfig(
                maintenanceMode = DeliveryMaintenanceMode(isEnabled = maintEnabled, messages = messages),
                versioning = DeliveryVersioningConfig(minVersionCode = minVersion, blockedVersionCodes = blockedList),
                delivery = DeliveryOperationalConfig(assignmentEnabled = assignment, cashCollectionEnabled = cashCollection),
                updatedAt = globalUpdatedAt
            )

            val cachedHubId = prefs[KEY_HUB_ID] ?: ""
            if (cachedHubId.isNotBlank()) {
                currentHubId = cachedHubId
                val lockdown = prefs[KEY_HUB_LOCKDOWN] ?: false
                val accepting = prefs[KEY_HUB_ACCEPTING_ORDERS] ?: true
                val hubCash = prefs[KEY_HUB_CASH_COLLECTION] ?: true
                val hubUpdatedAt = prefs[KEY_HUB_UPDATED_AT] ?: 0L

                _hubConfig.value = DeliveryHubConfig(
                    hubId = cachedHubId,
                    isLockdown = lockdown,
                    acceptingOrders = accepting,
                    cashCollectionEnabled = hubCash,
                    updatedAt = hubUpdatedAt
                )
            }
        } catch (e: Exception) {
            Timber.w(e, "Could not load cached delivery configs from DataStore")
        }
    }

    private fun setupLifecycleCallbacks() {
        val app = context.applicationContext as? Application ?: return
        app.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
            override fun onActivityStarted(activity: Activity) {
                if (activeActivityCount.incrementAndGet() == 1) {
                    // App came to foreground
                    isForeground = true
                    attachListeners()
                }
            }

            override fun onActivityStopped(activity: Activity) {
                if (activeActivityCount.decrementAndGet() <= 0) {
                    activeActivityCount.set(0)
                    // App moved to background
                    isForeground = false
                    detachListeners()
                }
            }

            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
            override fun onActivityResumed(activity: Activity) {}
            override fun onActivityPaused(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {}
        })
    }

    @Synchronized
    private fun attachListeners() {
        if (!isForeground) return

        // 1. Global System Config Listener
        if (globalListener == null) {
            globalListener = firestore.collection("system_configs").document("global")
                .addSnapshotListener { snapshot, error ->
                    if (error != null) {
                        Timber.w(error, "Failed listening to system_configs/global")
                        return@addSnapshotListener
                    }
                    if (snapshot != null && snapshot.exists()) {
                        val parsed = DeliveryGlobalConfig.fromDocument(snapshot)
                        _globalConfig.value = parsed
                        saveGlobalToDataStore(parsed)
                    }
                }
        }

        // 2. Hub System Config Listener
        if (hubListener == null && currentHubId.isNotBlank()) {
            attachHubListener(currentHubId)
        }
    }

    @Synchronized
    private fun detachListeners() {
        globalListener?.remove()
        globalListener = null

        hubListener?.remove()
        hubListener = null
    }

    @Synchronized
    private fun attachHubListener(hubId: String) {
        hubListener?.remove()
        hubListener = null

        if (hubId.isBlank()) return

        // Hub document in Firestore: system_configs/hubs_{hubId}
        val docId = if (hubId.startsWith("hubs_")) hubId else "hubs_$hubId"
        hubListener = firestore.collection("system_configs").document(docId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    Timber.w(error, "Failed listening to hub config for $docId")
                    return@addSnapshotListener
                }
                val parsed = DeliveryHubConfig.fromDocument(snapshot, hubId)
                _hubConfig.value = parsed
                saveHubToDataStore(parsed)
            }
    }

    override fun setRiderHubId(hubId: String) {
        val sanitized = hubId.trim()
        if (sanitized.isEmpty() || sanitized == currentHubId) return
        currentHubId = sanitized

        if (isForeground) {
            attachHubListener(sanitized)
        } else {
            // Save hub id in DataStore
            repositoryScope.launch {
                context.deliveryDataStore.edit { it[KEY_HUB_ID] = sanitized }
            }
        }
    }

    override suspend fun refresh() {
        try {
            // Fetch global
            val globalSnap = firestore.collection("system_configs").document("global").get().await()
            if (globalSnap.exists()) {
                val parsed = DeliveryGlobalConfig.fromDocument(globalSnap)
                _globalConfig.value = parsed
                saveGlobalToDataStore(parsed)
            }

            // Fetch hub
            if (currentHubId.isNotBlank()) {
                val docId = if (currentHubId.startsWith("hubs_")) currentHubId else "hubs_$currentHubId"
                val hubSnap = firestore.collection("system_configs").document(docId).get().await()
                val parsedHub = DeliveryHubConfig.fromDocument(hubSnap, currentHubId)
                _hubConfig.value = parsedHub
                saveHubToDataStore(parsedHub)
            }
        } catch (e: Exception) {
            Timber.e(e, "Error during manual system config refresh")
        }
    }

    private fun saveGlobalToDataStore(config: DeliveryGlobalConfig) {
        repositoryScope.launch {
            try {
                context.deliveryDataStore.edit { prefs ->
                    prefs[KEY_MAINTENANCE_ENABLED] = config.maintenanceMode.isEnabled
                    prefs[KEY_MAINTENANCE_MSG_EN] = config.maintenanceMode.messages["en"] ?: ""
                    prefs[KEY_MAINTENANCE_MSG_HI] = config.maintenanceMode.messages["hi"] ?: ""
                    prefs[KEY_MIN_VERSION] = config.versioning.minVersionCode
                    prefs[KEY_BLOCKED_VERSIONS] = config.versioning.blockedVersionCodes.joinToString(",")
                    prefs[KEY_ASSIGNMENT_ENABLED] = config.delivery.assignmentEnabled
                    prefs[KEY_CASH_COLLECTION_ENABLED] = config.delivery.cashCollectionEnabled
                    prefs[KEY_GLOBAL_UPDATED_AT] = config.updatedAt
                }
            } catch (e: Exception) {
                Timber.w(e, "Error saving global config to DataStore")
            }
        }
    }

    private fun saveHubToDataStore(config: DeliveryHubConfig) {
        repositoryScope.launch {
            try {
                context.deliveryDataStore.edit { prefs ->
                    prefs[KEY_HUB_ID] = config.hubId
                    prefs[KEY_HUB_LOCKDOWN] = config.isLockdown
                    prefs[KEY_HUB_ACCEPTING_ORDERS] = config.acceptingOrders
                    prefs[KEY_HUB_CASH_COLLECTION] = config.cashCollectionEnabled
                    prefs[KEY_HUB_UPDATED_AT] = config.updatedAt
                }
            } catch (e: Exception) {
                Timber.w(e, "Error saving hub config to DataStore")
            }
        }
    }
}
