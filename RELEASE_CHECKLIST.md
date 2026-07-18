# KrishiVishal Release Checklist

## 1. Build & Signing
- [ ] Create `keystore.properties` based on `keystore.properties.example`.
- [ ] Ensure production keystore is secure and backed up.
- [ ] Run `./gradlew bundleRelease` to generate the `.aab` file.
- [ ] Verify that the release build is minified (ProGuard/R8 enabled).

## 2. API & Secrets
- [ ] Replace placeholder `baseUrl` in `NetworkModule.kt` with production endpoint.
- [ ] Verify `google-services.json` is the production version.
- [ ] Restrict API keys in Google Cloud Console (Package name + SHA-1).

## 3. Play Store Assets
- [ ] App Icon (Adaptive icons configured).
- [ ] High-resolution feature graphic (1024x500).
- [ ] At least 2-8 screenshots for phone, 7-inch and 10-inch tablets.
- [ ] Privacy Policy URL.
- [ ] Short and Long Descriptions.

## 4. Testing & QA
- [ ] Test release build on at least 3 physical devices (different Android versions).
- [ ] Verify Firebase Auth (Phone) works in production (add test numbers if needed).
- [ ] Check Firebase Analytics for event logging.
- [ ] Verify Crashlytics is reporting crashes (test with a forced crash).
- [ ] Ensure all notification permissions are handled correctly for Android 13+.

## 5. Security
- [ ] Verify `network_security_config.xml` allows only necessary domains.
- [ ] Ensure `android:allowBackup="false"` in `AndroidManifest.xml`.
- [ ] Check that no sensitive information is being logged in release builds (Timber should be disabled/filtered).

## 6. Performance
- [ ] Verify image loading speed with Glide.
- [ ] Check app startup time (should be < 2 seconds for cold start).
- [ ] Monitor memory usage for leaks during long sessions.
