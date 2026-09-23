package com.company.krishivishaldelivery.data.repository

import com.company.krishivishaldelivery.data.model.ServiceBooking
import com.company.krishivishaldelivery.data.model.PartnerWallet
import com.company.krishivishaldelivery.data.model.PartnerWalletTransaction
import kotlinx.coroutines.flow.Flow

interface ServiceBookingRepository {
    fun getActiveBooking(partnerId: String): Flow<ServiceBooking?>
    suspend fun acceptBooking(bookingId: String): Boolean
    suspend fun rejectBooking(bookingId: String, reason: String? = null): Boolean
    suspend fun verifyStartOtp(bookingId: String, otp: String): Boolean
    suspend fun updateActualArea(bookingId: String, area: Double): Boolean
    suspend fun verifyEndOtp(bookingId: String, otp: String, actualArea: Double? = null): Boolean
    fun getPartnerWallet(partnerId: String): Flow<PartnerWallet?>
    fun getWalletTransactions(partnerId: String): Flow<List<PartnerWalletTransaction>>
    suspend fun rechargeWallet(partnerId: String, amount: Double): Boolean
    suspend fun updatePartnerSkills(partnerId: String, skills: List<String>, equipment: List<String>): Boolean
}

