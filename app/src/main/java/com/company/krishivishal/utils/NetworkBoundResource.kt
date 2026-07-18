package com.company.krishivishal.utils

import kotlinx.coroutines.flow.*
import kotlinx.coroutines.withContext
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers

inline fun <ResultType, RequestType> networkBoundResource(
    crossinline query: () -> Flow<ResultType>,
    crossinline fetch: suspend () -> RequestType,
    crossinline saveFetchResult: suspend (RequestType) -> Unit,
    crossinline shouldFetch: (ResultType) -> Boolean = { true },
    dispatcher: CoroutineDispatcher = Dispatchers.IO
) = flow<Resource<ResultType>> {
    val data = query().first()

    if (shouldFetch(data)) {
        emit(Resource.Loading(data))

        try {
            val fetchedResult = withContext(dispatcher) { fetch() }
            saveFetchResult(fetchedResult)
            emitAll(query().map { Resource.Success(it) })
        } catch (throwable: Throwable) {
            emitAll(query().map { Resource.Error(throwable.asFriendlyError(), it) })
        }
    } else {
        emitAll(query().map { Resource.Success(it) })
    }
}
