package com.company.krishivishal.data.repository

import com.company.krishivishal.core.model.ReturnRequest
import com.company.krishivishal.core.model.ReturnStatus
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.FieldValue
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
    fun updateReturnStatus(returnId: String, status: ReturnStatus, adminNotes: String? = null): Flow<Resource<Unit>>
}

@Singleton
class ReturnRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val returnDao: com.company.krishivishal.data.local.ReturnDao,
    private val notificationRepository: NotificationRepository,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : ReturnRepository {

    override fun requestReturn(request: ReturnRequest): Flow<Resource<String>> = safeCall(ioDispatcher) {
        val id = "RET-" + UUID.randomUUID().toString().substring(0, 8).uppercase()
        val finalRequest = request.copy(id = id, createdAt = java.util.Date(), updatedAt = java.util.Date())
        firestore.collection("returns").document(id).set(finalRequest).await()
        returnDao.insertReturn(finalRequest)
        id
    }

    override fun getReturnsByUser(userId: String): Flow<Resource<List<ReturnRequest>>> = kotlinx.coroutines.flow.flow {
        emit(Resource.Loading())
        
        try {
            // SYNC V4: Fetch from Firestore first to ensure data consistency in My Returns
            val networkSnapshot = firestore.collection("returns")
                .whereEqualTo("userId", userId)
                .get()
                .await()
            
            val networkData = networkSnapshot.toObjects(ReturnRequest::class.java)
            
            if (networkData.isNotEmpty()) {
                // Update local database with fresh server data
                returnDao.insertReturns(networkData)
            }
            
            // Now collect from DAO (Room) as the single source of truth
            returnDao.getReturnsByUserId(userId).collect { localData ->
                emit(Resource.Success(localData))
            }
        } catch (e: Exception) {
            // Fallback: If network fails, still try to show local data
            try {
                returnDao.getReturnsByUserId(userId).collect { localData ->
                    emit(Resource.Success(localData))
                }
            } catch (ex: Exception) {
                emit(Resource.Error(e.message ?: "An error occurred"))
            }
        }
    }

    override fun getReturnDetails(returnId: String): Flow<Resource<ReturnRequest?>> = safeCall(ioDispatcher) {
        firestore.collection("returns").document(returnId).get().await().toObject(ReturnRequest::class.java)
    }

    override fun updateReturnStatus(returnId: String, status: ReturnStatus, adminNotes: String?): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        val updates = mutableMapOf<String, Any>(
            "status" to status.name,
            "updatedAt" to FieldValue.serverTimestamp()
        )
        adminNotes?.let { updates["adminNotes"] = it }

        val docRef = firestore.collection("returns").document(returnId)
        val snapshot = docRef.get().await()
        val userId = snapshot.getString("userId") ?: ""

        docRef.update(updates).await()

        // Trigger notification if userId exists
        if (userId.isNotEmpty()) {
            val message = "Aapka return #${returnId.takeLast(6)} ab ${status.displayName} hai."
            notificationRepository.sendNotification(userId, "Return Update", message, "RETURN_UPDATE")
        }

        // Update local cache
        val localReturn = returnDao.getReturnById(returnId)
        if (localReturn != null) {
            val updatedLocal = localReturn.copy(
                status = status.name, 
                updatedAt = java.util.Date()
            ).let { if (adminNotes != null) it.copy(adminNotes = adminNotes) else it }
            returnDao.insertReturn(updatedLocal)
        }
    }
}
