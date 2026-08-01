# Implementation Plan - Product Variants Phases 4-6

This plan covers the completion of Product Variants integration across the Android app and the Web Admin panel.

## Proposed Changes

### Phase 4: Cart / Checkout Display (Android)

#### [MODIFY] [CartScreen.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/cart/CartScreen.kt)
- Update `CartListItem` to show the variant label (from `item.variant?.label`) directly under the product name.
- Use small, muted text for the variant label.
- Only show the label if it's not null or blank.
- Group the product name and variant label in a single semantic node for better TalkBack accessibility (content description: "Product Name, Variant Label").
- Ensure `availableStock()` extension is used for stock checks (already present in the file).

#### [MODIFY] [CheckoutScreen.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/checkout/CheckoutScreen.kt)
- Update `OrderSummaryItem` to match the `CartListItem` styling for consistency.
- Display the variant label under the product name.
- Accessibility improvements similar to `CartScreen.kt`.

#### [MODIFY] [OrderScreen.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/order/OrderScreen.kt)
- Update `OrderItemCard` to display the variant label for items.
- Since `OrderItem` stores `variantLabel` as a historical record, read directly from `item.variantLabel`.
- If an order has multiple items, ensure the expanded view or details show variant labels for all items.

#### [MODIFY] [OrderBillScreen.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/order/OrderBillScreen.kt)
- Update all invoice templates (`StandardTemplate`, `CompactTemplate`, `DetailedTaxTemplate`, etc.) to include the variant label in the item description column.
- Format: "Product Name (Variant Label)" or "Product Name \n Variant Label" depending on the template's layout.

### Phase 5: Invoice (Android)

#### [MODIFY] [PrintHelper.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/utils/PrintHelper.kt)
- Update `generateInvoiceHtml()` to include the variant label in the item description.
- Format: `Product Name (Variant Label)` if `variantLabel` exists, else just `Product Name`.
- No changes to GST or other financial logic.

### Phase 6: Admin Panel (Web - React/TS)

#### [MODIFY] [ProductsPage.tsx](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/web-admin/src/pages/ProductsPage.tsx)
- Define `Variant` interface: `id`, `label`, `price`, `mrp`, `stock`.
- Update `Product` interface to include `variants: Variant[]`.
- Add a "Variants" section to the product edit form:
    - Repeatable field group for each variant.
    - "Add Variant" and "Remove" buttons.
- Implement validation in `handleSave`:
    - No duplicate labels within a product.
    - `price > 0`, `mrp >= price`, `stock >= 0` for each variant.
    - Show inline error messages for validation failures.
- Update the products table to show stock breakdown per variant (e.g., "500ml: 10 | 1L: 5") if the product has variants.
- Ensure the save logic writes the `variants` array to the Firestore product document.

---

## Verification Plan

### Automated Tests
- **Android**: Run `./gradlew build` to ensure no regressions in the Android app.
- **Web Admin**: Run `npm run build` in the `web-admin` directory.

### Manual Verification
1. **End-to-End Flow**:
    - Create a product with multiple variants in the Web Admin.
    - Verify stock display in the Admin table shows the breakdown.
    - Open the Android app and find the new product.
    - Add a specific variant to the cart.
    - Verify `CartScreen` shows the variant label.
    - Proceed to checkout and verify `CheckoutScreen` shows the variant label.
    - Place the order and view it in `OrderScreen` (Order History).
    - Generate an invoice and verify the variant label appears in the HTML/PDF.
2. **Backward Compatibility**:
    - Verify that a legacy product (with no variants) still displays correctly on all screens without showing "null" or extra empty lines.
3. **Validation Test (Admin)**:
    - Attempt to save a product with duplicate variant labels or invalid prices/stock and verify that inline errors are shown.
