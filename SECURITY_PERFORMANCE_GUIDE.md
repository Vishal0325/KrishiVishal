# Security, Performance & Edge Cases Implementation Guide

## Overview
Complete system implementation for:
- **Security**: API key protection, SSL pinning, token management
- **Performance**: Image caching, lazy loading, pagination
- **Edge Cases**: Payment retries, session management, offline UX

---

## SECURITY LAYER

### 1. Secure Storage (`SecureStorage.kt`)
Uses Android's `EncryptedSharedPreferences` for encryption at rest.

**Features:**
- AES-256-GCM encryption
- Automatic key generation via MasterKey
- Secure storage for: tokens, keys, user ID
- Data integrity verification
- Auto-clear on logout

**API:**
```kotlin
@Inject
lateinit var secureStorage: SecureStorage

// Save tokens
secureStorage.saveAuthToken(token)
secureStorage.saveRefreshToken(refreshToken)
secureStorage.saveTokenExpiry(expiryMs)

// Get tokens
val token = secureStorage.getAuthToken()
val isExpired = secureStorage.isTokenExpired()

// Save API keys
secureStorage.saveRazorpayKey(apiKey)
val key = secureStorage.getRazorpayKey()

// Logout
secureStorage.clearAllData()
```

**Where to Use:**
- On login: Save tokens
- On logout: Clear all
- Before API calls: Check if expired

### 2. Token Manager (`TokenManager.kt`)
Automatic token refresh with expiry handling.

**Features:**
- Automatic token refresh 5 minutes before expiry
- Uses Firebase's built-in refresh mechanism
- Thread-safe token access
- Expired session detection

**API:**
```kotlin
@Inject
lateinit var tokenManager: TokenManager

// Get valid token (auto-refreshes if needed)
val token = tokenManager.getValidToken()

// Save tokens after login
tokenManager.saveToken(authToken, refreshToken, expiryMs)

// Check authentication status
val isAuth = tokenManager.isAuthenticated()

// Get time until expiry
val secondsLeft = tokenManager.getTimeToExpiry()

// Logout
tokenManager.clearTokens()
```

**Integration in Repository:**
```kotlin
class AuthRepositoryImpl : AuthRepository {
    override suspend fun makeAuthenticatedCall(): Result {
        val token = tokenManager.getValidToken() ?: return handleUnauth()
        return api.callWithToken("Bearer $token")
    }
}
```

### 3. Certificate Pinning (`CertificatePinningManager.kt`)
SSL/TLS certificate pinning to prevent MITM attacks.

**Features:**
- SHA-256 certificate pinning
- Support for multiple domains (Firebase, Storage, Auth)
- TLSv1.3 enforcement
- System trust managers integration

**Setup:**
```kotlin
// Get pinned OkHttpClient
val pinnedClient = certificatePinningManager.createPinnedOkHttpClient()

// Verify certificate for domain
val isValid = certificatePinningManager.verifyCertificate("api.example.com")

// Get SSL context with proper trust
val sslContext = certificatePinningManager.getSSLContext()
```

**Update Certificate Pins:**
1. Get current Firebase certificates:
   - `openssl s_client -connect firestore.googleapis.com:443 -showcerts`
2. Extract SHA-256 hash for each certificate
3. Update `FIRESTORE_PIN`, `STORAGE_PIN`, `AUTH_PIN` constants
4. Deploy update

---

## PERFORMANCE LAYER

### 1. Image Caching (`ImageCacheManager.kt`)
Multi-level image caching using Coil library.

**Architecture:**
- **Memory Cache**: 128 MB in-memory (25% of available)
- **Disk Cache**: 512 MB on-disk (10% of disk space)
- **Network**: HTTP cache headers respected
- **Expiry**: 30 days for cached images

**API:**
```kotlin
@Inject
lateinit var imageCacheManager: ImageCacheManager

// Get ImageLoader for Compose/UI
val imageLoader = imageCacheManager.getImageLoader()

// Clear caches
imageCacheManager.clearMemoryCache()
imageCacheManager.clearDiskCache()
imageCacheManager.clearAllCaches()

// Get cache stats
val info = imageCacheManager.getCacheInfo()
val memoryUsage = info.getMemoryCacheUsagePercent()
val diskUsage = info.getDiskCacheUsagePercent()
```

**Usage in Compose:**
```kotlin
@Composable
fun ProductImage(imageUrl: String) {
    val imageLoader = imageCacheManager.getImageLoader()
    
    AsyncImage(
        model = imageUrl,
        contentDescription = "Product",
        imageLoader = imageLoader,
        modifier = Modifier.size(200.dp),
        contentScale = ContentScale.Crop
    )
}
```

### 2. Lazy Loading & Pagination (`PaginationManager.kt`)
Efficient data loading with pagination.

**Two Approaches:**

#### A. Jetpack Paging3 (Recommended)
```kotlin
// In Repository
fun getProducts(): Flow<PagingData<Product>> {
    return Pager(
        config = PagingConfig(pageSize = 20),
        pagingSourceFactory = {
            FirestorePagingSource(
                query = firestore.collection("products"),
                pageSize = 20,
                mapper = { snapshot ->
                    snapshot.toObjects(Product::class.java)
                }
            )
        }
    ).flow
}

// In Compose
val lazyPagingItems = pagingFlow.collectAsLazyPagingItems()

LazyColumn {
    items(lazyPagingItems.itemCount) { index ->
        ProductItem(lazyPagingItems[index])
    }
    
    when (lazyPagingItems.loadState.append) {
        is LoadState.Loading -> item { LoadingIndicator() }
        is LoadState.Error -> item { ErrorIndicator() }
        else -> {}
    }
}
```

#### B. Manual Lazy Loading
```kotlin
val lazyDataSource = LazyLoadingDataSource(
    totalCount = { firestore.collection("products").get().size },
    loadChunk = { offset, limit ->
        firestore.collection("products")
            .offset(offset)
            .limit(limit)
            .get()
            .toObjects(Product::class.java)
    },
    chunkSize = 20
)

// Load next chunk when user scrolls near end
val nextChunk = lazyDataSource.loadNextChunk()
if (lazyDataSource.hasMore()) {
    // Show load more button
}
```

---

## EDGE CASES LAYER

### 1. Payment Retry (`PaymentRetryManager.kt`)
Intelligent payment retry with exponential backoff.

**Features:**
- Up to 3 retry attempts
- Exponential backoff: 1s → 2s → 4s (max 30s)
- Error classification (retryable vs non-retryable)
- Detailed logging and error reporting
- Payment context preservation

**API:**
```kotlin
@Inject
lateinit var paymentRetryManager: PaymentRetryManager

// Execute payment with automatic retry
val success = paymentRetryManager.retryPayment(
    orderId = "ORD123",
    amount = 1500.0,
    failureReason = "razorpay_error",
    paymentOperation = {
        // Your payment logic
        razorpay.processPayment(...)
    }
)

// Check if error is retryable
if (paymentRetryManager.isRetryableError(errorMessage)) {
    // Retry automatically
}

// Get next retry delay
val delayMs = paymentRetryManager.getNextRetryDelay(attemptNumber = 1)

// Get user-friendly message
val message = paymentRetryManager.getRetryMessage(
    attemptNumber = 2,
    maxAttempts = 3
)
```

**Retry Logic:**
```
Attempt 1 (Fail) → Wait 1s → Attempt 2 (Fail) → Wait 2s → Attempt 3 (Fail) → Report Error
```

### 2. Session Management (`SessionManager.kt`)
Complete session lifecycle management.

**Features:**
- 30-minute inactivity timeout
- Automatic token expiry check every 5 minutes
- Session timeout monitoring
- Force logout on security concerns
- Activity tracking
- Session info for debugging

**API:**
```kotlin
@Inject
lateinit var sessionManager: SessionManager

// Start session on login
sessionManager.startSession(userId)

// Record user activity
sessionManager.recordActivity() // Call on every user action

// Set timeout listener
sessionManager.setSessionTimeoutListener { reason ->
    when (reason) {
        SessionTimeoutReason.INACTIVITY -> showInactivityDialog()
        SessionTimeoutReason.TOKEN_EXPIRED -> showLoginScreen()
        SessionTimeoutReason.LOGOUT -> navigateToAuth()
        SessionTimeoutReason.SECURITY_CONCERN -> showSecurityAlert()
    }
}

// Check session status
val isActive = sessionManager.isSessionActive()
val userId = sessionManager.getCurrentUserId()
val timeLeft = sessionManager.getTimeUntilTimeout()

// Force logout on security issue
sessionManager.forceLogout("Suspicious activity detected")

// End session on logout
sessionManager.endSession()

// Debug info
val info = sessionManager.getSessionInfo()
```

### 3. Offline Mode UI
Complete offline experience with retry capability.

**Screens Provided:**

#### OfflineModeScreen
```kotlin
OfflineModeScreen(
    onRetry = { connectivityObserver.checkConnection() }
)
```

#### SessionTimeoutWarning
```kotlin
SessionTimeoutWarning(
    timeRemainingSeconds = 300,
    onExtend = { sessionManager.recordActivity() },
    onLogout = { sessionManager.endSession() }
)
```

#### ExpiredSessionScreen
```kotlin
ExpiredSessionScreen(
    onLogin = { navigateToLogin() }
)
```

#### PaymentRetryScreen
```kotlin
PaymentRetryScreen(
    orderId = "ORD123",
    amount = "₹1,500",
    retryAttempt = 2,
    maxAttempts = 3,
    onRetry = { retryPayment() },
    onCancel = { cancelOrder() }
)
```

---

## INTEGRATION EXAMPLE

### Login Flow
```kotlin
@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepo: AuthRepository,
    private val secureStorage: SecureStorage,
    private val tokenManager: TokenManager,
    private val sessionManager: SessionManager,
    private val errorReporter: CrashlyticsErrorReporter
) : ViewModel() {

    fun login(email: String, password: String) {
        viewModelScope.launch {
            try {
                val result = authRepo.login(email, password)
                
                // Save tokens securely
                secureStorage.saveUserId(result.userId)
                tokenManager.saveToken(
                    result.token,
                    result.refreshToken,
                    result.expiryMs
                )
                
                // Start session
                sessionManager.startSession(result.userId)
                
                // Track in analytics
                analyticsTracker.trackLogin("email")
            } catch (e: Exception) {
                errorReporter.reportAuthError(e)
            }
        }
    }

    fun logout() {
        sessionManager.endSession()
        analyticsTracker.trackCustomEvent("logout")
    }
}
```

### Payment Flow
```kotlin
@HiltViewModel
class CheckoutViewModel @Inject constructor(
    private val paymentRetryManager: PaymentRetryManager,
    private val paymentAPI: PaymentAPI,
    private val errorReporter: CrashlyticsErrorReporter
) : ViewModel() {

    fun processPayment(orderId: String, amount: Double) {
        viewModelScope.launch {
            val success = paymentRetryManager.retryPayment(
                orderId = orderId,
                amount = amount,
                failureReason = "razorpay",
                paymentOperation = {
                    try {
                        paymentAPI.processRazorpayPayment(orderId, amount)
                    } catch (e: Exception) {
                        errorReporter.reportPaymentError(e, orderId, amount)
                        throw e
                    }
                }
            )
            
            if (success) {
                showSuccess("Payment completed")
            } else {
                showPaymentRetryScreen()
            }
        }
    }
}
```

---

## Security Best Practices

✅ **Always Use:**
- `SecureStorage` for tokens/keys (never SharedPreferences)
- `TokenManager.getValidToken()` before API calls
- SSL certificate pinning for production APIs
- `SessionManager` for timeout handling

❌ **Never:**
- Hardcode API keys (use SecureStorage or environment variables)
- Log sensitive data (tokens, passwords, PII)
- Use cleartext for API communication
- Store unencrypted tokens on disk

---

## Performance Optimizations

| Issue | Solution |
|-------|----------|
| Large lists | Use Paging3 + LazyLoadingDataSource |
| Memory leaks | ImageCacheManager clears on app backgrounding |
| Slow image loads | Multi-level cache (memory + disk) |
| Battery drain | Activity tracking prevents continuous checks |
| Network overhead | HTTP cache headers + image compression |

---

## Testing Checklist

- [ ] Token refresh before expiry
- [ ] Session timeout on inactivity
- [ ] Offline mode shows correct screens
- [ ] Payment retries with correct backoff
- [ ] Secure storage encryption works
- [ ] SSL pinning validates certificates
- [ ] Image cache clears on logout
- [ ] Session clears on forced logout
- [ ] Pagination loads next page on scroll
- [ ] Lazy loading loads chunks efficiently
