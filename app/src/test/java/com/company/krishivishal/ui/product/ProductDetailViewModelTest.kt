package com.company.krishivishal.ui.product

import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.Review
import com.company.krishivishal.core.model.User
import com.company.krishivishal.core.model.Variant
import com.company.krishivishal.data.repository.CartRepository
import com.company.krishivishal.data.repository.CheckoutSessionRepository
import com.company.krishivishal.data.repository.WishlistRepository
import com.company.krishivishal.domain.usecase.auth.GetCurrentUserUseCase
import com.company.krishivishal.domain.usecase.product.GetProductDetailsUseCase
import com.company.krishivishal.domain.usecase.product.GetProductReviewsUseCase
import com.company.krishivishal.domain.usecase.product.GetProductVariantsUseCase
import com.company.krishivishal.domain.usecase.product.ToggleProductWishlistUseCase
import com.company.krishivishal.utils.MainDispatcherRule
import com.company.krishivishal.core.util.Resource
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProductDetailViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var viewModel: ProductDetailViewModel
    private val getProductDetailsUseCase = mockk<GetProductDetailsUseCase>()
    private val getProductVariantsUseCase = mockk<GetProductVariantsUseCase>()
    private val getProductReviewsUseCase = mockk<GetProductReviewsUseCase>()
    private val toggleProductWishlistUseCase = mockk<ToggleProductWishlistUseCase>()
    private val getCurrentUserUseCase = mockk<GetCurrentUserUseCase>()
    private val cartRepository = mockk<CartRepository>()
    private val checkoutSessionRepository = mockk<CheckoutSessionRepository>()
    private val wishlistRepository = mockk<com.company.krishivishal.data.repository.WishlistRepository>()
    private val productRepository = mockk<com.company.krishivishal.data.repository.ProductRepository>(relaxed = true)
    private val configRepository = mockk<com.company.krishivishal.data.repository.ConfigRepository>(relaxed = true)
    private val productDao = mockk<com.company.krishivishal.data.local.ProductDao>(relaxed = true)
    private val userDao = mockk<com.company.krishivishal.data.local.UserDao>(relaxed = true)
    private val analyticsTracker = mockk<com.company.krishivishal.analytics.AnalyticsTracker>(relaxed = true)

    private val testProduct = Product(id = "p1", name = "Test Product")
    private val testVariants = listOf(Variant(id = "v1", productId = "p1", size = "1kg"))
    private val testReviews = listOf(Review(id = "r1", productId = "p1", userName = "User1", comment = "Good"))
    private val testUser = User(id = "u1", name = "Test User")

    @Before
    fun setup() {
        every { getCurrentUserUseCase() } returns flowOf(testUser)
        
        viewModel = ProductDetailViewModel(
            getProductDetailsUseCase,
            getProductVariantsUseCase,
            getProductReviewsUseCase,
            toggleProductWishlistUseCase,
            getCurrentUserUseCase,
            cartRepository,
            checkoutSessionRepository,
            wishlistRepository,
            productRepository,
            configRepository,
            productDao,
            userDao,
            analyticsTracker
        )
    }

    @Test
    fun `loadProduct should update state with product, variants and reviews`() = runTest {
        val productId = "p1"
        every { getProductDetailsUseCase(productId) } returns flowOf(Resource.Success(testProduct))
        every { getProductVariantsUseCase(productId) } returns flowOf(Resource.Success(testVariants))
        every { getProductReviewsUseCase(productId) } returns flowOf(Resource.Success(testReviews))
        every { wishlistRepository.getWishlist(any()) } returns flowOf(Resource.Success(emptyList()))

        viewModel.loadProduct(productId)

        assertEquals(testProduct, viewModel.uiState.value.product)
        assertEquals(testVariants, viewModel.uiState.value.variants)
        assertEquals(testReviews, viewModel.uiState.value.reviews)
        assertEquals(false, viewModel.uiState.value.isProductLoading)
    }

    @Test
    fun `toggleWishlist should call usecase and update state`() = runTest {
        val productId = "p1"
        every { getProductDetailsUseCase(productId) } returns flowOf(Resource.Success(testProduct))
        every { getProductVariantsUseCase(productId) } returns flowOf(Resource.Success(testVariants))
        every { getProductReviewsUseCase(productId) } returns flowOf(Resource.Success(testReviews))
        every { wishlistRepository.getWishlist(any()) } returns flowOf(Resource.Success(emptyList()))

        viewModel.loadProduct(productId)
        
        coEvery { toggleProductWishlistUseCase(testProduct, any()) } returns flowOf(Resource.Success(Unit))

        viewModel.toggleWishlist()

        assertEquals(true, viewModel.uiState.value.isWishlisted)
    }
}
