import sys

with open('src/pages/Products.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = -1
for i, line in enumerate(lines):
    if '{/* Add/Edit Modal */}' in line:
        start_idx = i
        break

if start_idx == -1:
    print("Could not find start marker.")
    sys.exit(1)

# Find the matching closing bracket for the component
end_idx = -1
for i in range(len(lines)-1, -1, -1):
    if 'export default Products;' in lines[i]:
        # go back 3 lines to `  );`
        end_idx = i - 4
        break

if end_idx == -1 or end_idx <= start_idx:
    print("Could not find end marker.", end_idx)
    sys.exit(1)

replacement = """      {/* Add/Edit Modal */}
      <ProductFormModal 
        isOpen={isModalOpen}
        onClose={closeModal}
        formData={formData}
        setFormData={setFormData}
        categories={categories}
        brands={brands}
        crops={crops}
        suppliers={suppliers}
        onSubmit={handleSubmit}
        isSubmitting={submitting}
        editingProduct={editingProduct}
      />
"""

new_lines = lines[:start_idx] + [replacement] + lines[end_idx+1:]

# Make sure ProductFormModal is imported
content = "".join(new_lines)
if 'import ProductFormModal' not in content:
    content = content.replace('import BulkVariantManager', 'import BulkVariantManager\nimport ProductFormModal from "../components/catalog/ProductFormModal";\n')

with open('src/pages/Products.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replaced successfully")
