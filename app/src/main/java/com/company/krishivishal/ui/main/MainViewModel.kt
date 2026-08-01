package com.company.krishivishal.ui.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.data.repository.AuthRepository
import com.company.krishivishal.data.repository.CartRepository
import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.core.util.Constants
import com.company.krishivishal.ui.navigation.BadgeState
import com.company.krishivishal.ui.navigation.BottomBarState
import com.company.krishivishal.ui.navigation.BottomNavItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * ViewModel for the Main Activity/Screen, responsible for Bottom Bar state and badges.
 */
@HiltViewModel
class MainViewModel @Inject constructor(
    private val cartRepository: CartRepository,
    private val orderRepository: OrderRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _bottomBarState = MutableStateFlow(BottomBarState())
    val bottomBarState: StateFlow<BottomBarState> = _bottomBarState.asStateFlow()

    init {
        observeCartCount()
        observeActiveOrders()
    }

    private fun observeCartCount() {
        viewModelScope.launch {
            authRepository.getCurrentUser().collectLatest { user ->
                val userId = user?.id ?: Constants.GUEST_USER_ID
                cartRepository.getCartWithProducts(userId).collectLatest { resource ->
                    val count = resource.data?.size ?: 0
                    updateBadge(BottomNavItem.Home.index, count)
                }
            }
        }
    }

    private fun observeActiveOrders() {
        viewModelScope.launch {
            authRepository.getCurrentUser().collectLatest { user ->
                user?.id?.let { userId ->
                    orderRepository.getOrders(userId).collectLatest { resource ->
                        // Count orders that are not yet finalized
                        val activeOrders = resource.data?.filter { 
                            it.status != "DELIVERED" && it.status != "CANCELLED" 
                        }?.size ?: 0
                        updateBadge(BottomNavItem.Orders.index, activeOrders)
                    }
                }
            }
        }
    }

    private fun updateBadge(index: Int, count: Int) {
        _bottomBarState.update { state ->
            val newBadges = state.badges.toMutableMap()
            newBadges[index] = BadgeState(
                count = count,
                isVisible = count > 0
            )
            state.copy(badges = newBadges)
        }
    }

    /**
     * Updates the selected item in the bottom bar state.
     */
    fun onItemSelected(index: Int) {
        _bottomBarState.update { it.copy(selectedItem = BottomNavItem.fromIndex(index)) }
    }
}
