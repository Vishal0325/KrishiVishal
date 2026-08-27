# General Optimization
-optimizationpasses 5
-dontusemixedcaseclassnames
-dontskipnonpubliclibraryclasses
-dontpreverify
-verbose
-keepattributes SourceFile,LineNumberTable,Signature,InnerClasses,EnclosingMethod,*Annotation*

# App Specific - Keep Models
-keep class com.company.krishivishal.core.model.** { *; }

# Hilt
-keep class dagger.hilt.internal.GeneratedComponentManager { *; }
-keep class * implements dagger.hilt.internal.GeneratedComponent { *; }
-keep class * implements dagger.hilt.internal.GeneratedComponentManager { *; }
-keep @dagger.hilt.android.lifecycle.HiltViewModel class * extends androidx.lifecycle.ViewModel

# Room
-keep class * extends androidx.room.RoomDatabase
-dontwarn androidx.room.paging.**
-keep class * extends androidx.room.Entity
-keep interface * extends androidx.room.Dao

# Retrofit & OkHttp
-keep class retrofit2.** { *; }
-keep interface retrofit2.** { *; }
-dontwarn retrofit2.**
-keep class com.squareup.okhttp3.** { *; }
-dontwarn okio.**
-dontwarn javax.annotation.**

# Gson
-keep class com.google.gson.** { *; }
-keep class com.google.gson.reflect.TypeToken
-keep class * implements com.google.gson.TypeAdapter
-keep @com.google.gson.annotations.SerializedName class * { *; }

# Firebase & GMS (Modern SDKs have internal consumer rules, keep only if needed for specific logic)
# -keep class com.google.firebase.** { *; }
# -keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# Razorpay
-keep class com.razorpay.** {*;}
-dontwarn com.razorpay.**
-keepattributes *Annotation*
-keepattributes JavascriptInterface

# Navigation Component
-keep class * extends androidx.navigation.NavArgs
-keep class * implements androidx.navigation.NavArgs

# Coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepnames class kotlinx.coroutines.android.AndroidExceptionPreHandler {}
-keepnames class kotlinx.coroutines.android.AndroidDispatcherFactory {}
-dontwarn kotlinx.coroutines.**

# Android 14 / SDK specific
-dontwarn android.window.**
-dontwarn android.view.TranslationResponse
-dontwarn android.view.translation.ViewTranslationResponse

# Paging 3
-keep class androidx.paging.PagingSource { *; }
-dontwarn androidx.paging.**

# Coil
-keep class coil.** { *; }
-dontwarn coil.**

# Lottie
-keep class com.airbnb.lottie.** { *; }
-dontwarn com.airbnb.lottie.**

# Firebase App Check
-keep class com.google.firebase.appcheck.** { *; }
-dontwarn com.google.firebase.appcheck.**

# Encrypted SharedPreferences
-keep class androidx.security.crypto.** { *; }
-dontwarn androidx.security.crypto.**
