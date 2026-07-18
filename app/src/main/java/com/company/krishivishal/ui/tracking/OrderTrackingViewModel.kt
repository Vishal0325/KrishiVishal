package com.company.krishivishal.ui.tracking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.domain.usecase.order.TrackOrderUseCase
import com.company.krishivishal.model.OrderTrackingState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import javax.inject.Inject

@HiltViewModel
class OrderTrackingViewModel @Inject constructor(
    private val trackOrderUseCase: TrackOrderUseCase
) : ViewModel() {

    private val _orderId = MutableStateFlow<String?>(null)

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    val trackingState: StateFlow<OrderTrackingState> = _orderId
        .flatMapLatest { id ->
            if (id != null) {
                trackOrderUseCase(id)
            } else {
                flowOf(OrderTrackingState(isLoading = false))
            }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = OrderTrackingState(isLoading = true)
        )

    fun setOrderId(id: String) {
        _orderId.value = id
    }
}
