const fs = require('fs');
const path = require('path');

const files = [
  'functions/inventory/grn.js',
  'functions/inventory/reports.js',
  'functions/inventory/skuMaster.js',
  'functions/inventory/stockTransfer.js',
  'functions/orders/warehouseAllocator.js'
];

const baseDir = path.resolve(__dirname, '..');

files.forEach(file => {
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
  const safeRelPath = path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.resolve(baseDir, safeRelPath);
  if (!filePath.startsWith(baseDir) || !fs.existsSync(filePath)) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace import
  content = content.replace(/const functions = require\(['"]firebase-functions\/v1['"]\);/, 
    'const functions = require("firebase-functions/v1");\nconst { onCall, HttpsError } = require("firebase-functions/v2/https");');
  
  // Replace HttpsError
  content = content.replace(/functions\.https\.HttpsError/g, 'HttpsError');
  
  // Replace onCall
  content = content.replace(/functions\.https\.onCall\(async \(([^,]+), ([^)]+)\) => \{/g, 
    'onCall(async (request) => {\n  const $1 = request.data;\n  const $2 = { auth: request.auth };');
    
  fs.writeFileSync(filePath, content);
});

console.log('Migration complete');
