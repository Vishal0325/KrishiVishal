const admin = require('firebase-admin');
const serviceAccount = require('C:/Users/visha/secrets/service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

admin.auth().projectConfigManager().updateProjectConfig({
  smsRegionConfig: {
    allowByDefault: {
      disallowedRegions: []
    }
  }
}).then(() => {
    // There is no admin SDK API to set test phone numbers easily.
    // Wait, let's just log what we can do.
    console.log("We can't add test numbers via admin sdk easily, it is generally done via console.");
});
