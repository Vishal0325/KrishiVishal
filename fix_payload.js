const fs = require('fs');

const path = 'c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/data/repository/OrderRepository.kt';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/val payload = hashMapOf/g, 'val mutationPayload = hashMapOf');
content = content.replace(/\.call\(payload\)\.await\(\)/g, '.call(mutationPayload).await()');

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed shadowed name payload');
