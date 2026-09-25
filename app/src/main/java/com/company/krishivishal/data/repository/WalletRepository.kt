package com.company.krishivishal.data.repository

import com.company.krishivishal.core.model.WalletTransaction
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.di.IoDispatcher
import com.company.krishivishal.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

/**
 * WalletRepository — manages all wallet operations for the customer app:
 *   - Real-time wallet balance listener (Firestore snapshot)
 *   - Transaction history (Cloud Function call)
 *   - Top-up: create Razorpay order + verify payment
 *   - Checkout debit (payWithWallet Cloud Function)
 */
interface WalletRepository {
    /** Real-time wallet balance stream from Firestore. */
    fun getBalanceStream(userId: String): Flow<Double>

    /** Paginated wallet transaction history. */
    fun getHistory(userId: String): Flow<Resource<List<WalletTransaction>>>

    /** Step 1 of top-up: create Razorpay order on server, returns (razorpayOrderId, topUpId, keyId). */
    fun createTopUpOrder(amount: Double): Flow<Resource<TopUpOrderResult>>

    /** Step 2 of top-up: verify Razorpay payment & credit wallet. */
    fun verifyTopUp(
        topUpId: String,
        razorpayPaymentId: String,
        razorpayOrderId: String,
        razorpaySignature: String
    ): Flow<Resource<Double>>

    /** Pay for an order using wallet balance. Called after WALLET payment method chosen at checkout. */
    fun payOrderWithWallet(orderId: String): Flow<Resource<Unit>>
}

data class TopUpOrderResult(
    val topUpId: String,
    val razorpayOrderId: String,
    val amount: Double,
    val keyId: String,
)

@Singleton
class WalletRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val functions: FirebaseFunctions,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : WalletRepository {

    override fun getBalanceStream(userId: String): Flow<Double> = callbackFlow {
        val docRef = firestore.collection("users").document(userId)
        val listener = docRef.addSnapshotListener { snap, error ->
            if (error != null) return@addSnapshotListener
            val balance = snap?.getDouble("walletBalance") ?: 0.0
            trySend(balance)
        }
        awaitClose { listener.remove() }
    }

    override fun getHistory(userId: String): Flow<Resource<List<WalletTransaction>>> =
        safeCall(ioDispatcher) {
            val result = functions
                .getHttpsCallable("getWalletHistory")
                .call()
                .await()

            @Suppress("UNCHECKED_CAST")
            val data = result.data as? Map<String, Any> ?: emptyMap()

            @Suppress("UNCHECKED_CAST")
            val txns = (data["transactions"] as? List<Map<String, Any>>) ?: emptyList()

            txns.map { map ->
                WalletTransaction(
                    id = map["id"] as? String ?: "",
                    type = map["type"] as? String ?: "",
                    amount = (map["amount"] as? Number)?.toDouble() ?: 0.0,
                    description = map["description"] as? String ?: "",
                    orderId = map["orderId"] as? String,
                    returnId = map["returnId"] as? String,
                    razorpayPaymentId = map["razorpayPaymentId"] as? String,
                    timestamp = when (val t = map["timestamp"] ?: map["timestampMs"]) {
                        is Number -> java.util.Date(t.toLong())
                        is String -> {
                            try {
                                java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
                                    timeZone = java.util.TimeZone.getTimeZone("UTC")
                                }.parse(t) ?: java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US).apply {
                                    timeZone = java.util.TimeZone.getTimeZone("UTC")
                                }.parse(t)
                            } catch (_: Exception) {
                                try {
                                    java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US).parse(t)
                                } catch (_: Exception) { null }
                            }
                        }
                        else -> null
                    }
                )
            }
        }

    override fun createTopUpOrder(amount: Double): Flow<Resource<TopUpOrderResult>> =
        safeCall(ioDispatcher) {
            val result = functions
                .getHttpsCallable("createWalletTopUpOrder")
                .call(mapOf("amount" to amount))
                .await()

            @Suppress("UNCHECKED_CAST")
            val data = result.data as? Map<String, Any>
                ?: throw Exception("Invalid server response for top-up order.")

            TopUpOrderResult(
                topUpId = data["topUpId"] as? String ?: throw Exception("Missing topUpId."),
                razorpayOrderId = data["razorpayOrderId"] as? String ?: throw Exception("Missing razorpayOrderId."),
                amount = (data["amount"] as? Number)?.toDouble() ?: amount,
                keyId = data["keyId"] as? String ?: throw Exception("Missing keyId.")
            )
        }

    override fun verifyTopUp(
        topUpId: String,
        razorpayPaymentId: String,
        razorpayOrderId: String,
        razorpaySignature: String
    ): Flow<Resource<Double>> = safeCall(ioDispatcher) {
        val result = functions
            .getHttpsCallable("verifyWalletTopUp")
            .call(mapOf(
                "topUpId" to topUpId,
                "razorpayPaymentId" to razorpayPaymentId,
                "razorpayOrderId" to razorpayOrderId,
                "razorpaySignature" to razorpaySignature
            ))
            .await()

        @Suppress("UNCHECKED_CAST")
        val data = result.data as? Map<String, Any> ?: emptyMap()
        (data["creditedAmount"] as? Number)?.toDouble() ?: 0.0
    }

    override fun payOrderWithWallet(orderId: String): Flow<Resource<Unit>> =
        safeCall(ioDispatcher) {
            functions
                .getHttpsCallable("payWithWallet")
                .call(mapOf("orderId" to orderId))
                .await()
            Unit
        }
}
