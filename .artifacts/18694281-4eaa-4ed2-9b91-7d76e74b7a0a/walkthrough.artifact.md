# Walkthrough - Native Google Sign-In Implementation

I have implemented native Android Google Sign-In using the **Credential Manager API** and replaced the web-based authentication flow.

## Changes Made

### 1. Dependencies Updated
Added the latest stable versions of Credential Manager and GoogleId libraries to support the modern native sign-in flow.
- **File**: [libs.versions.toml](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/gradle/libs.versions.toml)
- **File**: [build.gradle.kts](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/build.gradle.kts)

### 2. Auth Layer Refactored
Modified the repository and use cases to handle generic Firebase `AuthCredential` objects, making it easy to support multiple sign-in methods (Phone, Google, etc.).
- **File**: [AuthRepository.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/data/repository/AuthRepository.kt)
- **File**: [SignInWithCredentialUseCase.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/domain/usecase/auth/SignInWithCredentialUseCase.kt)
- **File**: [VerifyOtpUseCase.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/domain/usecase/auth/VerifyOtpUseCase.kt)

### 3. Native Google Sign-In in ViewModel
Implemented the `signInWithGoogle` method in `AuthViewModel` using `CredentialManager`. It requests a Google ID token natively and signs in to Firebase.
- **File**: [AuthViewModel.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/feature/auth/AuthViewModel.kt)

### 4. UI Enhancements
Added a native "Continue with Google" button to the Login screen with proper layout and translations.
- **File**: [LoginScreen.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/feature/auth/LoginScreen.kt)
- **File**: [strings.xml](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/res/values/strings.xml) (and Hindi version)

## Manual Verification Required

> [!CAUTION]
> **Action Required**: The Google Sign-In flow requires a valid **Web Client ID**.
> 1. Since your `google-services.json` currently has an empty `oauth_client` list, you MUST go to the [Firebase Console](https://console.firebase.google.com/), enable Google Sign-In, and download the updated `google-services.json`.
> 2. Ensure your **SHA-1 and SHA-256 fingerprints** are registered in the console.

## Verification Results

### Build
- Successfully ran `./gradlew :app:compileDebugKotlin`. The project now builds with the new native authentication logic.
