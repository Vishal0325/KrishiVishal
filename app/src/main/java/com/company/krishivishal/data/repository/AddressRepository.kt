package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.UserDao
import com.company.krishivishal.core.model.Address
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.networkBoundResource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton
import com.company.krishivishal.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher

interface AddressRepository {
    fun getAddresses(userId: String): Flow<Resource<List<Address>>>
    fun addAddress(address: Address): Flow<Resource<Unit>>
    fun updateAddress(address: Address): Flow<Resource<Unit>>
    fun deleteAddress(address: Address): Flow<Resource<Unit>>
}

@Singleton
class AddressRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val userDao: UserDao,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : AddressRepository {

    override fun getAddresses(userId: String): Flow<Resource<List<Address>>> = networkBoundResource(
        query = { 
            val effectiveId = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid ?: userId
            userDao.getAddressesByUserId(effectiveId) 
        },
        fetch = {
            val effectiveId = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid ?: userId
            if (effectiveId.isBlank() || effectiveId == "guest_user") {
                emptyList()
            } else {
                val snapshot = firestore.collection("users").document(effectiveId)
                    .collection("addresses")
                    .get()
                    .await()
                
                snapshot.documents.mapNotNull { doc ->
                    val addr = doc.toObject(Address::class.java)
                    addr?.apply {
                        if (id.isBlank()) id = doc.id
                        if (this.userId.isBlank()) this.userId = effectiveId
                    }
                }
            }
        },
        saveFetchResult = { addresses ->
            val effectiveId = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid ?: userId
            if (effectiveId.isNotBlank() && effectiveId != "guest_user") {
                val remoteIds = addresses.map { it.id }.filter { it.isNotBlank() }
                if (remoteIds.isEmpty()) {
                    userDao.deleteAllAddressesByUserId(effectiveId)
                } else {
                    userDao.deleteAddressesNotInList(effectiveId, remoteIds)
                }
                addresses.forEach { userDao.insertAddress(it.copy(userId = effectiveId)) }
            }
        },
        dispatcher = ioDispatcher
    )

    override fun addAddress(address: Address): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        val currentFirebaseUser = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser
        val effectiveUserId = currentFirebaseUser?.uid ?: address.userId.takeIf { it.isNotBlank() && it != "guest_user" }
        
        if (effectiveUserId.isNullOrBlank() || effectiveUserId == "guest_user") {
            throw IllegalStateException("Aap logged in nahi hain. Kripya pehle mobile number se login karein.")
        }

        val addressId = if (address.id.isBlank()) java.util.UUID.randomUUID().toString() else address.id
        val finalAddress = address.copy(id = addressId, userId = effectiveUserId)

        // If this is default, set other addresses to non-default
        if (finalAddress.isDefault) {
            try {
                val snapshot = firestore.collection("users").document(effectiveUserId)
                    .collection("addresses")
                    .whereEqualTo("is_default", true)
                    .get()
                    .await()
                
                for (doc in snapshot.documents) {
                    if (doc.id != addressId) {
                        doc.reference.update("is_default", false).await()
                    }
                }
            } catch (e: Exception) {
                timber.log.Timber.w(e, "Could not update other default addresses in Firestore: ${e.message}")
            }
        }

        firestore.collection("users").document(effectiveUserId)
            .collection("addresses")
            .document(addressId)
            .set(finalAddress)
            .await()
        
        userDao.insertAddress(finalAddress)
    }

    override fun updateAddress(address: Address): Flow<Resource<Unit>> = addAddress(address)

    override fun deleteAddress(address: Address): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        if (address.id.isNotBlank()) {
            firestore.collection("users").document(address.userId)
                .collection("addresses")
                .document(address.id)
                .delete()
                .await()
        }
        userDao.deleteAddress(address)
    }
}
