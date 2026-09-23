const fs = require('fs');

const path = 'c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/data/repository/OrderRepository.kt';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    /firestore\.runTransaction \{ transaction \->[\s\S]*?\}\.await\(\)\s*deliveryDao\.deleteOrderById\(orderId\)/,
    al payload = hashMapOf("action" to "REJECT_ORDER", "payload" to hashMapOf("orderId" to orderId, "reason" to reason))\n        functions.getHttpsCallable("riderMutations").call(payload).await()\n        deliveryDao.deleteOrderById(orderId)
);

content = content.replace(
    /depositLogRef\.set\(mapOf\([\s\S]*?\}\)\.await\(\)/,
    al payload = hashMapOf("action" to "DEPOSIT_CASH", "payload" to hashMapOf("amount" to totalDeposited, "ordersCount" to snapshot.size()))\n                functions.getHttpsCallable("riderMutations").call(payload).await()
);

fs.writeFileSync(path, content, 'utf8');
console.log('OrderRepository in Delivery App updated part 2');
