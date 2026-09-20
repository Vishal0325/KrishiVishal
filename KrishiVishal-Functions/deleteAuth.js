const admin = require('firebase-admin');
admin.initializeApp();
async function deleteAllUsers() {
    try {
        let nextPageToken;
        do {
            const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
            const uids = listUsersResult.users.map((userRecord) => userRecord.uid);
            if (uids.length > 0) {
                await admin.auth().deleteUsers(uids);
                console.log('Deleted ' + uids.length + ' users');
            }
            nextPageToken = listUsersResult.pageToken;
        } while (nextPageToken);
        console.log('All users deleted.');
    } catch (error) {
        console.log('Error deleting users:', error);
    }
}
deleteAllUsers();
