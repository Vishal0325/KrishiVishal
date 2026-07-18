package com.company.krishivishal.performance

import kotlinx.coroutines.delay
import timber.log.Timber

/**
 * Lazy loading data source
 * Loads data on demand with configurable chunk size
 */
class LazyLoadingDataSource<T>(
    private val totalCount: suspend () -> Int,
    private val loadChunk: suspend (offset: Int, limit: Int) -> List<T>,
    private val chunkSize: Int = 20
) {
    private var currentPage = 0
    private var hasMoreData = true
    private val cachedData = mutableListOf<T>()

    /**
     * Load next chunk of data
     */
    suspend fun loadNextChunk(): List<T> {
        return try {
            if (!hasMoreData) {
                Timber.d("No more data to load")
                return emptyList()
            }

            val offset = currentPage * chunkSize
            val data = loadChunk(offset, chunkSize)

            if (data.size < chunkSize) {
                hasMoreData = false
                Timber.d("Last chunk loaded, no more data available")
            }

            cachedData.addAll(data)
            currentPage++

            Timber.d("Chunk loaded: ${data.size} items, totalCached: ${cachedData.size}")
            data
        } catch (e: Exception) {
            Timber.e(e, "Error loading chunk")
            emptyList()
        }
    }

    /**
     * Check if more data is available
     */
    fun hasMore(): Boolean = hasMoreData

    /**
     * Get total items loaded so far
     */
    fun getCachedItemCount(): Int = cachedData.size

    /**
     * Get all cached data
     */
    fun getAllCachedData(): List<T> = cachedData.toList()

    /**
     * Get item at index
     */
    fun getItem(index: Int): T? = if (index < cachedData.size) cachedData[index] else null

    /**
     * Clear cache
     */
    fun clearCache() {
        cachedData.clear()
        currentPage = 0
        hasMoreData = true
        Timber.d("Lazy loading cache cleared")
    }

    /**
     * Reset to beginning
     */
    fun reset() {
        clearCache()
    }
}

/**
 * Pagination helper for Firestore queries
 */
object FirestorePagination {
    /**
     * Load paginated data from Firestore
     */
    suspend fun <T> loadPage(
        offset: Int,
        limit: Int,
        loadFn: suspend (offset: Int, limit: Int) -> List<T>
    ): List<T> {
        return try {
            Timber.d("Loading page: offset=$offset, limit=$limit")
            loadFn(offset, limit)
        } catch (e: Exception) {
            Timber.e(e, "Error loading page")
            emptyList()
        }
    }

    /**
     * Load all pages until done
     */
    suspend fun <T> loadAllPages(
        pageSize: Int,
        loadFn: suspend (offset: Int, limit: Int) -> List<T>,
        onProgress: (loaded: Int, hasMore: Boolean) -> Unit = { _, _ -> }
    ): List<T> {
        val allData = mutableListOf<T>()
        var offset = 0
        var hasMore = true

        while (hasMore) {
            val page = loadFn(offset, pageSize)
            allData.addAll(page)
            hasMore = page.size == pageSize
            onProgress(allData.size, hasMore)
            offset += pageSize
            
            if (hasMore) {
                delay(100) // Small delay between requests
            }
        }

        return allData
    }
}
