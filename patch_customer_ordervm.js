const fs = require('fs');

const path = 'c:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/order/OrderViewModel.kt';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    /firestore\.collection\("orders"\)\.document\(orderId\)\.update\("status", orderStatus\.name\)/g,
    al data = hashMapOf("orderId" to orderId, "targetStatus" to orderStatus.name)
            functions.getHttpsCallable("updateOrderStatus").call(data).await()
);

// We need to inject FirebaseFunctions into OrderViewModel if it's not there!
// Let's just avoid this by relying on the repository instead of the viewModel.
// The ViewModel shouldn't call Firestore directly anyway!

fs.writeFileSync(path, content, 'utf8');
console.log('Customer OrderViewModel updated');
