package com.company.krishivishal.performance

import android.content.Context
import coil.ImageLoader
import coil.disk.DiskCache
import coil.memory.MemoryCache
import coil.request.CachePolicy
import coil.util.DebugLogger
import com.company.krishivishal.BuildConfig
import okhttp3.OkHttpClient
import timber.log.Timber
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Image caching strategy using Coil
 * Implements memory cache + disk cache for optimal performance
 */
@Singleton
class ImageCacheManager @Inject constructor(context: Context) {

    companion object {
        // Cache sizes
        private const val MEMORY_CACHE_SIZE_MB = 128  // 128 MB in-memory cache
        private const val DISK_CACHE_SIZE_MB = 512    // 512 MB disk cache
        
        // Cache validity
        private const val IMAGE_CACHE_MAX_AGE_DAYS = 30
    }

    private val imageLoader: ImageLoader

    init {
        imageLoader = createImageLoader(context)
        Timber.d("ImageCacheManager initialized with Coil")
    }

    /**
     * Create optimized ImageLoader with caching
     */
    private fun createImageLoader(context: Context): ImageLoader {
        return ImageLoader.Builder(context)
            .memoryCache {
                MemoryCache.Builder(context)
                    .maxSizePercent(0.25)
                    .strongReferencesEnabled(true)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(File(context.cacheDir, "image_cache"))
                    .maxSizeBytes(512L * 1024L * 1024L)
                    .build()
            }
            .networkCachePolicy(CachePolicy.ENABLED)
            .diskCachePolicy(CachePolicy.ENABLED)
            .memoryCachePolicy(CachePolicy.ENABLED)
            .apply {
                if (BuildConfig.DEBUG) {
                    logger(DebugLogger())
                }
            }
            .build()
            .also {
                Timber.d("ImageLoader configured with optimal caching strategy")
            }
    }

    /**
     * Get the configured ImageLoader instance
     */
    fun getImageLoader(): ImageLoader {
        return imageLoader
    }

    /**
     * Clear memory cache
     */
    fun clearMemoryCache() {
        try {
            imageLoader.memoryCache?.clear()
            Timber.d("Memory cache cleared")
        } catch (e: Exception) {
            Timber.e(e, "Failed to clear memory cache")
        }
    }

    /**
     * Clear disk cache
     */
    fun clearDiskCache() {
        try {
            imageLoader.diskCache?.clear()
            Timber.d("Disk cache cleared")
        } catch (e: Exception) {
            Timber.e(e, "Failed to clear disk cache")
        }
    }

    /**
     * Clear all caches
     */
    fun clearAllCaches() {
        clearMemoryCache()
        clearDiskCache()
        Timber.d("All image caches cleared")
    }

    /**
     * Get cache size info
     */
    fun getCacheInfo(): CacheInfo {
        return try {
            val memoryCache = imageLoader.memoryCache
            val diskCache = imageLoader.diskCache
            
            CacheInfo(
                memoryCacheSize = memoryCache?.size?.toLong() ?: 0L,
                memoryCacheMaxSize = memoryCache?.maxSize?.toLong() ?: 0L,
                diskCacheSize = diskCache?.size?.toLong() ?: 0L,
                diskCacheMaxSize = diskCache?.maxSize?.toLong() ?: 0L
            )
        } catch (e: Exception) {
            Timber.e(e, "Failed to get cache info")
            CacheInfo(0L, 0L, 0L, 0L)
        }
    }

    data class CacheInfo(
        val memoryCacheSize: Long,
        val memoryCacheMaxSize: Long,
        val diskCacheSize: Long,
        val diskCacheMaxSize: Long
    ) {
        fun getMemoryCacheUsagePercent(): Float {
            return if (memoryCacheMaxSize > 0L) {
                (memoryCacheSize.toFloat() / memoryCacheMaxSize.toFloat()) * 100f
            } else {
                0f
            }
        }

        fun getDiskCacheUsagePercent(): Float {
            return if (diskCacheMaxSize > 0L) {
                (diskCacheSize.toFloat() / diskCacheMaxSize.toFloat()) * 100f
            } else {
                0f
            }
        }
    }
}
