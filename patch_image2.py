import re

with open('src/services/bulkUpload.js', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """          description: existing?.description || `${primaryRow.name} by ${primaryRow.brand} in ${primaryRow.category}.`,
          images: existing?.images || [],
          imageUrl: existing?.imageUrl || (existing?.images?.[0] || ""),
"""
content = content.replace("          description: existing?.description || `${primaryRow.name} by ${primaryRow.brand} in ${primaryRow.category}.`,\n          images: existing?.images || [],", replacement)

with open('src/services/bulkUpload.js', 'w', encoding='utf-8') as f:
    f.write(content)
