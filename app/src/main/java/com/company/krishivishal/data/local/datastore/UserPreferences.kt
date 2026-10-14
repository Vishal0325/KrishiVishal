package com.company.krishivishal.data.local.datastore

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton
import dagger.hilt.android.qualifiers.ApplicationContext

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "user_prefs")

@Singleton
class UserPreferences @Inject constructor(
    @param:ApplicationContext private val context: Context
) {
    companion object {
        private val IS_LOGGED_IN = booleanPreferencesKey("is_logged_in")
        private val USER_ID = stringPreferencesKey("user_id")
        private val THEME_MODE = booleanPreferencesKey("theme_mode")
        private val LANGUAGE = stringPreferencesKey("language")
        private val ATTRIBUTED_CAMPAIGN_ID = stringPreferencesKey("attributed_campaign_id")
        private val ATTRIBUTED_CAMPAIGN_VARIANT = stringPreferencesKey("attributed_campaign_variant")
        private val ATTRIBUTED_CAMPAIGN_TIME = longPreferencesKey("attributed_campaign_time")
        private val AB_BUCKET = stringPreferencesKey("ab_bucket")
    }

    val isLoggedIn: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[IS_LOGGED_IN] ?: false
    }

    suspend fun setLoggedIn(loggedIn: Boolean) {
        context.dataStore.edit { prefs ->
            prefs[IS_LOGGED_IN] = loggedIn
        }
    }

    val userId: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[USER_ID]
    }

    suspend fun saveUserId(userId: String) {
        context.dataStore.edit { prefs ->
            prefs[USER_ID] = userId
        }
    }

    val themeMode: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[THEME_MODE] ?: false // false = light, true = dark
    }

    suspend fun setThemeMode(isDarkMode: Boolean) {
        context.dataStore.edit { prefs ->
            prefs[THEME_MODE] = isDarkMode
        }
    }

    val language: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[LANGUAGE] ?: "en" // Default to English
    }

    suspend fun setLanguage(langCode: String) {
        context.dataStore.edit { prefs ->
            prefs[LANGUAGE] = langCode
        }
    }

    val attributedCampaignId: Flow<String?> = context.dataStore.data.map { prefs ->
        val id = prefs[ATTRIBUTED_CAMPAIGN_ID]
        val time = prefs[ATTRIBUTED_CAMPAIGN_TIME] ?: 0L
        val maxAttributionMillis = 48 * 60 * 60 * 1000L // 48 hours attribution window
        if (!id.isNullOrBlank() && (System.currentTimeMillis() - time) <= maxAttributionMillis) {
            id
        } else {
            null
        }
    }

    suspend fun saveAttributedCampaign(campaignId: String, variant: String = "A") {
        context.dataStore.edit { prefs ->
            prefs[ATTRIBUTED_CAMPAIGN_ID] = campaignId
            prefs[ATTRIBUTED_CAMPAIGN_VARIANT] = variant
            prefs[ATTRIBUTED_CAMPAIGN_TIME] = System.currentTimeMillis()
        }
    }

    suspend fun getActiveAttributedCampaignId(): String? {
        val prefs = context.dataStore.data.first()
        val id = prefs[ATTRIBUTED_CAMPAIGN_ID]
        val time = prefs[ATTRIBUTED_CAMPAIGN_TIME] ?: 0L
        val maxAttributionMillis = 48 * 60 * 60 * 1000L
        return if (!id.isNullOrBlank() && (System.currentTimeMillis() - time) <= maxAttributionMillis) {
            id
        } else {
            null
        }
    }

    suspend fun getActiveAttributedVariant(): String? {
        val prefs = context.dataStore.data.first()
        val id = prefs[ATTRIBUTED_CAMPAIGN_ID]
        val time = prefs[ATTRIBUTED_CAMPAIGN_TIME] ?: 0L
        val maxAttributionMillis = 48 * 60 * 60 * 1000L
        return if (!id.isNullOrBlank() && (System.currentTimeMillis() - time) <= maxAttributionMillis) {
            prefs[ATTRIBUTED_CAMPAIGN_VARIANT] ?: "A"
        } else {
            null
        }
    }

    suspend fun getOrInitAbBucket(): String {
        val prefs = context.dataStore.data.first()
        val existing = prefs[AB_BUCKET]
        if (!existing.isNullOrBlank()) return existing

        val chosen = if (java.util.UUID.randomUUID().hashCode() % 2 == 0) "ab_bucket_a" else "ab_bucket_b"
        context.dataStore.edit { p ->
            p[AB_BUCKET] = chosen
        }
        return chosen
    }

    suspend fun clearAttributedCampaign() {
        context.dataStore.edit { prefs ->
            prefs.remove(ATTRIBUTED_CAMPAIGN_ID)
            prefs.remove(ATTRIBUTED_CAMPAIGN_VARIANT)
            prefs.remove(ATTRIBUTED_CAMPAIGN_TIME)
        }
    }
}
