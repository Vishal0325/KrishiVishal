╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║              PRODUCT VARIANTS IMPLEMENTATION — ROADMAP                     ║
║                                                                            ║
║                   (One Complete Pass Strategy)                             ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝


STATUS: FOUNDATION LAYERS COMPLETE ✅
════════════════════════════════════════════════════════════════════════════

✅ PHASE 1: DATA MODELS (COMPLETE)
────────────────────────────────────

Created:
  • ProductVariant.kt — Lean variant model (variantId, label, price, mrp, stock, sku, isDefault)
    - Methods: discountPercent(), savedAmount(), isInStock()
    - Parcelable for passing between composables

Already Exists & Compatible:
  • Variant.kt — Room table for variants with foreign key to Product
    - Fields: id, productId, size, price, basePrice, discountPercent, stock, label
    - Matches variant requirements perfectly
  
  • CartItem.kt — Already has variantId: String? field
    - Index on variantId for efficient queries
    - Nullable to support legacy single-variant products
  
  • Product.kt — Already has variants: List<Variant> field
    - Uses @Ignore for Room (variants stored separately or as array)
    - Full backward compatibility: defaults to emptyList()

Updated:
  • Product.kt — No changes needed (already supports variants)
  • Product model correctly uses unit/weight for single-variant fallback


═══════════════════════════════════════════════════════════════════════════════
⏳ PHASE 2: BACKEND & DATABASE (NEXT — 4-6 hours)
════════════════════════════════════════════════════════════════════════════════

TASK 2.1: Room Database TypeConverter
──────────────────────────────────────
File: app/src/main/java/com/company/krishivishal/di/RoomConverters.kt
(or add to existing converters file)

Action: Create TypeConverter for List<Variant> ↔ JSON
  - Serialize variants list to JSON when caching Product
  - Deserialize back when loading from cache
  - Gson already used in project

Why: Product has @Ignore on variants, so we need to convert for Room
Option A: Store variants as JSON string in product table
Option B: Keep variants in separate table, load with join
Recommendation: Option B (cleaner, follows existing Variant entity structure)


TASK 2.2: ProductRepository Updates
────────────────────────────────────
File: app/src/main/java/com/company/krishivishal/data/repository/ProductRepository.kt

Changes:
  1. getProductDetails() — Already fetches variants from subcollection
     Verify it handles:
     □ Empty variants list (backward compat)
     □ Graceful null handling
  
  2. Add helper method: getDefaultVariant(product: Product): Variant?
     Logic:
     - If variants empty, return null (use product.price/stock)
     - If variants exist, find isDefault=true
     - If none marked default, return first in-stock variant
     - If all out of stock, return first variant (will show disabled)
  
  3. Add helper: getVariantByIdOrDefault(productId, variantId): Variant?
     Used in cart/checkout to fetch specific variant
     Falls back to default if variantId is null or not found
  
  4. Update toProduct() mapping to handle missing variants gracefully
     Already has this pattern, verify Firestore read includes variants array


TASK 2.3: OrderItem Model Enhancement
──────────────────────────────────────
File: app/src/main/java/com/company/krishivishal/data/model/Order.kt

Update OrderItem:
  @Parcelize
  data class OrderItem(
      @SerializedName("productId") val productId: String = "",
      @SerializedName("productName") val productName: String = "",
      @SerializedName("quantity") val quantity: Int = 0,
      @SerializedName("price") val price: Double = 0.0,
      @SerializedName("imageUrl") val imageUrl: String = "",
      
      // NEW: Variant fields (nullable for backward compat)
      @SerializedName("variantId") val variantId: String? = null,
      @SerializedName("variantLabel") val variantLabel: String? = null  // "500ml", "1L", etc.
  ) : Parcelable

Impact: Existing orders without these fields will deserialize fine (defaults to null)
        New orders will capture variant info for delivery accuracy


TASK 2.4: CartRepository / CheckoutRepository Updates
──────────────────────────────────────────────────────
Files: data/repository/CartRepository.kt, CheckoutRepository.kt

Changes:
  1. addToCart() — Accept variant selection
     Signature: addToCart(productId, variantId?, quantity)
  
  2. updateCartQuantity() — Check variant-specific stock, not product stock
     Old: validate quantity <= product.stockQuantity
     New: validate quantity <= variant.stock (or product.stockQuantity if no variant)
  
  3. getCartTotal() — Use variant prices in calculation, not product prices
  
  4. getCartItems() with products — Join variants table to get variant price/stock
     SELECT cart_items.*, variants.label, variants.price, variants.stock
     WHERE cart_items.variantId = variants.id OR cart_items.variantId IS NULL


TASK 2.5: OrderRepository / CheckoutFlow
──────────────────────────────────────────
Files: domain/usecase/checkout/CheckoutUseCase.kt, OrderRepository.kt

Changes:
  1. createOrder() — Map CartItem → OrderItem with variant fields
     When creating OrderItem:
       if (cartItem.variantId != null)
         orderItem.variantId = cartItem.variantId
         orderItem.variantLabel = cartItem.variant.label
       else
         orderItem.variantLabel = product.unit  // fallback to unit field
  
  2. Firestore write — Order now includes variantId + variantLabel in items array


═══════════════════════════════════════════════════════════════════════════════
⏳ PHASE 3: UI LAYER — VARIANT SELECTOR (4-5 hours)
════════════════════════════════════════════════════════════════════════════════

TASK 3.1: ProductVariantSelector Composable (Accessibility-First)
──────────────────────────────────────────────────────────────────
File: app/src/main/java/com/company/krishivishal/ui/components/ProductVariantSelector.kt

```kotlin
@Composable
fun ProductVariantSelector(
    variants: List<Variant>,
    selectedVariant: Variant?,
    onVariantSelected: (Variant) -> Unit,
    modifier: Modifier = Modifier
) {
    if (variants.isEmpty()) return  // No variant selector for single-variant products
    
    Column(modifier = modifier) {
        Text(
            text = "Select Size",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(start = 16.dp)
        )
        
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(16.dp),
            modifier = Modifier
                .fillMaxWidth()
                .semantics { liveRegion = LiveRegionMode.Polite }
        ) {
            items(variants.size) { index ->
                VariantChip(
                    variant = variants[index],
                    isSelected = selectedVariant?.id == variants[index].id,
                    onSelected = { onVariantSelected(variants[index]) }
                )
            }
        }
    }
}

@Composable
fun VariantChip(
    variant: Variant,
    isSelected: Boolean,
    onSelected: () -> Unit,
    modifier: Modifier = Modifier
) {
    // Touch target: 48dp minimum
    Button(
        onClick = onSelected,
        enabled = variant.stock > 0,
        modifier = modifier
            .sizeIn(minHeight = 48.dp, minWidth = 48.dp)
            .semantics {
                // TalkBack: "500 milliliters, selected" or "1 liter, out of stock"
                contentDescription = buildString {
                    append(variant.label)
                    if (isSelected) append(", selected")
                    if (variant.stock <= 0) append(", out of stock")
                }
                role = Role.Checkbox
            },
        colors = ButtonDefaults.buttonColors(
            containerColor = if (isSelected) Color.Green else Color(0xFFF0F0F0),
            contentColor = if (variant.stock <= 0) Color.Gray else Color.Black,
            disabledContainerColor = Color(0xFFF0F0F0),
            disabledContentColor = Color.Gray
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Icon: selected check, out-of-stock strikethrough
            if (isSelected) {
                Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
            }
            
            Text(
                text = variant.label,
                style = if (variant.stock <= 0) 
                    MaterialTheme.typography.labelSmall.copy(
                        textDecoration = TextDecoration.LineThrough
                    )
                else
                    MaterialTheme.typography.labelSmall,
                fontSize = 12.sp
            )
        }
    }
}
```

Accessibility Features:
  ✓ contentDescription with state (selected/out-of-stock/available)
  ✓ 48dp x 48dp minimum touch target
  ✓ Color + icon + text for state (not color alone)
  ✓ Keyboard navigable (Material Button already handles this)
  ✓ Live region for price updates when variant changes
  ✓ Checkmark icon for selected state (visual clarity)
  ✓ Strikethrough text for out-of-stock (additional signal)


TASK 3.2: Update ProductDetailScreen
─────────────────────────────────────
File: app/src/main/java/com/company/krishivishal/ui/product/ProductDetailScreen.kt

Changes:
  1. State: var selectedVariant: Variant? by remember { ... }
  
  2. Initialize with default:
     selectedVariant = ProductRepository.getDefaultVariant(product)
  
  3. Show ProductVariantSelector above crop section
     ProductVariantSelector(
         variants = product.variants,
         selectedVariant = selectedVariant,
         onVariantSelected = { variant ->
             selectedVariant = variant
             // Trigger price/stock update in state
         }
     )
  
  4. Update displayed price/stock/discount based on selectedVariant:
     displayPrice = selectedVariant?.price ?: product.discountedPrice
     displayStock = selectedVariant?.stock ?: product.stockQuantity
     displayMRP = selectedVariant?.basePrice ?: product.mrp
  
  5. Add to cart button:
     onClick = {
         cartRepository.addToCart(
             productId = product.id,
             variantId = selectedVariant?.id,
             quantity = quantity
         )
     }
  
  6. Announce price change:
     Modifier.semantics {
         liveRegion = LiveRegionMode.Polite
     }
     on the price display so TalkBack announces "Price updated to ₹450"


TASK 3.3: Update ProductCard (Grid/List)
─────────────────────────────────────────
File: app/src/main/java/com/company/krishivishal/ui/components/ProductCard.kt

Changes:
  1. Display price of DEFAULT variant:
     defaultVariant = ProductRepository.getDefaultVariant(product)
     displayPrice = defaultVariant?.price ?: product.discountedPrice
  
  2. Add variant count hint if variants.isNotEmpty():
     if (product.variants.size > 1) {
         Text(
             text = "+${product.variants.size - 1} more sizes",
             style = MaterialTheme.typography.labelSmall,
             color = Color.Gray
         )
     }
  
  3. Add to cart from card uses default variant:
     onClick = {
         cartRepository.addToCart(
             productId = product.id,
             variantId = defaultVariant?.id,  // Add default variant
             quantity = 1
         )
     }


═══════════════════════════════════════════════════════════════════════════════
⏳ PHASE 4: CART & CHECKOUT UI (3-4 hours)
════════════════════════════════════════════════════════════════════════════════

TASK 4.1: Update CartScreen
──────────────────────────────
File: app/src/main/java/com/company/krishivishal/ui/cart/CartScreen.kt

Changes in CartItemRow:
  1. Display variant label under product name:
     Text("${cartItem.productName} — ${cartItem.variantLabel ?: cartItem.product?.unit ?: ""}")
  
  2. Stock validation on quantity change:
     Old: if (newQuantity <= product.stockQuantity)
     New: variant = cartRepository.getVariant(cartItem.variantId)
          if (newQuantity <= (variant?.stock ?: product.stockQuantity))
  
  3. Price calculation uses variant price:
     variantPrice = cartRepository.getVariantPrice(cartItem.variantId)
     lineTotal = cartItem.quantity * (variantPrice ?: product.price)


TASK 4.2: Update CheckoutScreen/OrderSummary
───────────────────────────────────────────────
File: app/src/main/java/com/company/krishivishal/ui/checkout/CheckoutScreen.kt

Changes:
  1. Order summary table includes variant label:
     Column(
         modifier = Modifier.fillMaxWidth()
     ) {
         Text(item.productName, fontWeight = FontWeight.Bold)
         if (item.variantLabel != null) {
             Text(item.variantLabel, style = MaterialTheme.typography.labelSmall)
         }
     }
  
  2. Final order creation:
     orderRepository.createOrder(
         items = cartItems.map { cartItem ->
             OrderItem(
                 productId = cartItem.productId,
                 productName = cartItem.productName,
                 quantity = cartItem.quantity,
                 price = getVariantPrice(cartItem.variantId) ?: basePrice,
                 imageUrl = cartItem.imageUrl,
                 variantId = cartItem.variantId,
                 variantLabel = cartItem.variantLabel
             )
         }
     )


TASK 4.3: Update OrderDetailScreen / OrderHistory
───────────────────────────────────────────────────
File: app/src/main/java/com/company/krishivishal/ui/order/OrderDetailScreen.kt

Changes:
  Display variant label in order items:
  
  OrderItem order item display:
    Text(item.productName)
    if (item.variantLabel != null) {
        Text(
            text = "Size: ${item.variantLabel}",
            style = MaterialTheme.typography.labelSmall,
            color = Color.Gray
        )
    }


═══════════════════════════════════════════════════════════════════════════════
⏳ PHASE 5: INVOICE & PRINTING (1-2 hours)
════════════════════════════════════════════════════════════════════════════════

TASK 5.1: Update PrintHelper
────────────────────────────
File: app/src/main/java/com/company/krishivishal/utils/PrintHelper.kt

Changes to invoice generation:
  In item row section:
  
  Old:
    Item Name | Qty | Price
    Imidacloprid | 2 | ₹450
  
  New:
    Item Name | Size | Qty | Price
    Imidacloprid | 500ml | 2 | ₹450
    Imidacloprid | 1L | 1 | ₹850
  
  Code change:
    items.forEach { item ->
        // Add variant label column
        val sizeColumn = item.variantLabel ?: "-"
        // Include in table row
    }


═══════════════════════════════════════════════════════════════════════════════
⏳ PHASE 6: ADMIN PANEL (krishivishal-admin) (2-3 hours)
════════════════════════════════════════════════════════════════════════════════

TASK 6.1: Variant Management Form
──────────────────────────────────
File: web-admin/src/components/ProductForm.tsx

Changes:
  1. Add "Variants" section below product name/description
  
  2. Repeatable field group:
     - Label (250ml, 500ml, etc.)
     - Price (selling)
     - MRP (max retail)
     - Stock
     - Is Default (radio button — only one per product)
     - SKU (optional)
  
  3. Add/Remove buttons for variants
  
  4. Validation:
     □ At least one variant if variants mode used
     □ No duplicate labels
     □ Price > 0
     □ Only one marked as default
  
  5. On save: POST /api/products/{id}/variants with array


TASK 6.2: Stock Management Dashboard Update
────────────────────────────────────────────
File: web-admin/src/pages/StockManagement.tsx

Changes:
  - When product has variants, show stock per variant as separate rows
    or a collapsible section
  
  Before: Product | Stock
  After:  Product | Variant | Stock
          
          Imidacloprid | 250ml | 15
          Imidacloprid | 500ml | 42
          Imidacloprid | 1L | 8


═══════════════════════════════════════════════════════════════════════════════
🧪 VERIFICATION CHECKLIST
═══════════════════════════════════════════════════════════════════════════════

Test Scenarios:

1. Multi-Variant Product (3 sizes):
   □ Detail screen shows all 3 chips, first one selected
   □ Selecting variant updates price, discount, stock
   □ Add to cart with variant 2 (500ml) adds correct item
   □ Cart shows "Product — 500ml" under name
   □ Checkout shows variant in summary
   □ Order history shows variant
   □ Invoice prints variant label

2. Legacy Single-Variant Product (no variants array):
   □ Detail screen hides variant selector (no regression)
   □ Displays price/stock normally
   □ Add to cart works (variantId = null)
   □ Cart shows product normally (no variant label)
   □ Checkout works
   □ Order shows no variant label (as expected)

3. All Variants Out of Stock:
   □ All chips greyed out + strikethrough
   □ First chip selected but disabled
   □ Add to cart button disabled
   □ TalkBack: "out of stock, unavailable"

4. Accessibility:
   □ TalkBack: Variant chips announce "selected" state
   □ TalkBack: Chip announces "out of stock" when greyed
   □ Price update announced via liveRegion
   □ Keyboard navigation: Tab through chips left-to-right
   □ Touch target: All chips ≥ 48dp x 48dp

5. Build & Compile:
   □ Android app builds without errors
   □ Delivery app builds (if OrderItem shared)
   □ Web-admin builds (npm run build)
   □ No regression in existing tests


═══════════════════════════════════════════════════════════════════════════════
⏱️ TOTAL IMPLEMENTATION TIME ESTIMATE
═══════════════════════════════════════════════════════════════════════════════

Phase 1 (Data Models): ✅ 30 min — DONE
Phase 2 (Backend/DB): 4-6 hours
Phase 3 (Variant Selector): 4-5 hours
Phase 4 (Cart/Checkout): 3-4 hours
Phase 5 (Invoice): 1-2 hours
Phase 6 (Admin): 2-3 hours
Testing/Verification: 2-3 hours

Total: ~17-23 hours for complete, production-ready implementation

Suggested Approach:
  • Batch Phase 1 + Phase 2 (backend foundation)
  • Test database layer with unit tests
  • Batch Phase 3 + Phase 4 (UI core workflow)
  • Phase 5 + Phase 6 (reporting/admin)
  • Full integration testing + accessibility audit


═══════════════════════════════════════════════════════════════════════════════

Status: Ready to implement remaining phases
Next Action: Start Phase 2 (backend layer) — TypeConverter + Repository updates
