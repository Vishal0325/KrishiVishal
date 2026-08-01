package com.company.krishivishal.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.Coupon
import com.company.krishivishal.domain.usecase.admin.ManageCouponsUseCase
import com.company.krishivishal.core.util.Resource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AdminCouponViewModel @Inject constructor(
    private val manageCouponsUseCase: ManageCouponsUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(AdminCouponUiState())
    val uiState: StateFlow<AdminCouponUiState> = _uiState.asStateFlow()

    init {
        loadCoupons()
    }

    fun loadCoupons() {
        viewModelScope.launch {
            manageCouponsUseCase.getCoupons().collect { resource ->
                _uiState.update { it.copy(couponsResource = resource) }
            }
        }
    }

    fun saveCoupon(coupon: Coupon) {
        viewModelScope.launch {
            manageCouponsUseCase.saveCoupon(coupon).collect { resource ->
                if (resource is Resource.Success) {
                    loadCoupons()
                }
            }
        }
    }

    fun deleteCoupon(couponId: String) {
        viewModelScope.launch {
            manageCouponsUseCase.deleteCoupon(couponId).collect { resource ->
                if (resource is Resource.Success) {
                    loadCoupons()
                }
            }
        }
    }
}

data class AdminCouponUiState(
    val couponsResource: Resource<List<Coupon>> = Resource.Loading()
)
