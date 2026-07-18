# KrishiVishal Live Release Checklist

Follow these steps for a successful production launch.

## 1. Firebase Readiness
- [ ] Upgrade to **Blaze Plan** (Pay-as-you-go) for Cloud Functions and scaled FCM.
- [ ] Deploy [firestore.rules](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/firestore.rules).
- [ ] Deploy [storage.rules](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/storage.rules).
- [ ] Deploy Cloud Functions: `firebase deploy --only functions`.
- [ ] Enable **App Check** in Firebase Console to prevent unauthorized API requests.
- [ ] Configure **Daily Backups** in Firestore (Settings -> Backups).

## 2. Payment Setup (Razorpay)
- [ ] Move Razorpay account from Test Mode to **Live Mode**.
- [ ] Update `Key ID` and `Key Secret` in [RAZORPAY_INTEGRATION.md](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/RAZORPAY_INTEGRATION.md).
- [ ] Configure **Webhooks** in Razorpay Dashboard pointing to your `razorpayWebhook` Cloud Function URL.

## 3. Android App Release
- [ ] Generate a fresh **Signed App Bundle (.aab)** using production keystore.
- [ ] Run a final **Google Play Pre-launch Report** to catch crashes on unique devices.
- [ ] Verify that [network_security_config.xml](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/res/xml/network_security_config.xml) includes your production API domains.
- [ ] Double-check `versionCode` and `versionName` in `build.gradle.kts`.

## 4. Admin Panel Security
- [ ] Manually set `isAdmin: true` for your admin user account in Firestore.
- [ ] Deploy the panel using [DEPLOY_ADMIN.md](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal-Admin/DEPLOY_ADMIN.md).
- [ ] Test a broadcast notification to ensured users are subscribed to the `all` topic.

## 5. Post-Launch Monitoring
- [ ] Monitor **Firebase Crashlytics** for real-user crashes.
- [ ] Watch **Firestore usage** in the console to identify expensive queries.
- [ ] Check **FCM delivery reports** for any drop-offs.
