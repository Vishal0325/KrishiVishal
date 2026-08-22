package com.company.krishivishal.utils

import com.company.krishivishal.core.util.Resource
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
    val initialData = try { query().first() } catch (e: Exception) { null }

    if (initialData == null || shouldFetch(initialData)) {
        emit(Resource.Loading(initialData))

        try {
            val fetchedResult = withContext(dispatcher) { fetch() }
            saveFetchResult(fetchedResult)
            emitAll(query().map { Resource.Success(it) })
        } catch (throwable: Throwable) {
            val latestCached = try { query().first() } catch (e: Exception) { initialData }
            emit(Resource.Error(throwable.asFriendlyError(), latestCached))
            emitAll(query().map { Resource.Error(throwable.asFriendlyError(), it) })
        }
    } else {
        emitAll(query().map { Resource.Success(it) })
    }
}
