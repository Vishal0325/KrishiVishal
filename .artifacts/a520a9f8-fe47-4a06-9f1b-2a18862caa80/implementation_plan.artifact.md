# Implementation Plan - Fix Pricing and Offer Display

The user reported that pricing details (MRP, Base Price, Discounted Price, Discount Percent, and Saved Price) are not visible in the app. This is likely due to incorrect data mapping in the `Product` model and incomplete display logic in the UI components.

## User Review Required

> [!IMPORTANT]
> I will align the pricing logic as follows:
> - **MRP / Base Price**: The original price before discount.
> - **Selling Price / Discounted Price**: The price the customer pays.
> - **Saved Price**: The difference between MRP and Selling Price.
> - **Discount Percent**: The percentage of the discount.
>
> I will ensure these are shown clearly on the Product Detail screen.

## Proposed Changes

### [app component](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app)

#### [MODIFY] [Product.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/data/model/Product.kt)
- Fix the `mrp` field: Add `@SerializedName("mrp")`, `@get:PropertyName("mrp")`, and `@set:PropertyName("mrp")`.
- Remove `@IgnoredOnParcel` from `mrp` to ensure it's passed between screens.

#### [MODIFY] [ProductDetailScreen.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/product/ProductDetailScreen.kt)
- Update `ProductInfoSection` to explicitly show the Discount Percentage near the price.
- Ensure `basePrice` is considered in the pricing logic if `mrp` is missing or zero.
- Add a explicit "Discount: X% OFF" text in the info section.

#### [MODIFY] [HomeComponents.kt](file:///C:/Users/visha/AndroidStudioProjects/KrishiVishal/app/src/main/java/com/company/krishivishal/ui/home/components/HomeComponents.kt)
- Review `HomeProductItem` to ensure it uses the corrected `mrp` mapping.

## Verification Plan

### Automated Tests
- Run `./gradlew assembleDebug` to verify compilation.

### Manual Verification
1. Open the app and check product items in the home feed.
2. Open a product detail screen.
3. Verify that:
    - MRP is shown with a strikethrough.
    - Discounted price is shown prominently.
    - "Saved Price" is displayed correctly.
    - "Discount Percent" is visible.
