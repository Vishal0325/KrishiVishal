package com.company.krishivishal

import android.app.Application
import com.company.krishivishal.analytics.AnalyticsTracker
import com.company.krishivishal.analytics.CrashlyticsTree
import com.company.krishivishal.crashlytics.CrashlyticsErrorReporter
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory
import com.google.firebase.appcheck.ktx.appCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.google.firebase.ktx.Firebase
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import android.app.ActivityManager
import android.util.Log
import androidx.core.content.getSystemService

@HiltAndroidApp
class KrishiVishalApp : Application(), ImageLoaderFactory, Configuration.Provider {

    /**
     * Application-scoped coroutine scope, tied to the process lifecycle.
     * Replaces GlobalScope for fire-and-forget startup work (e.g. App Check init)
     * so cancellation semantics are explicit and testable, and misuse elsewhere
     * in the codebase can't silently reuse an unscoped GlobalScope launch.
     */
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    companion object {
        private var _instance: KrishiVishalApp? = null
        val instance: KrishiVishalApp
            get() = _instance ?: throw IllegalStateException("App not initialized")
    }

    init {
        _instance = this
    }

    @Inject
    lateinit var analyticsTracker: AnalyticsTracker

    @Inject
    lateinit var errorReporter: CrashlyticsErrorReporter

    @Inject
    lateinit var crashlyticsTree: CrashlyticsTree

    @Inject
    lateinit var imageCacheManager: com.company.krishivishal.performance.ImageCacheManager

    override fun newImageLoader(): ImageLoader {
        return imageCacheManager.getImageLoader()
    }

    override fun onCreate() {
        // [FIXED] Initialize Firebase BEFORE super.onCreate()
        // Hilt performs injection in super.onCreate(), and our injected
        // singletons (AnalyticsTracker, CrashlyticsErrorReporter) depend on Firebase.
        try {
            FirebaseApp.initializeApp(this)
        } catch (e: Exception) {
            Log.e("KrishiVishalApp", "FirebaseApp init failed early", e)
        }

        super.onCreate()
        _instance = this

        // 2. Setup Timber & Crashlytics
        setupTimber()
        
        try {
            FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(!BuildConfig.DEBUG)
        } catch (e: Exception) {
            Timber.e(e, "Crashlytics init failed")
        }

        // [FIXED] Point #166: Initialize injected objects on UI thread before background use
        try {
            errorReporter // Force eager initialization
            analyticsTracker // Force eager initialization
        } catch (e: Exception) {
            Timber.e(e, "Eager injection initialization failed")
        }

        // 3. Setup App Check — Move to background to improve App Start Time
        applicationScope.launch {
            try {
                val appCheck = Firebase.appCheck
                if (BuildConfig.DEBUG) {
                    appCheck.installAppCheckProviderFactory(
                        DebugAppCheckProviderFactory.getInstance(),
                    )
                } else {
                    appCheck.installAppCheckProviderFactory(
                        PlayIntegrityAppCheckProviderFactory.getInstance(),
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "App Check init failed")
            }
        }

        Timber.d("KrishiVishalApp initialized")
    }

    private fun setupTimber() {
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        } else {
            // Initialize crashlytics tree
            try {
                Timber.plant(crashlyticsTree)
            } catch (e: Exception) {
                Timber.e(e, "Failed to plant CrashlyticsTree")
            }
        }
    }
}
