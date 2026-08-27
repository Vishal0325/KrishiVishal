# Deploying KrishiVishal Admin Panel

The Admin Panel is a React app that can be easily hosted on **Firebase Hosting**.

## 1. Install Firebase CLI
```bash
npm install -g firebase-tools
```

## 2. Login & Initialize
```bash
firebase login
firebase init hosting
```
- Select your project.
- Set public directory to `dist`.
- Configure as a single-page app: `Yes`.
- Set up automatic builds/deploys with GitHub: `Optional`.

## 3. Build & Deploy
```bash
npm install
npm run build
firebase deploy --only hosting
```

## 4. Post-Deployment Setup
- **Authorized Domains**: Go to Firebase Console -> Authentication -> Settings -> Authorized Domains. Add your hosting URL (e.g. `krishivishal-admin.web.app`).
- **Restrict Keys**: Go to Google Cloud Console -> Credentials. Restrict your Web API Key to ONLY your hosting domain to prevent unauthorized usage.
