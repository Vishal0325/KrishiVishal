# KrishiVishal Admin Claims Utility

Yeh scripts use karke aap kisi bhi user account ko "Admin" privileges de sakte hain ya remove kar sakte hain. Firestore Security Rules in claims ka use karke access grant karti hain.

## 📋 Pre-requisites

1. **Service Account Key**:
   - Firebase Console ➔ Project Settings ➔ Service Accounts par jayein.
   - "Generate New Private Key" button par click karein.
   - Download hui JSON file ka naam badal kar `service-account-key.json` rakhein.
   - Is file ko is `/scripts` folder ke andar move karein.
   - **⚠️ WARNING**: Is file ko kabhi bhi Git par push mat karna. `.gitignore` mein entry check karlein.

2. **Install Dependencies**:
   ```bash
   cd scripts
   npm init -y
   npm install firebase-admin
   ```

## 🚀 Usage

### Admin Claim Set Karein (Assign Admin)
```bash
node setAdminClaim.js <email_address>
# Example: node setAdminClaim.js vishal@krishivishal.com
```

### Admin Claim Hatayein (Revoke Admin)
```bash
node removeAdminClaim.js <email_address>
```

## ⚠️ Important Notes

- **Token Refresh**: Custom claim set hone ke baad user ko **Log Out karke Log In** karna hoga, ya 1 ghante tak wait karna hoga. Firebase ID tokens cached hote hain aur login ke waqt hi refresh hote hain.
- **Verification**: Script khatam hone par `Verification (Custom Claims): { admin: true }` print hona chahiye.
- **Scope**: Ye claims poore Firebase project (Firestore, Storage, etc.) ke rules mein `request.auth.token.admin` ke roop mein available rahenge.
