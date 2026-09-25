import re

with open('src/pages/Products.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """      const data = {
        ...formData,
        imageUrl: formData.images?.[0] || "",
"""
content = content.replace("      const data = {\n        ...formData,", replacement)

with open('src/pages/Products.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
