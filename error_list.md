# KrishiVishal-Admin Errors & Audit Findings

## Syntax Errors

- **File**: `src\pages\Customers.jsx`
  - **Message**: Syntax error at line src\pages\Customers.jsx:719:  `& Hub Addresses` was unexpected
  - **Locations**: Line 719, Line 989, Line 1060, Line 1203

- **File**: `src\pages\Dashboard.jsx`
  - **Message**: Syntax error at line src\pages\Dashboard.jsx:587:  `& Alerts` was unexpected
  - **Locations**: Line 587

- **File**: `src\pages\Expenses\ExpenseForm.jsx`
  - **Message**: Syntax error at line src\pages\Expenses\ExpenseForm.jsx:302:  `& Tax` was unexpected
  - **Locations**: Line 302, Line 421

- **File**: `src\pages\InventoryMovements.jsx`
  - **Message**: Syntax error at line src\pages\InventoryMovements.jsx:569:  `& Record Stock Movement` was unexpected
  - **Locations**: Line 569

- **File**: `src\pages\Products.jsx`
  - **Message**: Syntax error at line src\pages\Products.jsx:1025:  `& management` was unexpected
  - **Locations**: Line 1025, Line 1689, Line 1758, Line 2373, Line 2479

- **File**: `src\pages\Referrals.jsx`
  - **Message**: Syntax error at line src\pages\Referrals.jsx:491:  `& Reversals (` was unexpected
  - **Locations**: Line 491, Line 589, Line 652, Line 735

- **File**: `src\pages\SkuDashboard.jsx`
  - **Message**: Syntax error at line src\pages\SkuDashboard.jsx:222:  `& Inventory` was unexpected
  - **Locations**: Line 222, Line 361

- **File**: `src\schemas\FirestoreSchema_v2.js`
  - **Message**: Syntax error at line src\schemas\FirestoreSchema_v2.js:101:  `T10:30:00Z` was unexpected
  - **Locations**: Line 101, Line 113, Line 114, Line 115, Line 185, Line 192, Line 195, Line 196, Line 198, Line 199, Line 226, Line 227

## Audit & Security Warnings

- **File**: `functions\processReturnRefund.js` (Line 65)
  - **Issue**: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
  - **Message**: Detected string concatenation with a non-literal variable in a util.format / console.log function. If an attacker injects a format specifier in the string, it will forge the log message. Try to use constant values for the format string.

- **File**: `functions\processReturnRefund.js` (Line 108)
  - **Issue**: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
  - **Message**: Detected string concatenation with a non-literal variable in a util.format / console.log function. If an attacker injects a format specifier in the string, it will forge the log message. Try to use constant values for the format string.

- **File**: `functions\processReturnRefund.js` (Line 116)
  - **Issue**: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
  - **Message**: Detected string concatenation with a non-literal variable in a util.format / console.log function. If an attacker injects a format specifier in the string, it will forge the log message. Try to use constant values for the format string.

- **File**: `functions\processReturnRefund.js` (Line 190)
  - **Issue**: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
  - **Message**: Detected string concatenation with a non-literal variable in a util.format / console.log function. If an attacker injects a format specifier in the string, it will forge the log message. Try to use constant values for the format string.

- **File**: `functions\processReturnRefund.js` (Line 198)
  - **Issue**: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
  - **Message**: Detected string concatenation with a non-literal variable in a util.format / console.log function. If an attacker injects a format specifier in the string, it will forge the log message. Try to use constant values for the format string.

- **File**: `functions\processReturnRefund.js` (Line 235)
  - **Issue**: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
  - **Message**: Detected string concatenation with a non-literal variable in a util.format / console.log function. If an attacker injects a format specifier in the string, it will forge the log message. Try to use constant values for the format string.

- **File**: `functions\processReturnRefund.js` (Line 243)
  - **Issue**: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
  - **Message**: Detected string concatenation with a non-literal variable in a util.format / console.log function. If an attacker injects a format specifier in the string, it will forge the log message. Try to use constant values for the format string.

- **File**: `functions\processReturnRefund.js` (Line 370)
  - **Issue**: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
  - **Message**: Detected string concatenation with a non-literal variable in a util.format / console.log function. If an attacker injects a format specifier in the string, it will forge the log message. Try to use constant values for the format string.

- **File**: `scripts\migrateFirestoreSchema.js` (Line 75)
  - **Issue**: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
  - **Message**: Detected string concatenation with a non-literal variable in a util.format / console.log function. If an attacker injects a format specifier in the string, it will forge the log message. Try to use constant values for the format string.

- **File**: `scripts\migrateFirestoreSchema.js` (Line 168)
  - **Issue**: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
  - **Message**: Detected string concatenation with a non-literal variable in a util.format / console.log function. If an attacker injects a format specifier in the string, it will forge the log message. Try to use constant values for the format string.

- **File**: `scripts\migrate_gen2.cjs` (Line 13)
  - **Issue**: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
  - **Message**: Detected possible user input going into a `path.join` or `path.resolve` function. This could possibly lead to a path traversal vulnerability,  where the attacker can access arbitrary files stored in the file system. Instead, be sure to sanitize or validate user input first.

- **File**: `src\pages\Products.jsx` (Line 569)
  - **Issue**: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
  - **Message**: Detected string concatenation with a non-literal variable in a util.format / console.log function. If an attacker injects a format specifier in the string, it will forge the log message. Try to use constant values for the format string.

