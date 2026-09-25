const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'Products.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const startMarker = '{/* Add/Edit Modal */}';
const startIdx = content.indexOf(startMarker);
const endMarker = '    </div>\n  );\n};\n\nexport default Products;';
let endIdx = content.indexOf(endMarker);
if (endIdx === -1) {
    endIdx = content.indexOf('      )}\n    </div>\n  );\n};\n\nexport default Products;');
}

if (startIdx !== -1 && endIdx !== -1) {
    const modalReplacement = `{/* Add/Edit Modal */}
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
      />\n`;
    
    content = content.substring(0, startIdx) + modalReplacement + content.substring(endIdx + 9);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("Successfully replaced the modal!");
} else {
    console.log("Could not find start or end markers.", startIdx, endIdx);
}
