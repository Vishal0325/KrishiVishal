package com.company.krishivishaldelivery.ui.settings

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.company.krishivishaldelivery.data.local.PreferencesManager
import com.company.krishivishaldelivery.worker.SyncWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val preferencesManager: PreferencesManager,
    @ApplicationContext private val context: Context
) : ViewModel() {

    val themeFlow: StateFlow<String> = preferencesManager.themeFlow

    fun setTheme(theme: String) {
        preferencesManager.setTheme(theme)
    }

    fun forceSync() {
        val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>().build()
        WorkManager.getInstance(context).enqueue(syncRequest)
    }
}
