const fs = require('fs');

function replaceDeprecated(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/LocalConfiguration\.current/g, 'androidx.compose.ui.platform.LocalContext.current.resources.configuration');
    fs.writeFileSync(filePath, content, 'utf8');
}

replaceDeprecated('c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/dashboard/DashboardScreen.kt');
replaceDeprecated('c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/reconciliation/CashReconciliationScreen.kt');
replaceDeprecated('c:/Users/visha/AndroidStudioProjects/KrishiVishal/KrishiVishalDelivery/app/src/main/java/com/company/krishivishaldelivery/ui/reconciliation/components/CashDepositSlipDialog.kt');

console.log('Fixed LocalConfiguration warnings');
