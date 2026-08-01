# Implementation Plan - Fix 4 Bugs in ProductDetailComponents.kt

This plan addresses 4 specific bugs in the product detail UI, ranging from wishlist functionality to quantity limits and size display logic.

## Proposed Changes

### [Component] UI Components

#### [MODIFY] [ProductDetailComponents.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/product/components/ProductDetailComponents.kt)

- **Fix 1: Wishlist heart button**
    - Update `ProductImageSection` to accept `isWishlisted: Boolean` and `onWishlistToggle: () -> Unit`.
    - Update `CircleIconButton` to allow a `tint` parameter.
    - Change the heart icon and color based on `isWishlisted` state.
- **Fix 2: "Size: 0 gm" bug**
    - Add top-level helper `isValidSizeValue(value: String): Boolean`.
    - Use `isValidSizeValue` in `ProductInfoSection`'s `displaySize` logic.
    - Use `isValidSizeValue` in `VariantCard`'s `labelText` fallback logic.
- **Fix 3: Quantity minus button**
    - In `BottomActions`, disable the minus button and change its tint when `quantity <= 1`.
- **Fix 4: Rating display**
    - In `ProductInfoSection`, conditionally show the rating row only if `product.reviewsCount > 0`.
    - Show "No ratings yet" if there are no reviews.

#### [MODIFY] [ProductDetailScreen.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/product/ProductDetailScreen.kt)

- Update `ProductImageSection` call site to pass `isWishlisted` and `onWishlistToggle`.
- Add handling for `uiState.showLoginPrompt` to display a Snackbar/Toast message: "Login to save items to your wishlist".

## Verification Plan

### Automated Tests
- Run `./gradlew assembleDebug` to ensure the project builds successfully.

### Manual Verification
1. **Size Display:** Verify that products with weight/size "0" show "N/A" or fall back to valid values instead of "0 gm".
2. **Wishlist:** Toggle the heart button and verify the icon changes (filled red/outline black).
3. **Wishlist (Guest):** Log out (or simulate guest) and verify that tapping the heart shows a "Login to save items to your wishlist" message.
4. **Quantity:** Verify the minus button is disabled at quantity 1.
5. **Ratings:** Open a product with 0 reviews and verify it shows "No ratings yet" instead of stars.
