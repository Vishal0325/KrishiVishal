const admin = require("firebase-admin");

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();
const messaging = admin.messaging();
const storage = admin.storage();

module.exports = {
    admin,
    db,
    auth,
    messaging,
    storage
};
