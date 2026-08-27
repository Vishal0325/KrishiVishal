package com.company.krishivishal.worker

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.company.krishivishal.data.sync.SyncManager
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import timber.log.Timber

@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val syncManager: SyncManager
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            Timber.d("SyncWorker starting...")
            syncManager.syncPendingOperations()
            Result.success()
        } catch (e: com.google.firebase.firestore.FirebaseFirestoreException) {
            // Handle permanent failures (like permission denied)
            if (e.code == com.google.firebase.firestore.FirebaseFirestoreException.Code.PERMISSION_DENIED) {
                Timber.e("Permanent failure in sync: Permission Denied")
                return Result.failure()
            }
            Result.retry()
        } catch (e: Exception) {
            Timber.e(e, "SyncWorker failed")
            if (runAttemptCount < 3) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }
}
