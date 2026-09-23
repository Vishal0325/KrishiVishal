const fs = require('fs');

const path = 'c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/data/repository/OrderRepository.kt';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    /firestore\.collection\("orders"\)\.document\(entity\.id\)\.update\(updates\)\.await\(\)/g,
    'val payload = hashMapOf("action" to "SYNC_POD", "payload" to hashMapOf("orderId" to entity.id, "updates" to updates))\n                    functions.getHttpsCallable("riderMutations").call(payload).await()'
);

content = content.replace(
    /firestore\.collection\("orders"\)\.document\(orderId\)\.update\(updates\)\.await\(\)/g,
    'val payload = hashMapOf("action" to "SYNC_POD", "payload" to hashMapOf("orderId" to orderId, "updates" to updates))\n                    functions.getHttpsCallable("riderMutations").call(payload).await()'
);

fs.writeFileSync(path, content, 'utf8');
console.log('OrderRepository in Delivery App updated part 1');
