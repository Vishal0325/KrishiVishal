const fs = require('fs');

const path = 'c:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/data/repository/OrderRepository.kt';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    /firestore\.collection\("orders"\)\.document\(orderId\)\.update\("status", status\.name\)\.await\(\)/g,
    al data = hashMapOf("orderId" to orderId, "targetStatus" to status.name)
        functions.getHttpsCallable("updateOrderStatus").call(data).await()
);

fs.writeFileSync(path, content, 'utf8');
console.log('Customer OrderRepository updated');
