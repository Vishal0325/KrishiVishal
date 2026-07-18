package com.company.krishivishal.data.repository

import com.company.krishivishal.data.model.*
import com.company.krishivishal.utils.Resource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
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
        firestore.collection("users").document(userId).update("role", role).await()
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
        val id = firestore.collection("admin_logs").document().id
        firestore.collection("admin_logs").document(id).set(log.copy(id = id)).await()
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
