package com.company.krishivishal.data.repository

import com.company.krishivishal.core.model.ReturnRequest
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import com.company.krishivishal.di.IoDispatcher

interface ReturnRepository {
    fun requestReturn(request: ReturnRequest): Flow<Resource<String>>
    fun getReturnsByUser(userId: String): Flow<Resource<List<ReturnRequest>>>
    fun getReturnDetails(returnId: String): Flow<Resource<ReturnRequest?>>
}

@Singleton
class ReturnRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : ReturnRepository {

    override fun requestReturn(request: ReturnRequest): Flow<Resource<String>> = safeCall(ioDispatcher) {
        val id = "RET-" + UUID.randomUUID().toString().substring(0, 8).uppercase()
        val finalRequest = request.copy(id = id)
        firestore.collection("returns").document(id).set(finalRequest).await()
        id
    }

    override fun getReturnsByUser(userId: String): Flow<Resource<List<ReturnRequest>>> = safeCall(ioDispatcher) {
        firestore.collection("returns")
            .whereEqualTo("userId", userId)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .get()
            .await()
            .toObjects(ReturnRequest::class.java)
    }

    override fun getReturnDetails(returnId: String): Flow<Resource<ReturnRequest?>> = safeCall(ioDispatcher) {
        firestore.collection("returns").document(returnId).get().await().toObject(ReturnRequest::class.java)
    }
}
