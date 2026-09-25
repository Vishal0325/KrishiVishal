const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function test() {
  const users = await db.collection("users").get();
  console.log("Total users:", users.size);
  let found = 0;
  for (const user of users.docs) {
    const hist = await db.collection("users").doc(user.id).collection("wallet_history").get();
    if (!hist.empty) {
      console.log(`User ${user.id} has ${hist.size} wallet_history records`);
      hist.forEach(doc => console.log(doc.data()));
      found++;
    }
  }
  console.log(`Users with wallet history: ${found}`);
}
test().catch(console.error);
