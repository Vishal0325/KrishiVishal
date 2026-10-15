package com.company.krishivishal.data.repository

import com.company.krishivishal.core.model.*
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import com.company.krishivishal.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher

interface AdminRepository {
    fun getUsers(role: String? = null): Flow<Resource<List<User>>>
    fun updateUserRole(userId: String, role: String): Flow<Resource<Unit>>
    fun getCoupons(): Flow<Resource<List<Coupon>>>
    fun saveCoupon(coupon: Coupon): Flow<Resource<Unit>>
    fun deleteCoupon(couponId: String): Flow<Resource<Unit>>
    fun logActivity(log: AdminLog): Flow<Resource<Unit>>
    fun getActivityLogs(): Flow<Resource<List<AdminLog>>>
}

@Singleton
class AdminRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val functions: FirebaseFunctions,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : AdminRepository {

    override fun getUsers(role: String?): Flow<Resource<List<User>>> = safeCall(ioDispatcher) {
        val query = if (role != null) {
            firestore.collection("users").whereEqualTo("role", role)
        } else {
            firestore.collection("users")
        }
        query.get().await().toObjects(User::class.java)
    }

    override fun updateUserRole(userId: String, role: String): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        val data = hashMapOf(
            "targetUid" to userId,
            "role" to role
        )
        // Mapped to backend exported callable 'setUserRole'
        functions.getHttpsCallable("setUserRole").call(data).await()
        Unit
    }

    override fun getCoupons(): Flow<Resource<List<Coupon>>> = safeCall(ioDispatcher) {
        firestore.collection("coupons").get().await().toObjects(Coupon::class.java)
    }

    override fun saveCoupon(coupon: Coupon): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        val id = coupon.id.ifEmpty { firestore.collection("coupons").document().id }
        firestore.collection("coupons").document(id).set(coupon.copy(id = id)).await()
    }

    override fun deleteCoupon(couponId: String): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        firestore.collection("coupons").document(couponId).delete().await()
    }

    override fun logActivity(log: AdminLog): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        // Server-authoritative audit logging: delegates to Cloud Function addSecureAuditLog
        // which stamps actorId, ipAddress, server timestamp, and writes to both audit_logs and admin_logs.
        val payload = hashMapOf(
            "eventId" to UUID.randomUUID().toString(),
            "action" to log.action,
            "module" to (log.targetType.ifEmpty { "ADMIN" }),
            "entityId" to (log.targetId.ifEmpty { "N/A" }),
            "details" to mapOf(
                "adminName" to log.adminName,
                "details" to log.details
            )
        )
        functions.getHttpsCallable("addSecureAuditLog").call(payload).await()
        Unit
    }

    override fun getActivityLogs(): Flow<Resource<List<AdminLog>>> = safeCall(ioDispatcher) {
        firestore.collection("admin_logs")
            .orderBy("timestamp", Query.Direction.DESCENDING)
            .limit(100)
            .get()
            .await()
            .toObjects(AdminLog::class.java)
    }
}
