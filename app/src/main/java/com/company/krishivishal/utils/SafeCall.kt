package com.company.krishivishal.utils

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.withContext
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers

inline fun <T> safeCall(
    dispatcher: CoroutineDispatcher = Dispatchers.IO,
    crossinline action: suspend () -> T
): Flow<Resource<T>> = flow<Resource<T>> {
    emit(Resource.Success(withContext(dispatcher) { action() }))
}.onStart {
    emit(Resource.Loading())
}.catch { e ->
    emit(Resource.Error(e.asFriendlyError()))
}
