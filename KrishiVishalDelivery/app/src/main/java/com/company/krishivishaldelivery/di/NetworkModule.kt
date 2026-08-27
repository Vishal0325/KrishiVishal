package com.company.krishivishaldelivery.di

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideFirestore(): FirebaseFirestore = FirebaseFirestore.getInstance()

    @Provides
    @Singleton
    fun provideFirebaseAuth(): FirebaseAuth = FirebaseAuth.getInstance()

    @Provides
    @Singleton
    fun provideFirebaseFunctions(): FirebaseFunctions = FirebaseFunctions.getInstance("asia-south1")

    @Provides
    @Singleton
    fun provideConnectivityObserver(@dagger.hilt.android.qualifiers.ApplicationContext context: android.content.Context): com.company.krishivishaldelivery.utils.ConnectivityObserver =
        com.company.krishivishaldelivery.utils.ConnectivityObserver(context)
}
