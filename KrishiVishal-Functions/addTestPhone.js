const admin = require('firebase-admin');
const serviceAccount = require('C:/Users/visha/secrets/service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

admin.auth().projectConfigManager().updateProjectConfig({
  signIn: {
    phoneNumber: {
      testPhoneNumbers: {
        '+919999999999': '123456'
      }
    }
  }
}).then(() => {
    console.log("Successfully added test phone number");
    process.exit(0);
}).catch(console.error);
