package com.company.krishivishal.utils

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import timber.log.Timber

/**
 * Enhanced offline-aware safe call wrapper
 * converting technical errors to friendly Hindi messages
 */
suspend inline fun <T> offlineSafeCall(
    crossinline block: suspend () -> T
): Resource<T> {
    return try {
        Resource.Success(block())
    } catch (e: Exception) {
        Resource.Error(e.asFriendlyError())
    }
}

/**
 * Flow-based offline-aware operation
 */
fun <T> offlineSafeCallFlow(
    block: suspend () -> T
): Flow<Resource<T>> {
    return flow {
        try {
            emit(Resource.Loading())
            val result = block()
            emit(Resource.Success(result))
        } catch (e: Exception) {
            emit(Resource.Error(e.asFriendlyError()))
        }
    }
}
