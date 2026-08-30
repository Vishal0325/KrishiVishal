package com.company.krishivishal.data.di

import android.content.Context
import com.company.krishivishal.payment.PaymentRetryManager
import com.company.krishivishal.performance.ImageCacheManager
import com.company.krishivishal.security.CertificatePinningManager
import com.company.krishivishal.security.SecureStorage
import com.company.krishivishal.security.TokenManager
import com.company.krishivishal.session.SessionManager
import com.google.firebase.auth.FirebaseAuth
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Dependency injection module for Security, Performance, and Edge Cases
 */
@Module
@InstallIn(SingletonComponent::class)
object SecurityPerformanceModule {

    // ==================== SECURITY ====================

    @Provides
    @Singleton
    fun provideSecureStorage(
        @ApplicationContext context: Context
    ): SecureStorage = SecureStorage(context)

    @Provides
    @Singleton
    fun provideTokenManager(
        secureStorage: SecureStorage,
        firebaseAuth: FirebaseAuth,
        errorReporter: com.company.krishivishal.crashlytics.CrashlyticsErrorReporter
    ): TokenManager = TokenManager(secureStorage, firebaseAuth, errorReporter)

    @Provides
    @Singleton
    fun provideCertificatePinningManager(
        @ApplicationContext context: Context
    ): CertificatePinningManager = CertificatePinningManager(context, com.company.krishivishal.BuildConfig.DEBUG)

    @Provides
    @Singleton
    fun provideSessionManager(
        secureStorage: SecureStorage,
        tokenManager: TokenManager,
        errorReporter: com.company.krishivishal.crashlytics.CrashlyticsErrorReporter,
        firebaseAuth: FirebaseAuth
    ): SessionManager = SessionManager(secureStorage, tokenManager, errorReporter, firebaseAuth)

    // ==================== PERFORMANCE ====================

    @Provides
    @Singleton
    fun provideImageCacheManager(
        @ApplicationContext context: Context
    ): ImageCacheManager = ImageCacheManager(context)

    // ==================== PAYMENT ====================

    @Provides
    @Singleton
    fun providePaymentRetryManager(
        errorReporter: com.company.krishivishal.crashlytics.CrashlyticsErrorReporter
    ): PaymentRetryManager = PaymentRetryManager(errorReporter)
}
