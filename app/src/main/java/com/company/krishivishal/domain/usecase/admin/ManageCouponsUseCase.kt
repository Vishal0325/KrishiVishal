package com.company.krishivishal.domain.usecase.admin

import com.company.krishivishal.core.model.Coupon
import com.company.krishivishal.data.repository.AdminRepository
import com.company.krishivishal.core.util.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class ManageCouponsUseCase @Inject constructor(
    private val repository: AdminRepository
) {
    fun getCoupons(): Flow<Resource<List<Coupon>>> = repository.getCoupons()
    
    fun saveCoupon(coupon: Coupon): Flow<Resource<Unit>> = repository.saveCoupon(coupon)
    
    fun deleteCoupon(couponId: String): Flow<Resource<Unit>> = repository.deleteCoupon(couponId)
}
