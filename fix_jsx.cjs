const fs = require('fs');
const filesToFix = [
  'src/pages/Customers.jsx',
  'src/pages/Dashboard.jsx',
  'src/pages/Expenses/ExpenseForm.jsx',
  'src/pages/InventoryMovements.jsx',
  'src/pages/Products.jsx',
  'src/pages/Referrals.jsx',
  'src/pages/SkuDashboard.jsx'
];

for (const file of filesToFix) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/&amp;/g, "{'&'}");
    fs.writeFileSync(file, content);
    console.log('Fixed ' + file);
  } else {
    console.log('File not found: ' + file);
  }
}
