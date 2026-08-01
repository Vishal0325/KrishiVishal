# Tasks - Data Quality & UI Consistency

## Phase 1: Admin Panel Validation (Web)
- [ ] `ProductsPage.tsx`: Implement image URL and size/weight validation
- [ ] `ProductsPage.tsx`: Add inline error messaging for validation

## Phase 2: CSV Import Validation (Android)
- [ ] `BulkManageProductsUseCase.kt`: Add validation for CSV rows (skip bad data)
- [ ] `BulkManageProductsUseCase.kt`: Implement basic error reporting for skipped rows

## Phase 3: UI Consistency (Android)
- [ ] `ProductDetailScreen.kt`: Refactor to use shared `ProductImageSection` from `ProductDetailComponents.kt`
- [ ] `ProductDetailScreen.kt`: Remove duplicate component definitions
- [ ] `ProductDetailScreen.kt`: Ensure overlay Z-index/ordering is correct

## Verification
- [ ] Web Admin Build: `npx vite build`
- [ ] Android Build: `./gradlew assembleDebug`
- [ ] Manual Test: Validate Admin blocking of `weight: 0`
- [ ] Manual Test: Verify Heart/Share icon presence on multiple products
