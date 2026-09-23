import re

with open('core/src/main/java/com/company/krishivishal/core/model/Category.kt', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
if 'com.google.firebase.firestore.DocumentId' not in content:
    content = content.replace(
        'import com.google.firebase.firestore.IgnoreExtraProperties',
        'import com.google.firebase.firestore.IgnoreExtraProperties\nimport com.google.firebase.firestore.DocumentId'
    )

# Add @DocumentId to id in Category
if '@DocumentId' not in content:
    content = content.replace(
        '@PrimaryKey val id: String = "",',
        '@DocumentId\n    @PrimaryKey val id: String = "",'
    )

with open('core/src/main/java/com/company/krishivishal/core/model/Category.kt', 'w', encoding='utf-8') as f:
    f.write(content)
