import re

with open('src/pages/Products.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add import
if 'BulkStagingTable' not in content:
    content = content.replace(
        'import BulkVariantManager',
        'import BulkStagingTable from "../components/catalog/BulkStagingTable";\nimport BulkVariantManager'
    )

# 2. State variable
if 'showStaging' not in content:
    content = content.replace(
        'const [bulkRows, setBulkRows] = useState([]);',
        'const [bulkRows, setBulkRows] = useState([]);\n  const [showStaging, setShowStaging] = useState(false);'
    )

# 3. Inside handleBulkFile -> setBulkRows(data) -> also setShowStaging(true)
content = content.replace(
    'setBulkRows(data);',
    'setBulkRows(data);\n          setShowStaging(true);'
)
content = content.replace(
    'setBulkRows(results.data);',
    'setBulkRows(results.data);\n            setShowStaging(true);'
)

# 4. Modify startBulkImport
old_import = """  const startBulkImport = async () => {
    if (!bulkRows.length) return toast.error("Upload a CSV or Excel file first");
    setBulkProcessing(true);
    setBulkSummary(null);
    try {
      // 1-Click Unified Importer: Automatically generates SKUs, saves Products, creates Batches & Ledger
      const data = await importProducts(bulkRows, importWarehouseId);"""

new_import = """  const startBulkImport = async (validRows) => {
    if (!validRows || !validRows.length) return toast.error("No valid rows to import");
    setBulkProcessing(true);
    setBulkSummary(null);
    try {
      const data = await importProducts(validRows, importWarehouseId);"""

content = content.replace(old_import, new_import)

# 5. Render BulkStagingTable
# We can just put it before `{variantManagerProduct && (`
staging_component = """
      {showStaging && bulkRows.length > 0 && (
        <BulkStagingTable
          initialRows={bulkRows}
          isImporting={bulkProcessing}
          onConfirmImport={async (validRows) => {
            await startBulkImport(validRows);
            setShowStaging(false);
            setBulkRows([]);
          }}
          onCancel={() => {
            setShowStaging(false);
            setBulkRows([]);
          }}
        />
      )}
"""
if '<BulkStagingTable' not in content:
    content = content.replace(
        '{variantManagerProduct && (',
        staging_component + '\n      {variantManagerProduct && ('
    )

with open('src/pages/Products.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
