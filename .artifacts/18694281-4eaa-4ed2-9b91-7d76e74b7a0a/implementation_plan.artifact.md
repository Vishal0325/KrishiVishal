# Implementation Plan - Native Google Sign-In with Credential Manager

The app is currently triggering a Firebase Web Authentication redirect (browser window), which often fails on emulators or due to configuration issues. This plan replaces any web-based flows with native Android Google Sign-In using the modern **Credential Manager API**.

## User Review Required

> [!IMPORTANT]
> To use Google Sign-In, you MUST:
> 1. Add your debug (and release) **SHA-1 and SHA-256 fingerprints** to your project in the [Firebase Console](https://console.firebase.google.com/).
> 2. Enable **Google** as a Sign-In provider in the Firebase Authentication settings.
> 3. Ensure you have the latest `google-services.json` file in your `app/` directory.

## Proposed Changes

### [gradle]

#### [MODIFY] [libs.versions.toml](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/gradle/libs.versions.toml)
- Add versions and libraries for `androidx.credentials` and `googleid`.

### [app]

#### [MODIFY] [build.gradle.kts](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/build.gradle.kts)
- Add the new dependencies to the `dependencies` block.

#### [MODIFY] [AuthRepository.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/data/repository/AuthRepository.kt)
- Change `signInWithPhone(credential: PhoneAuthCredential)` to a more generic `signInWithCredential(credential: AuthCredential)`.

#### [MODIFY] [SignInWithCredentialUseCase.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/domain/usecase/auth/SignInWithCredentialUseCase.kt)
- Update to accept `AuthCredential`.

#### [MODIFY] [AuthViewModel.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/feature/auth/AuthViewModel.kt)
- Add `signInWithGoogle(context: Context)` method.
- Implement the `CredentialManager` flow to request a Google ID token.
- On success, use `signInWithCredentialUseCase` to authenticate with Firebase.

#### [MODIFY] [LoginScreen.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/feature/auth/LoginScreen.kt)
- Add a "Continue with Google" button below the phone input section.
- Add an "OR" divider between phone login and Google login.

#### [MODIFY] [strings.xml](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/res/values/strings.xml)
- Add string resources for the new UI elements.

## Verification Plan

### Automated Tests
- Build the project using `./gradlew :app:assembleDebug` to ensure all dependencies are resolved.

### Manual Verification
- Deploy the app to the emulator.
- Click "Continue with Google".
- Verify that the native Google account picker appears (NOT a browser redirect).
- After selecting an account, verify that the user is logged in and redirected to the Home screen.
