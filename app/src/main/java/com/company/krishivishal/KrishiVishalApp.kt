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

    @Inject
    lateinit var analyticsTracker: dagger.Lazy<AnalyticsTracker>

    @Inject
    lateinit var errorReporter: dagger.Lazy<CrashlyticsErrorReporter>

    @Inject
    lateinit var crashlyticsTree: dagger.Lazy<CrashlyticsTree>

    override fun newImageLoader(): ImageLoader {
        val activityManager = getSystemService<ActivityManager>()
        val isLowRam = activityManager?.isLowRamDevice ?: false
        val memoryCachePercent = if (isLowRam) 0.15 else 0.25

        return ImageLoader.Builder(this)
            .memoryCache {
                MemoryCache.Builder(this)
                    .maxSizePercent(memoryCachePercent)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(cacheDir.resolve("image_cache"))
                    .maxSizeBytes(100L * 1024 * 1024)
                    .build()
            }
            .crossfade(true)
            .respectCacheHeaders(false)
            .build()
    }

    override fun onCreate() {
        super.onCreate()
        _instance = this

        // 1. Initialize Firebase (Main Thread Required)
        // Note: google-services plugin usually handles this via ContentProvider, 
        // but explicit init ensures it's ready before manual background tasks.
        try {
            FirebaseApp.initializeApp(this)
        } catch (e: Exception) {
            android.util.Log.e("KrishiVishalApp", "FirebaseApp init failed", e)
        }

        // 2. Setup Timber & Crashlytics
        setupTimber()
        
        try {
            FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(!BuildConfig.DEBUG)
        } catch (e: Exception) {
            android.util.Log.e("KrishiVishalApp", "Crashlytics init failed", e)
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
                android.util.Log.e("KrishiVishalApp", "App Check init failed", e)
            }
        }

        Timber.d("KrishiVishalApp initialized")
    }

    private fun setupTimber() {
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        } else {
            // Accessing .get() on Lazy to initialize when needed
            Timber.plant(crashlyticsTree.get())
        }
    }
}
