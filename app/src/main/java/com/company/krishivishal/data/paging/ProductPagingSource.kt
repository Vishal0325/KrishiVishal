package com.company.krishivishal.data.paging

import androidx.paging.PagingSource
import androidx.paging.PagingState
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.data.mapper.toProduct
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.tasks.await

/**
 * Optimized PagingSource for Product catalog.
 * Uses Firestore DocumentSnapshot as the pagination cursor (single roundtrip per page load).
 */
class ProductPagingSource(
    private val firestore: FirebaseFirestore,
    private val query: Query = firestore.collection("products")
        .whereEqualTo("isActive", true)
) : PagingSource<DocumentSnapshot, Product>() {

    override fun getRefreshKey(state: PagingState<DocumentSnapshot, Product>): DocumentSnapshot? {
        // Try to find the closest page to anchorPosition and return null to restart from page 1 on refresh
        return null
    }

    override suspend fun load(params: LoadParams<DocumentSnapshot>): LoadResult<DocumentSnapshot, Product> {
        return try {
            val pageQuery = if (params.key != null) {
                query.startAfter(params.key as DocumentSnapshot)
                    .limit(params.loadSize.toLong())
            } else {
                query.limit(params.loadSize.toLong())
            }

            val snapshot = pageQuery.get().await()
            val products = snapshot.documents.mapNotNull { it.toProduct() }
            val lastVisibleDoc = snapshot.documents.lastOrNull()

            LoadResult.Page(
                data = products,
                prevKey = null,
                nextKey = if (snapshot.size() < params.loadSize || lastVisibleDoc == null) null else lastVisibleDoc
            )
        } catch (e: Exception) {
            LoadResult.Error(e)
        }
    }
}
