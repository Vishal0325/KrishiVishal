const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runSmokeTest() {
    console.log("=== STARTING LIVE SMOKE TEST ===");
    const orderRef = db.collection('orders').doc('ORDER_SMOKE_NOTIF_TEST');
    
    try {
        console.log("1. Setting up Test Order...");
        await orderRef.set({
            orderId: "ORDER_SMOKE_NOTIF_TEST",
            status: "OUT_FOR_DELIVERY",
            customerName: "Ramesh Kumar (Test)",
            phone: "+91 98765-43210",
            invoicePdfUrl: "https://krishivishal.com/invoices/test_invoice.pdf",
            isSmokeTest: true,
            updatedAt: new Date()
        });

        console.log("2. Triggering Delivery Transition...");
        await orderRef.update({ status: "DELIVERED", updatedAt: new Date() });

        console.log("3. Waiting 5 seconds for trigger execution...");
        await sleep(5000);

        console.log("4. Asserting Audit Log Creation...");
        let snapshot;
        for (let i = 0; i < 6; i++) {
            snapshot = await db.collection('order_notifications').where('orderId', '==', 'ORDER_SMOKE_NOTIF_TEST').get();
            if (!snapshot.empty) break;
            console.log("   Not found yet, waiting another 5 seconds...");
            await sleep(5000);
        }
        
        if (snapshot.empty) {
            throw new Error("Audit log not created! Notification document missing.");
        }

        const notifDoc = snapshot.docs[0];
        const data = notifDoc.data();
        console.log(`✅ Audit Log Found! ID: ${notifDoc.id}`);
        console.log(`   Status: ${data.status}`);
        console.log(`   Phone: ${data.customerPhone}`);
        console.log(`   Invoice URL: ${data.invoicePdfUrl}`);
        
        if (!data.customerPhone.includes('9876543210') && data.customerPhone !== 'UNKNOWN') {
           throw new Error(`Phone number mismatch: ${data.customerPhone}`);
        }
        if (!data.invoicePdfUrl) {
           throw new Error("Invoice URL missing");
        }

        console.log("✅ Assertion Passed.");
        
        console.log("5. Cleaning up...");
        await orderRef.delete();
        await notifDoc.ref.delete();
        console.log("✅ Cleanup Complete.");
        
    } catch (error) {
        console.error("❌ SMOKE TEST FAILED:", error);
        
        try {
            await orderRef.delete();
            const snap = await db.collection('order_notifications').where('orderId', '==', 'ORDER_SMOKE_NOTIF_TEST').get();
            if (!snap.empty) {
                await snap.docs[0].ref.delete();
            }
        } catch(e) {}
        
        process.exit(1);
    }
}

runSmokeTest().then(() => {
    console.log("=== SMOKE TEST FINISHED ===");
    process.exit(0);
});
