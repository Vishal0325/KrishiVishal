# Offline Support Implementation Guide

## Overview
Complete offline support system has been implemented for KrishiVishal app with:
- Local Room database caching
- Automatic sync queue for pending operations
- Network error handling with user-friendly messages
- Retry logic with exponential backoff
- UI components for sync status

## Architecture Components

### 1. **SyncOperation Entity** (`SyncOperation.kt`)
- Represents pending operations to sync with Firestore
- Tracks retry attempts and sync status
- Automatically cleaned up after 7 days

### 2. **SyncManager** (`SyncManager.kt`)
- Core sync orchestrator
- Auto-detects network availability and triggers sync
- Implements exponential backoff retry logic (max 3 attempts)
- Supports operations: ADD_TO_CART, UPDATE_CART, REMOVE_CART, UPDATE_ORDER

### 3. **Network Error Handler** (`NetworkErrorHandler.kt`)
- Comprehensive error classification
- Firebase Firestore error mapping
- User-friendly error messages
- Exception logging for debugging

### 4. **Offline-Aware Repository** (`OfflineAwareCartRepository.kt`)
- Optimistic local updates
- Automatic operation queueing
- Seamless sync integration

### 5. **UI Components** (`NetworkStatusIndicator.kt`)
- Network status indicator
- Sync queue status display
- Error message UI
- Loading animations

## Features

### Automatic Offline Support
```
User Action → Local Database Update → Queue for Sync → Auto-sync when online
```

### Error Handling
- Network unavailable → Graceful offline mode
- Server errors → Retry with backoff
- Auth errors → Prompt user to login
- Timeout → Clear user messaging

### Sync Guarantees
- At-least-once delivery for operations
- Operation ordering preserved
- Automatic retry on failure
- User notifications for sync status

## Usage Examples

### 1. Cart Operations with Offline Support
```kotlin
// In CartViewModelWithOfflineSupport
viewModelScope.launch {
    cartRepository.addToCart(cartItem, userId).collect { resource ->
        when (resource) {
            is Resource.Success -> updateUI()
            is Resource.Error -> showError(resource.message)
        }
    }
}
```

### 2. Network Status in UI
```kotlin
// In Compose UI
NetworkStatusIndicator(
    isOnline = uiState.isOnline,
    pendingSyncCount = uiState.pendingSyncCount
)
```

### 3. Error Handling in ViewModel
```kotlin
val error = NetworkErrorHandler.handleException(exception)
val userMessage = NetworkErrorHandler.getUserMessage(error)
NetworkErrorHandler.logError(error)
```

## Database Schema Changes
- Version bumped from 25 to 26
- New table: `sync_operations`
- Fields track operation state, retry counts, timestamps

## DI Configuration
`OfflineSupportModule.kt` provides:
- ConnectivityObserver
- SyncManager (singleton)

## Integration Steps

1. **Update CartRepository** to use `OfflineAwareCartRepository`
2. **Update CartViewModel** to use `CartViewModelWithOfflineSupport`
3. **Add UI components** to cart screen:
   ```kotlin
   NetworkStatusIndicator(isOnline, pendingSyncCount)
   // Show error messages
   error?.let { NetworkErrorMessage(it) }
   ```
4. **Test offline scenarios**:
   - Add to cart → Turn off network → Verify sync when online
   - Network error → Verify retry logic
   - User feedback → Verify UI updates

## Monitoring & Debugging

### Logs
```
// Sync initiation
Timber: "Operation queued: ADD_TO_CART for cart_item:12345"

// Retry attempts
Timber: "Retrying operation abc123, attempt 1/3 in 1000ms"

// Success
Timber: "Operation synced successfully: abc123"
```

### Inspect Pending Operations
```kotlin
syncOperationDao.getPendingOperations()  // Get all pending
syncOperationDao.getPendingOperationCount()  // Get count
```

## Retry Strategy
- Initial delay: 1 second
- Exponential backoff: 2^n × initial delay
- Max attempts: 3
- Cleanup: Synced operations after 7 days

## Network Status States
- `Available` → Online, ready to sync
- `Unavailable` → No network, queue operations
- `Losing` → Connection unstable
- `Lost` → Connection dropped

## Future Enhancements
1. Implement conflict resolution for concurrent updates
2. Add delta sync (only changed fields)
3. Implement background sync job
4. Add user notification for sync completion
5. Analytics for offline usage patterns
