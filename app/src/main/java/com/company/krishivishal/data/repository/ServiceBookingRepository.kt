package com.company.krishivishal.data.repository

import com.company.krishivishal.core.model.AgriService
import com.company.krishivishal.core.model.ServiceVariant
import com.company.krishivishal.core.model.ServiceBooking
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import timber.log.Timber
import java.util.UUID

interface ServiceBookingRepository {
    fun getAvailableServices(): Flow<List<AgriService>>
    suspend fun getServiceById(serviceId: String): AgriService?
    suspend fun createBooking(booking: ServiceBooking): String
    fun getBookingStatus(bookingId: String): Flow<ServiceBooking?>
}

class ServiceBookingRepositoryImpl : ServiceBookingRepository {
    private val firestore = FirebaseFirestore.getInstance()

    private fun mapToAgriService(id: String, data: Map<String, Any>?): AgriService? {
        if (data == null) return null
        return try {
            val variantsList = (data["variants"] as? List<Map<String, Any>>)?.map { v ->
                ServiceVariant(
                    id = v["id"] as? String ?: "",
                    name = v["name"] as? String ?: "",
                    capacityInfo = v["capacityInfo"] as? String ?: "",
                    price = (v["price"] as? Number)?.toDouble() ?: 0.0
                )
            } ?: emptyList()

            AgriService(
                id = id,
                name = data["name"] as? String ?: "",
                icon = data["icon"] as? String ?: "",
                imageUrl = data["imageUrl"] as? String ?: "",
                description = data["description"] as? String ?: "",
                rateType = data["rateType"] as? String ?: "PER_ACRE",
                customRateUnit = data["customRateUnit"] as? String,
                baseRate = (data["baseRate"] as? Number)?.toDouble() ?: 0.0,
                includesMaterial = data["includesMaterial"] as? Boolean ?: false,
                rating = (data["rating"] as? Number)?.toDouble() ?: 4.8,
                radiusKm = (data["radiusKm"] as? Number)?.toInt() ?: 3,
                isActive = data["isActive"] as? Boolean ?: true,
                hasVariants = data["hasVariants"] as? Boolean ?: false,
                variants = variantsList
            )
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    override fun getAvailableServices(): Flow<List<AgriService>> = callbackFlow {
        val subscription = firestore.collection("services")
            .whereEqualTo("isActive", true)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                if (snapshot != null) {
                    val services = snapshot.documents.mapNotNull { doc ->
                        mapToAgriService(doc.id, doc.data)
                    }
                    trySend(services)
                }
            }

        awaitClose { subscription.remove() }
    }

    override suspend fun getServiceById(serviceId: String): AgriService? {
        return try {
            val doc = firestore.collection("services").document(serviceId).get().await()
            mapToAgriService(doc.id, doc.data)
        } catch (e: Exception) {
            null
        }
    }

    override suspend fun createBooking(booking: ServiceBooking): String {
        return try {
            val functions = com.google.firebase.functions.FirebaseFunctions.getInstance("asia-south1")
            val data = hashMapOf(
                "serviceId" to booking.serviceId,
                "serviceName" to booking.serviceName,
                "farmLocation" to "Plot Farm Location",
                "farmArea" to (booking.farmArea ?: 1.0),
                "areaUnit" to booking.areaUnit,
                "amount" to booking.amount,
                "paymentMethod" to booking.paymentMethod
            )
            val result = functions.getHttpsCallable("createServiceBooking").call(data).await()
            val resultMap = result.data as? Map<*, *>
            val bookingId = resultMap?.get("bookingId") as? String
            if (bookingId.isNullOrEmpty()) {
                Timber.e("createServiceBooking returned an invalid or null bookingId")
                "error_booking_failed"
            } else {
                bookingId
            }
        } catch (e: Exception) {
            Timber.e(e, "Service booking creation failed via Cloud Function: ${e.message}")
            "error_booking_failed"
        }
    }


    override fun getBookingStatus(bookingId: String): Flow<ServiceBooking?> = callbackFlow {
        val subscription = firestore.collection("service_bookings").document(bookingId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                if (snapshot != null && snapshot.exists()) {
                    val booking = snapshot.toObject(ServiceBooking::class.java)?.copy(id = snapshot.id)
                    trySend(booking)
                }
            }

        awaitClose { subscription.remove() }
    }
}
