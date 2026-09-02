package com.company.krishivishal.data.repository

import com.company.krishivishal.core.model.Batch
import com.company.krishivishal.core.model.Sku
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.data.local.BatchDao
import com.company.krishivishal.data.local.SkuDao
import com.company.krishivishal.di.IoDispatcher
import com.company.krishivishal.utils.networkBoundResource
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

interface SkuRepository {
    fun getSkusByProductId(productId: String): Flow<Resource<List<Sku>>>
    fun getSkuByCode(skuCode: String): Flow<Resource<Sku?>>
    fun getSkuByBarcode(barcode: String): Flow<Resource<Sku?>>
    fun getLowStockSkus(): Flow<Resource<List<Sku>>>
    fun getBatchesBySku(skuCode: String): Flow<Resource<List<Batch>>>
    fun getExpiringBatches(thresholdDays: Int = 30): Flow<Resource<List<Batch>>>

    // Mutations strictly via authenticated Cloud Functions
    suspend fun adjustInventory(skuCode: String, adjustment: Int, reason: String): Flow<Resource<Unit>>
    suspend fun receiveGrn(payload: Map<String, Any?>): Flow<Resource<Unit>>
    suspend fun writeOffStock(skuCode: String, quantity: Int, type: String, reason: String): Flow<Resource<Unit>>
}

@Singleton
class SkuRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val functions: FirebaseFunctions,
    private val skuDao: SkuDao,
    private val batchDao: BatchDao,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : SkuRepository {

    override fun getSkusByProductId(productId: String): Flow<Resource<List<Sku>>> {
        return networkBoundResource(
            query = { skuDao.getSkusByProductId(productId) },
            fetch = {
                val snapshot = firestore.collection("skus")
                    .whereEqualTo("productId", productId)
                    .whereEqualTo("isActive", true)
                    .get()
                    .await()
                snapshot.documents.mapNotNull { it.toObject(Sku::class.java) }
            },
            saveFetchResult = { skus ->
                if (skus.isNotEmpty()) {
                    skuDao.insertSkus(skus)
                }
            }
        ).flowOn(ioDispatcher)
    }

    override fun getSkuByCode(skuCode: String): Flow<Resource<Sku?>> {
        return networkBoundResource(
            query = { skuDao.getSkuByCodeFlow(skuCode) },
            fetch = {
                val doc = firestore.collection("skus").document(skuCode).get().await()
                doc.toObject(Sku::class.java)
            },
            saveFetchResult = { sku ->
                if (sku != null) {
                    skuDao.insertSku(sku)
                }
            }
        ).flowOn(ioDispatcher)
    }

    override fun getSkuByBarcode(barcode: String): Flow<Resource<Sku?>> = flow<Resource<Sku?>> {
        emit(Resource.Loading())
        try {
            // 1. Check local cache first
            val cached = skuDao.getSkuByBarcode(barcode)
            if (cached != null) {
                emit(Resource.Success(cached))
            }

            // 2. Fetch from Firestore by barcode
            val snap = firestore.collection("skus")
                .whereEqualTo("barcode.ean13", barcode)
                .limit(1)
                .get()
                .await()

            if (!snap.isEmpty) {
                val sku = snap.documents[0].toObject(Sku::class.java)
                if (sku != null) {
                    skuDao.insertSku(sku)
                    emit(Resource.Success(sku))
                    return@flow
                }
            }

            // Fallback: Check if barcode is skuCode itself
            val docSnap = firestore.collection("skus").document(barcode).get().await()
            if (docSnap.exists()) {
                val sku = docSnap.toObject(Sku::class.java)
                if (sku != null) {
                    skuDao.insertSku(sku)
                    emit(Resource.Success(sku))
                    return@flow
                }
            }

            if (cached == null) {
                emit(Resource.Error("No SKU found matching barcode '$barcode'"))
            }
        } catch (e: Exception) {
            emit(Resource.Error(e.message ?: "Failed to resolve barcode"))
        }
    }.flowOn(ioDispatcher)

    override fun getLowStockSkus(): Flow<Resource<List<Sku>>> {
        return networkBoundResource(
            query = { skuDao.getLowStockSkus() },
            fetch = {
                val snap = firestore.collection("skus")
                    .whereEqualTo("isActive", true)
                    .get()
                    .await()
                snap.documents.mapNotNull { it.toObject(Sku::class.java) }
                    .filter { it.availableStock <= it.reorderLevel }
            },
            saveFetchResult = { skus ->
                if (skus.isNotEmpty()) {
                    skuDao.insertSkus(skus)
                }
            }
        ).flowOn(ioDispatcher)
    }

    override fun getBatchesBySku(skuCode: String): Flow<Resource<List<Batch>>> {
        return networkBoundResource(
            query = { batchDao.getBatchesBySku(skuCode) },
            fetch = {
                val snap = firestore.collection("skus")
                    .document(skuCode)
                    .collection("batches")
                    .whereEqualTo("isActive", true)
                    .get()
                    .await()
                snap.documents.mapNotNull { it.toObject(Batch::class.java) }
            },
            saveFetchResult = { batches ->
                if (batches.isNotEmpty()) {
                    batchDao.insertBatches(batches)
                }
            }
        ).flowOn(ioDispatcher)
    }

    override fun getExpiringBatches(thresholdDays: Int): Flow<Resource<List<Batch>>> = flow {
        emit(Resource.Loading())
        try {
            val thresholdEpoch = System.currentTimeMillis() + (thresholdDays.toLong() * 24 * 3600 * 1000)
            val snap = firestore.collectionGroup("batches")
                .whereEqualTo("isActive", true)
                .whereEqualTo("qualityStatus", "PASSED")
                .get()
                .await()

            val batches = snap.documents.mapNotNull { it.toObject(Batch::class.java) }
                .filter { it.expiryDate != null && it.expiryDate!! <= thresholdEpoch }
                .sortedBy { it.expiryDate }

            batchDao.insertBatches(batches)
            emit(Resource.Success(batches))
        } catch (e: Exception) {
            emit(Resource.Error(e.message ?: "Failed to load expiring batches"))
        }
    }.flowOn(ioDispatcher)

    override suspend fun adjustInventory(
        skuCode: String,
        adjustment: Int,
        reason: String
    ): Flow<Resource<Unit>> = flow {
        emit(Resource.Loading())
        try {
            functions.getHttpsCallable("adjustInventory")
                .call(
                    mapOf(
                        "skuCode" to skuCode,
                        "adjustment" to adjustment,
                        "reason" to reason
                    )
                ).await()
            emit(Resource.Success(Unit))
        } catch (e: Exception) {
            emit(Resource.Error(e.message ?: "Inventory adjustment failed"))
        }
    }.flowOn(ioDispatcher)

    override suspend fun receiveGrn(payload: Map<String, Any?>): Flow<Resource<Unit>> = flow {
        emit(Resource.Loading())
        try {
            functions.getHttpsCallable("receiveGrn")
                .call(payload)
                .await()
            emit(Resource.Success(Unit))
        } catch (e: Exception) {
            emit(Resource.Error(e.message ?: "GRN receipt failed"))
        }
    }.flowOn(ioDispatcher)

    override suspend fun writeOffStock(
        skuCode: String,
        quantity: Int,
        type: String,
        reason: String
    ): Flow<Resource<Unit>> = flow {
        emit(Resource.Loading())
        try {
            functions.getHttpsCallable("writeOffStock")
                .call(
                    mapOf(
                        "skuCode" to skuCode,
                        "quantity" to quantity,
                        "type" to type,
                        "reason" to reason
                    )
                ).await()
            emit(Resource.Success(Unit))
        } catch (e: Exception) {
            emit(Resource.Error(e.message ?: "Stock write-off failed"))
        }
    }.flowOn(ioDispatcher)
}
