package com.company.krishivishal.ui.home

import app.cash.turbine.test
import com.company.krishivishal.data.local.UserDao
import com.company.krishivishal.core.model.User
import com.company.krishivishal.data.repository.*
import com.company.krishivishal.domain.usecase.home.*
import com.company.krishivishal.utils.MainDispatcherRule
import com.company.krishivishal.core.util.Resource
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test

class HomeViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var viewModel: HomeViewModel

    // Mocks
    private val getHomeFeedUseCase: GetHomeFeedUseCase = mockk()
    private val getFilteredProductsUseCase: GetFilteredProductsUseCase = mockk()
    private val productRepository: ProductRepository = mockk(relaxed = true)
    private val cartRepository: CartRepository = mockk()
    private val authRepository: AuthRepository = mockk()
    private val wishlistRepository: WishlistRepository = mockk()
    private val analyticsTracker: com.company.krishivishal.analytics.AnalyticsTracker = mockk(relaxed = true)
    private val configRepository: ConfigRepository = mockk(relaxed = true)
    private val orderRepository: OrderRepository = mockk(relaxed = true)
    private val productDao: com.company.krishivishal.data.local.ProductDao = mockk(relaxed = true)
    private val userDao: UserDao = mockk(relaxed = true)

    @Before
    fun setup() {
        // Setup default mock behaviors before initializing ViewModel
        every { getHomeFeedUseCase() } returns flowOf(HomeFeedData())
        every { getFilteredProductsUseCase(any(), any()) } returns flowOf(Resource.Success(emptyList()))
        coEvery { authRepository.getCurrentUser() } returns flowOf(null)
        coEvery { authRepository.signInAnonymously() } returns Resource.Success(User(id = "guest_user"))
        coEvery { cartRepository.getCartCount(any()) } returns flowOf(0)
        coEvery { wishlistRepository.getWishlist(any()) } returns flowOf(Resource.Success(emptyList()))

        viewModel = HomeViewModel(
            getHomeFeedUseCase = getHomeFeedUseCase,
            getFilteredProductsUseCase = getFilteredProductsUseCase,
            productRepository = productRepository,
            cartRepository = cartRepository,
            authRepository = authRepository,
            wishlistRepository = wishlistRepository,
            configRepository = configRepository,
            orderRepository = orderRepository,
            analyticsTracker = analyticsTracker,
            productDao = productDao,
            userDao = userDao
        )
    }

    @Test
    fun `onSearchQueryChange updates searchQuery state`() = runTest {
        viewModel.searchQuery.test {
            // Initial state is empty
            assertEquals("", awaitItem())

            // Update query
            viewModel.onSearchQueryChange("Tractor")
            assertEquals("Tractor", awaitItem())

            cancelAndIgnoreRemainingEvents()
        }
    }
}
