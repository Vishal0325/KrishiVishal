const fs = require('fs');

const path = 'c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/data/repository/OrderRepository.kt';
let content = fs.readFileSync(path, 'utf8');

// Replace rejectOrder direct write
content = content.replace(
    /suspend fun rejectOrder\(orderId: String, riderId: String, reason: String\) \{[\s\S]*?deliveryDao\.deleteOrderById\(orderId\)\s*\}/,
    suspend fun rejectOrder(orderId: String, riderId: String, reason: String) {
        val payload = hashMapOf(
            "action" to "REJECT_ORDER",
            "payload" to hashMapOf("orderId" to orderId, "reason" to reason)
        )
        functions.getHttpsCallable("riderMutations").call(payload).await()
        deliveryDao.deleteOrderById(orderId)
    }
);

// Replace syncPendingOrders (podPhoto) direct write
content = content.replace(
    /firestore\.collection\("orders"\)\.document\(entity\.id\)\.update\(updates\)\.await\(\)/g,
    al payload = hashMapOf(
            "action" to "SYNC_POD",
            "payload" to hashMapOf("orderId" to entity.id, "updates" to updates)
        )
        functions.getHttpsCallable("riderMutations").call(payload).await()
);

// Replace depositLogRef direct set
content = content.replace(
    /depositLogRef\.set\(mapOf\([\s\S]*?\}\)\.await\(\)/,
    al payload = hashMapOf(
            "action" to "DEPOSIT_CASH",
            "payload" to hashMapOf("amount" to totalDeposited, "ordersCount" to snapshot.size())
        )
        functions.getHttpsCallable("riderMutations").call(payload).await()
);

fs.writeFileSync(path, content, 'utf8');
console.log('OrderRepository in Delivery App updated');
