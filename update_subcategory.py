import re

file_path = "app/src/main/java/com/company/krishivishal/ui/category/SubCategoryScreen.kt"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

replacement = """        if (category.subCategories.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("No sub-categories found for this category.")
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = { onSubCategoryClick(SubCategory(name = "null")) }) {
                        Text("View All Products")
                    }
                }
            }
        } else {
            Column(modifier = Modifier.fillMaxSize()) {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    contentAlignment = Alignment.CenterEnd
                ) {
                    TextButton(onClick = { onSubCategoryClick(SubCategory(name = "null")) }) {
                        Text("View All Products", fontWeight = FontWeight.Bold)
                    }
                }
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(category.subCategories) { subCategory ->
                        SubCategoryItem(
                            subCategory = subCategory,
                            onClick = { onSubCategoryClick(subCategory) }
                        )
                    }
                }
            }
        }"""

pattern = r"        if \(category\.subCategories\.isEmpty\(\)\) \{\s*Box\(modifier = Modifier\.fillMaxSize\(\), contentAlignment = Alignment\.Center\) \{\s*Text\(\"No sub-categories found for this category\.\"\)\s*\}\s*\} else \{\s*LazyVerticalGrid\(\s*columns = GridCells\.Fixed\(3\),\s*contentPadding = PaddingValues\(16\.dp\),\s*horizontalArrangement = Arrangement\.spacedBy\(16\.dp\),\s*verticalArrangement = Arrangement\.spacedBy\(16\.dp\),\s*modifier = Modifier\.fillMaxSize\(\)\s*\) \{\s*items\(category\.subCategories\) \{ subCategory ->\s*SubCategoryItem\(\s*subCategory = subCategory,\s*onClick = \{ onSubCategoryClick\(subCategory\) \}\s*\)\s*\}\s*\}\s*\}"

content = re.sub(pattern, replacement, content, flags=re.MULTILINE | re.DOTALL)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
