package com.company.krishivishal.data.paging

import androidx.paging.PagingSource
import androidx.paging.PagingState
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.data.repository.toProduct
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.QuerySnapshot
import kotlinx.coroutines.tasks.await

class ProductPagingSource(
    private val firestore: FirebaseFirestore,
    private val query: Query = firestore.collection("products")
        .whereEqualTo("isActive", true)
        .orderBy("createdAt", Query.Direction.DESCENDING)
) : PagingSource<QuerySnapshot, Product>() {

    override fun getRefreshKey(state: PagingState<QuerySnapshot, Product>): QuerySnapshot? {
        return null
    }

    override suspend fun load(params: LoadParams<QuerySnapshot>): LoadResult<QuerySnapshot, Product> {
        return try {
            val currentPage = params.key ?: query.limit(params.loadSize.toLong()).get().await()
            val lastDocumentSnapshot = currentPage.documents.lastOrNull()
            
            val nextPage = if (lastDocumentSnapshot != null) {
                query.startAfter(lastDocumentSnapshot)
                    .limit(params.loadSize.toLong())
                    .get()
                    .await()
            } else {
                null
            }

            LoadResult.Page(
                data = currentPage.documents.mapNotNull { it.toProduct() },
                prevKey = null,
                nextKey = if (nextPage != null && !nextPage.isEmpty) nextPage else null
            )
        } catch (e: Exception) {
            LoadResult.Error(e)
        }
    }
}
