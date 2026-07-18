package com.company.krishivishal.domain.usecase.order

import com.company.krishivishal.data.repository.OrderTrackingRepository
import com.company.krishivishal.model.OrderTrackingState
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class TrackOrderUseCase @Inject constructor(
    private val trackingRepository: OrderTrackingRepository
) {
    operator fun invoke(orderId: String): Flow<OrderTrackingState> {
        return trackingRepository.trackOrder(orderId)
    }
}
