# Consumer Proguard rules for :core module
# Preserves data classes and models used across apps
-keepclassmembers class * {
    @com.google.firebase.firestore.PropertyName *;
    @com.google.firebase.firestore.DocumentId *;
    @com.google.firebase.firestore.ServerTimestamp *;
    @com.google.firebase.firestore.Exclude *;
}
-keep class com.company.krishivishal.core.model.** { *; }
