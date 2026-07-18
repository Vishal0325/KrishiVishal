# Analytics & Monitoring Implementation Guide

## Overview
Complete Analytics and Error Monitoring system has been implemented with:
- Firebase Analytics event tracking
- Crashlytics error reporting with categorization
- Comprehensive event models for all user actions
- Performance monitoring
- Analytics dashboard UI
- Timber integration with Crashlytics

## Architecture

### 1. **Analytics Events** (`AnalyticsEvents.kt`)
Comprehensive event models for:
- **E-Commerce**: Search, View Product, Add to Cart, Purchase, Promo Codes
- **User Engagement**: Sign Up, Login, Share, Wishlist
- **Support**: Support Tickets, Feedback, Issue Reporting
- **Performance**: Screen Load Time, API Response Time

### 2. **Analytics Tracker** (`AnalyticsTracker.kt`)
Wraps Firebase Analytics with:
- Type-safe event tracking
- Automatic error handling
- User property management
- Standard e-commerce events
- Custom event support

### 3. **Crashlytics Error Reporter** (`CrashlyticsErrorReporter.kt`)
Advanced error reporting with:
- Error categorization (Network, Auth, Payment, etc.)
- Context-aware error data
- Breadcrumb tracking
- User context management
- Performance issue detection

### 4. **Timber Integration** (`CrashlyticsTree.kt`)
Custom Timber tree that:
- Automatically logs to Crashlytics
- Reports errors with categorization
- Maintains breadcrumb trail
- Works with existing Timber calls

### 5. **App Initialization** (Updated `KrishiVishalApp.kt`)
- Configures Crashlytics on app launch
- Sets up Timber with Crashlytics integration
- Tracks app launch event
- Debug vs Release configuration

## Event Categories

### E-Commerce Events
```
SearchEvent - Product search tracking
ViewProductEvent - Product detail views
AddToCartEvent - Cart additions
RemoveFromCartEvent - Cart removals
ViewCartEvent - Cart views
CheckoutInitiatedEvent - Checkout flow start
PurchaseCompletedEvent - Order completion
PurchaseFailedEvent - Payment failures
PromoCodeAppliedEvent - Discount tracking
```

### User Engagement
```
SignUpEvent - New user registration
LoginEvent - User login
HomeScreenViewEvent - Home screen visits
ShareEvent - Social sharing
AddToWishlistEvent - Wishlist additions
ViewWishlistEvent - Wishlist views
```

### Support & Feedback
```
SupportOpenedEvent - Help/Support access
FeedbackSubmittedEvent - User feedback
IssueReportedEvent - Issue reports
```

## Error Categories in Crashlytics
- NETWORK - Connection/API errors
- AUTHENTICATION - Login/Auth issues
- FIRESTORE - Database errors
- PAYMENT - Payment processing errors
- UI - Screen/UI crashes
- VALIDATION - Input validation failures
- SYNC - Data sync errors
- PERMISSION - Missing permissions
- PERFORMANCE - Performance issues

## Usage Examples

### Track Purchase Event
```kotlin
@Inject
lateinit var analyticsTracker: AnalyticsTracker

// In OrderViewModel
analyticsTracker.trackPurchase(
    transactionId = orderId,
    value = totalAmount,
    currency = "INR",
    items = listOf(
        AnalyticsTracker.PurchaseItem("prod1", "Product A", 500.0, 2)
    )
)
```

### Track Search Event
```kotlin
analyticsTracker.trackSearch(
    query = "organic fertilizer",
    resultsCount = 45
)
```

### Report Error with Context
```kotlin
@Inject
lateinit var errorReporter: CrashlyticsErrorReporter

try {
    // Payment operation
} catch (e: Exception) {
    errorReporter.reportPaymentError(
        exception = e,
        orderId = orderId,
        amount = 1500.0,
        paymentMethod = "card"
    )
}
```

### Set User Context
```kotlin
// On login success
errorReporter.setUserContext(
    userId = userId,
    email = userEmail
)

// On logout
errorReporter.clearUserContext()
```

### Add Breadcrumbs for Tracking
```kotlin
errorReporter.addBreadcrumb(
    message = "User started checkout",
    data = mapOf("cart_value" to cartTotal.toString())
)
```

### Custom Events
```kotlin
analyticsTracker.trackCustomEvent(
    eventName = "referral_shared",
    params = mapOf(
        "referred_to" to refereeName,
        "referral_code" to code
    )
)
```

## Integration in ViewModels

### CartWithAnalyticsViewModel
```kotlin
@HiltViewModel
class CartWithAnalyticsViewModel @Inject constructor(
    private val cartRepository: CartRepository,
    private val analyticsTracker: AnalyticsTracker,
    private val errorReporter: CrashlyticsErrorReporter
) : ViewModel()
```

Features:
- Tracks screen views on load
- Logs cart additions/removals
- Reports checkout initiation
- Captures errors with context

## Analytics Dashboard

UI Component showing:
- Total Users
- Total Sessions
- Total Revenue
- Purchase Count
- Crash/Error Count
- System Health Status

### Usage in Compose:
```kotlin
AnalyticsDashboard(
    totalUsers = 1250,
    totalSessions = 5430,
    totalPurchases = 890,
    totalRevenue = 125000.0,
    crashReportCount = 2,
    errorCount = 15
)
```

## Firebase Console Access

Navigate to:
1. Firebase Console → Project
2. Analytics → Dashboard (View real-time events)
3. Crashlytics → Issues (View crashes and errors)

Events appear in Firebase Console within 1-2 minutes.

## Auto-Tracked Events (Firebase Default)
- first_open
- session_start
- session_end
- app_update
- screen_view (if configured)
- page_view

## Timber Logging Integration

### Debug Build
```kotlin
// Only DebugTree - standard Timber logging
Timber.d("This is a debug message")
```

### Release Build
```kotlin
// CrashlyticsTree - logs to Crashlytics + Timber
Timber.d("Debug info sent to Crashlytics")
Timber.e(exception)  // Automatically reported
```

## Privacy & GDPR

- User ID is anonymized in Crashlytics
- Analytics collection can be disabled:
  ```kotlin
  analyticsTracker.setAnalyticsCollectionEnabled(false)
  ```
- Crash reporting can be disabled:
  ```kotlin
  errorReporter.setCrashReportingEnabled(false)
  ```

## Best Practices

1. **Set User Context Early**
   ```kotlin
   errorReporter.setUserContext(userId, email)
   ```

2. **Add Breadcrumbs Before Critical Operations**
   ```kotlin
   errorReporter.addBreadcrumb("Starting payment", mapOf("amount" to amount))
   ```

3. **Report Meaningful Contexts**
   ```kotlin
   errorReporter.reportPaymentError(e, orderId = orderId, amount = amount)
   ```

4. **Use Standard Events**
   ```kotlin
   analyticsTracker.trackPurchase(...)  // Instead of custom
   ```

5. **Handle Analytics Errors Gracefully**
   - Analytics failures won't crash the app
   - All errors are caught and logged

## Testing

### Test Analytics in Debug:
1. Enable Debug logging: `adb shell setprop debug.firebase.analytics.app com.company.krishivishal`
2. View events: `adb logcat | grep firebase`

### Test Crashlytics:
```kotlin
// Force a crash
throw Exception("Test crash")

// Or log non-fatal
errorReporter.reportError(Exception("Test error"))
```

## Monitoring Metrics

Key metrics to monitor:
- Crash-free users: % of sessions without crashes
- Error rate: Errors per session
- Purchase conversion: % of checkouts completed
- Search usage: Most searched queries
- Top screens: Most visited screens
- Session duration: Average user engagement time

## Future Enhancements

1. Remote Config for feature flags
2. A/B testing integration
3. Funnel analysis for purchase flow
4. Custom dashboards in Firebase
5. Alerts for spike in errors
