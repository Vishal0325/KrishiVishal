# 🌾 Krishi Vishal - AI Agent Project Review Guide

This document is designed to help any AI Agent quickly understand the Krishi Vishal project, its current state, and provide a high-quality review of the codebase.

## 📁 Project Overview
Krishi Vishal is a multi-platform ecosystem for farmers (Kisan) to buy seeds, pesticides, and fertilizers.
- **Main App (`:app` module):** Contains both the Customer App and the Admin Panel.
- **Delivery App (`:KrishiVishaldelivery`):** App for delivery riders.
- **Web Admin (`web-admin`):** React-based dashboard for desktop management.
- **Backend:** Firebase (Firestore, Auth, Storage).

## 🛠 Tech Stack
- **Android:** Kotlin, Jetpack Compose, Hilt (DI), Room (Local DB), Coroutines/Flow, Coil.
- **Web:** React, TypeScript, Vite, Lucide Icons.
- **Database:** Firebase Firestore (Cloud) + Room (Local Sync).

## 🚀 Recently Implemented Features (Review Priorities)
1. **Sharing System ("Share Wala System"):**
   - Located in `ShareUtils.kt`.
   - Integrated into Home, Product Detail, and Profile screens.
   - *Check:* Does it generate correct Play Store links? Is the message farmer-friendly?

2. **No-Return Policy System:**
   - Controlled by `isReturnable` flag in `Product.kt`.
   - Admin UI in `AdminProductScreen.kt` and Web Admin `ProductsPage.tsx`.
   - User UI in `ProductDetailScreen.kt` (🔄 7 Days Return vs 🚫 No Return).
   - *Check:* Does the toggle persist correctly in Firestore and Room?

3. **Dynamic Pricing Display:**
   - Refined in `HomeScreen.kt` and `ProductDetailScreen.kt`.
   - Displays Selling Price (Bold) and MRP (Strikethrough).
   - *Check:* Does it handle cases where MRP is equal to or lower than Price gracefully?

## 🔍 Specific Review Instructions for Agents
Please analyze the following areas and provide feedback on **Strengths**, **Weaknesses**, and **Critical Bugs**:

### 1. Architecture & Clean Code
- Evaluate the implementation of MVVM pattern.
- Check `ProductRepositoryImpl.kt` for data flow efficiency between Firestore and Room.
- Review Hilt dependency injection setup in `DatabaseModule.kt` and `RepositoryModule.kt`.

### 2. User Experience (UX)
- Review the `HomeProductItem` layout in `HomeScreen.kt`. Is it information-dense but readable?
- Check the `ProfileScreen.kt` for clear navigation between user features and Admin Panel.

### 3. Data Integrity & Sync
- Verify Room Database versioning (Current: v32).
- Check `fallbackToDestructiveMigration()` usage in `DatabaseModule.kt` — is it safe for production?
- Inspect `toProduct()` extension in `ProductRepository.kt` for robust null handling of Firebase data.

### 4. Admin Security
- Review `AdminAuthManager.kt`. Is the `isAdmin` check implemented securely?
- Check `MainScreen.kt` navigation logic for the Admin Control Panel.

## 🚩 Known Limitations
- Local database version was recently bumped to 32 to fix a schema mismatch crash.
- Web Admin is a React app and needs `npm run dev` to see local source changes.

---
**Agent Task:** After reading this, please provide a summary of the current project quality and suggest 3 high-impact improvements.
