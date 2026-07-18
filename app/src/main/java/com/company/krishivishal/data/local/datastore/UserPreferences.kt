package com.company.krishivishal.data.local.datastore

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
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
}
