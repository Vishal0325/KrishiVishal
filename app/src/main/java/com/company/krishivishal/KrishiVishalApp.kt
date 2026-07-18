package com.company.krishivishal

import android.app.Application
import android.os.StrictMode
import com.company.krishivishal.analytics.AnalyticsTracker
import com.company.krishivishal.analytics.CrashlyticsTree
import com.company.krishivishal.BuildConfig
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

@HiltAndroidApp
class KrishiVishalApp : Application(), ImageLoaderFactory {

    @Inject
    lateinit var analyticsTracker: AnalyticsTracker

    @Inject
    lateinit var errorReporter: CrashlyticsErrorReporter

    @Inject
    lateinit var crashlyticsTree: CrashlyticsTree

    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            .memoryCache {
                MemoryCache.Builder(this)
                    .maxSizePercent(0.25) // Use 25% of available RAM
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(cacheDir.resolve("image_cache"))
                    .maxSizeBytes(100L * 1024 * 1024) // 100MB Disk Cache
                    .build()
            }
            .crossfade(true) // Smooth transitions
            .respectCacheHeaders(false) // Force cache usage even if headers say otherwise
            .build()
    }

    override fun onCreate() {
        super.onCreate()

        // Initialize Firebase
        FirebaseApp.initializeApp(this)

        // Setup App Check (Temporarily disabled to fix startup browser redirect)
        /*
        if (BuildConfig.DEBUG) {
            Firebase.appCheck.installAppCheckProviderFactory(
                DebugAppCheckProviderFactory.getInstance()
            )
        } else {
            Firebase.appCheck.installAppCheckProviderFactory(
                PlayIntegrityAppCheckProviderFactory.getInstance()
            )
        }
        */
        
        // Configure Crashlytics
        configureCrashlytics()

        // Setup Timber logging
        setupTimber()

        // Track app launch
        analyticsTracker.trackCustomEvent("app_launch", mapOf(
            "build_type" to BuildConfig.BUILD_TYPE,
            "version_code" to BuildConfig.VERSION_CODE.toString(),
            "version_name" to BuildConfig.VERSION_NAME
        ))

        Timber.d("KrishiVishalApp initialized")
    }

    /**
     * Configure Firebase Crashlytics
     */
    private fun configureCrashlytics() {
        try {
            val crashlytics = FirebaseCrashlytics.getInstance()
            
            // Crash collection is enabled by default
            Timber.d("Crashlytics configured")
        } catch (e: Exception) {
            Timber.e(e, "Failed to configure Crashlytics")
        }
    }

    /**
     * Setup Timber logging with Crashlytics integration
     */
    private fun setupTimber() {
        if (BuildConfig.DEBUG) {
            // Debug build: only DebugTree
            Timber.plant(Timber.DebugTree())
            Timber.d("Debug logging enabled")
        } else {
            // Release build: Crashlytics tree
            Timber.plant(crashlyticsTree)
            Timber.d("Crashlytics logging enabled")
        }
    }
}
