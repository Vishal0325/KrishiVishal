package com.company.krishivishal.ui.navigation

sealed class Screen(val route: String) {
    // Bottom Nav
    object Home : Screen("home")
    object Crops : Screen("crops")
    object Orders : Screen("orders")
    object Profile : Screen("profile")
    
    // Feature Screens
    object ProductDetail : Screen("product_detail/{productId}") {
        fun createRoute(productId: String) = "product_detail/$productId"
    }
    object CropDetail : Screen("crop_detail/{cropId}/{cropName}") {
        fun createRoute(cropId: String, cropName: String) = "crop_detail/$cropId/$cropName"
    }
    object BrandDetail : Screen("brand_detail/{brandName}") {
        fun createRoute(brandName: String) = "brand_detail/$brandName"
    }
    object SubCategoryDetail : Screen("subcategory_detail/{categoryId}") {
        fun createRoute(categoryId: String) = "subcategory_detail/$categoryId"
    }
    object CategoryProductDetail : Screen("category_product_detail/{categoryName}/{subCategoryName}") {
        fun createRoute(categoryName: String, subCategoryName: String? = null) = 
            "category_product_detail/${java.net.URLEncoder.encode(categoryName, "UTF-8")}/${java.net.URLEncoder.encode(subCategoryName ?: "null", "UTF-8")}"
    }
    object CategoryList : Screen("category_list")
    object BrandList : Screen("brand_list")
    object AllProducts : Screen("all_products")
    object Checkout : Screen("checkout/{source}") {
        fun createRoute(source: String) = "checkout/$source"
    }
    object OrderSuccess : Screen("order_success?otp={otp}&orderId={orderId}") {
        fun createRoute(otp: String?, orderId: String?) = "order_success?otp=${otp ?: ""}&orderId=${orderId ?: ""}"
    }
    object OrderBill : Screen("order_bill/{orderId}") {
        fun createRoute(orderId: String) = "order_bill/$orderId"
    }
    object Cart : Screen("cart")
    object Wishlist : Screen("wishlist")
    object Address : Screen("address")
    object Support : Screen("support")
    object Settings : Screen("settings")
    object GlobalSearch : Screen("search")
    object Notifications : Screen("notifications")
    object Login : Screen("login")
    object Tracking : Screen("tracking/{orderId}") {
        fun createRoute(orderId: String) = "tracking/$orderId"
    }
    object MyReturns : Screen("my_returns")
    
    // Admin Routes
    object AdminPanel : Screen("admin_panel")
    object AdminCategories : Screen("admin_categories")
    object AdminBrands : Screen("admin_brands")
    object AdminCrops : Screen("admin_crops")
    object AdminProducts : Screen("admin_products")
    object AdminOrders : Screen("admin_orders")
    object AdminUsers : Screen("admin_users/{role}") {
        fun createRoute(role: String) = "admin_users/$role"
    }
    object AdminCoupons : Screen("admin_coupons")
    object AdminBanners : Screen("admin_banners")
    object AdminSettings : Screen("admin_settings")
}
