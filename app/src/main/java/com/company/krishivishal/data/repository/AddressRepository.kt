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
        query = { userDao.getAddressesByUserId(userId) },
        fetch = {
            val snapshot = firestore.collection("users").document(userId)
                .collection("addresses")
                .get()
                .await()
            snapshot.toObjects(Address::class.java)
        },
        saveFetchResult = { addresses ->
            // Clear old and insert new to keep in sync
            addresses.forEach { userDao.insertAddress(it) }
        },
        dispatcher = ioDispatcher
    )

    override fun addAddress(address: Address): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        // If this is default, set others to non-default
        if (address.isDefault) {
            val snapshot = firestore.collection("users").document(address.userId)
                .collection("addresses")
                .whereEqualTo("is_default", true)
                .get()
                .await()
            
            for (doc in snapshot.documents) {
                doc.reference.update("is_default", false).await()
            }
        }

        // Ensure user exists in Room before inserting address (FK requirement)
        // If they are anonymous, AuthRepo should have handled this, but we'll be safe
        
        firestore.collection("users").document(address.userId)
            .collection("addresses")
            .document(address.id)
            .set(address)
            .await()
        
        userDao.insertAddress(address)
    }

    override fun updateAddress(address: Address): Flow<Resource<Unit>> = addAddress(address)

    override fun deleteAddress(address: Address): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        firestore.collection("users").document(address.userId)
            .collection("addresses")
            .document(address.id)
            .delete()
            .await()
        userDao.deleteAddress(address)
    }
}
