# KrishiVishal Project Architecture & Implementation Plan

This document outlines the proposed architecture for the KrishiVishal Android project and the step-by-step plan to implement/refactor the core modules.

## Architecture Overview

We will follow **Clean Architecture** principles adapted for modern Android development with **Jetpack Compose** and **Hilt**.

### 1. Layered Architecture
- **UI Layer (Feature-based)**:
    - **Compose Screens**: Declarative UI components.
    - **ViewModels**: Manage UI state and handle user interactions. Use `StateFlow` for state and `SharedFlow` for one-time events.
    - **Navigation**: Type-safe Jetpack Compose Navigation.
- **Domain Layer**:
    - **Models**: Plain Kotlin data classes representing the business entities.
    - **UseCases (Interactors)**: Contain reusable business logic. (e.g., `GetProductsUseCase`, `SyncCartUseCase`).
    - **Repository Interfaces**: Define contracts for data access.
- **Data Layer**:
    - **Repository Implementation**: Orchestrates data from Remote and Local sources.
    - **Remote Source**: Firebase Firestore, Cloud Functions, and Firebase Storage.
    - **Local Source**: Room Database (for caching) and DataStore (for user preferences/sessions).
    - **Sync System**: `SyncManager` handles background sync for offline actions.

### 2. Core Tech Stack
- **UI**: Jetpack Compose (Material 3).
- **Dependency Injection**: Hilt.
- **Networking**: Firebase SDK + OkHttp (for Razorpay/external APIs).
- **Database**: Room (v32) + Firestore.
- **Concurrency**: Kotlin Coroutines & Flow.
- **Image Loading**: Coil with multi-level caching.
- **Monitoring**: Firebase Crashlytics + Sentry.

---

## Proposed Changes & Improvements

### 1. Navigation Refactoring (Critical)
Currently, `MainScreen.kt` manages navigation via boolean flags and large `when` blocks. This is brittle and hard to maintain.
- **Action**: Implement **Type-Safe Navigation** using Jetpack Compose Navigation. Define routes as serializable classes/objects.
- **Benefit**: Better back-stack management, deep linking support, and isolation of screen logic.

### 2. Standardized State Pattern
Adopt a consistent `UiState` pattern across all ViewModels.
- **Pattern**: `val uiState: StateFlow<ScreenState>`.
- **States**: `Loading`, `Success(data)`, `Error(message)`.

### 3. Data Synchronization Strategy
Formalize the **Offline-First** approach.
- Use `networkBoundResource` for read operations (Fetch from Room → Fetch from Firestore → Update Room → Emit).
- Use `SyncManager` and `SyncOperation` queue for write operations (Update Room → Queue Job → Sync when online).

---

## Implementation Roadmap (Module-by-Module)

Following the user's requested order:

1.  **Module 1: Authentication**
    - Refactor `AuthViewModel` and `LoginScreen`.
    - Integrate `TokenManager` and `SecureStorage` for session persistence.
    - Implement biometric login (optional roadmap).

2.  **Module 2: Home**
    - Refactor `HomeScreen` with optimized `StateFlow`.
    - Implement Banner, Category, and Featured Product sections with shimmer loading.

3.  **Module 3: Products**
    - Refactor `ProductDetailScreen`, `BrandScreen`, and `CategoryScreen`.
    - Implement "No-Return Policy" and "Dynamic Pricing" logic.

4.  **Module 4: Search**
    - Implement real-time search with debouncing and history caching.
    - Advanced filtering (Brand, Category, Price Range).

5.  **Module 6: Checkout & Payment**
    - Integrate **Razorpay SDK**.
    - Implement address selection and order summary.
    - Server-side payment verification via Cloud Functions.

6.  **Module 7: Orders & Tracking**
    - Real-time order status tracking with GPS integration.
    - Order history with "Download Invoice" (PDF generation).

... and so on for Cart, Profile, Wishlist.

---

## User Review Required

> [!IMPORTANT]
> **Navigation Change**: Moving from the current `MainScreen.kt` "State-driven" navigation to `Compose Navigation` is a significant architectural shift. It will make the code much cleaner but requires refactoring the main entry point.

> [!NOTE]
> **Domain Layer**: Do you want explicit `UseCase` classes for all modules, or should we keep logic in Repositories for simplicity given the current project scale?

---

## Verification Plan

### Automated Tests
- **Unit Tests**: Test UseCases and ViewModels with Mockito/Turbine.
- **Integration Tests**: Test Repository sync logic with Test-Room and Mock-Firestore.
- **UI Tests**: Compose UI tests for critical flows (Login → Search → Cart → Checkout).

### Manual Verification
- Test "Airplane Mode" scenarios for offline support.
- Verify Razorpay Test Mode transactions.
- Inspect Firebase Console for analytics events.
