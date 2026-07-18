package com.company.krishivishal.utils

/**
 * Sealed class for network errors with comprehensive error details
 */
sealed class NetworkError(
    val message: String,
    val code: Int? = null,
    val cause: Throwable? = null
) {
    // Network connectivity errors
    class NoInternetConnection(message: String = "No internet connection") : NetworkError(message)
    class NetworkUnavailable(message: String = "Network is unavailable") : NetworkError(message)
    
    // Server errors (5xx)
    class ServerError(code: Int, message: String) : NetworkError(message, code)
    class ServiceUnavailable(message: String = "Service temporarily unavailable") : NetworkError(message)
    
    // Client errors (4xx)
    class BadRequest(message: String = "Bad request") : NetworkError(message)
    class Unauthorized(message: String = "Unauthorized - Please login again") : NetworkError(message)
    class Forbidden(message: String = "Forbidden") : NetworkError(message)
    class NotFound(message: String = "Resource not found") : NetworkError(message)
    class Conflict(message: String = "Resource conflict") : NetworkError(message)
    
    // Timeout
    class Timeout(message: String = "Request timeout") : NetworkError(message)
    
    // Data errors
    class ParseError(message: String = "Failed to parse response", cause: Throwable? = null) : NetworkError(message, cause = cause)
    
    // Firestore specific
    class FirestoreError(code: String, message: String) : NetworkError(message)
    
    // Generic
    class UnknownError(message: String, cause: Throwable? = null) : NetworkError(message, cause = cause)
    
    companion object {
        fun fromThrowable(throwable: Throwable): NetworkError {
            return when {
                throwable is java.net.SocketTimeoutException -> Timeout("Connection timeout")
                throwable is java.net.ConnectException -> NoInternetConnection("Cannot connect to server")
                throwable is java.io.IOException -> NoInternetConnection(throwable.message ?: "Network error")
                else -> UnknownError(throwable.message ?: "Unknown error", throwable)
            }
        }
    }
}

/**
 * Result wrapper for network operations
 */
sealed class NetworkResult<T> {
    data class Success<T>(val data: T) : NetworkResult<T>()
    data class Error<T>(val error: NetworkError) : NetworkResult<T>()
    class Loading<T> : NetworkResult<T>()
}

fun <T> NetworkResult<T>.getOrNull(): T? = when (this) {
    is NetworkResult.Success -> this.data
    else -> null
}

fun <T> NetworkResult<T>.getErrorOrNull(): NetworkError? = when (this) {
    is NetworkResult.Error -> this.error
    else -> null
}
