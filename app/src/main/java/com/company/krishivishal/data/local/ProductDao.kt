package com.company.krishivishal.data.local

import androidx.room.*
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.Variant
import com.company.krishivishal.core.model.WishlistItem
import kotlinx.coroutines.flow.Flow

@Dao
interface ProductDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProducts(products: List<Product>)

    @RewriteQueriesToDropUnusedColumns
    @Query("SELECT * FROM products")
    fun getAllProducts(): Flow<List<Product>>

    @RewriteQueriesToDropUnusedColumns
    @Query("SELECT * FROM products WHERE (category = :category OR subCategory = :category) AND isActive = 1")
    fun getProductsByCategory(category: String): Flow<List<Product>>

    @RewriteQueriesToDropUnusedColumns
    @Query("SELECT * FROM products WHERE brand = :brand AND isActive = 1")
    fun getProductsByBrand(brand: String): Flow<List<Product>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProductCropCrossRefs(refs: List<com.company.krishivishal.core.model.ProductCropCrossRef>)

    @RewriteQueriesToDropUnusedColumns
    @Query("""
        SELECT * FROM products 
        WHERE (
            id IN (SELECT productId FROM product_crop_cross_ref WHERE cropId = :cropId)
            OR cropId = :cropId 
            OR cropName = :cropName 
            OR isAllCrops = 1
        ) AND isActive = 1
    """)
    fun getProductsByCrop(cropId: String, cropName: String): Flow<List<Product>>

    @RewriteQueriesToDropUnusedColumns
    @Query("SELECT * FROM products WHERE id = :productId")
    suspend fun getProductById(productId: String): Product?

    @RewriteQueriesToDropUnusedColumns
    @Query("""
        SELECT * FROM products 
        WHERE (isActive IS NULL OR isActive = 1) AND (
            name LIKE '%' || :query || '%' 
            OR brand LIKE '%' || :query || '%' 
            OR technicalName LIKE '%' || :query || '%'
            OR composition LIKE '%' || :query || '%'
            OR category LIKE '%' || :query || '%'
            OR subCategory LIKE '%' || :query || '%'
            OR cropName LIKE '%' || :query || '%'
        )
    """)
    suspend fun searchProductsLocally(query: String): List<Product>

    /**
     * Delete all locally cached products whose IDs are NOT in the given live Firestore list.
     * This purges stale / admin-deleted products from the local cache.
     */
    @Query("DELETE FROM products WHERE id NOT IN (:activeIds)")
    suspend fun deleteProductsNotInList(activeIds: List<String>)

    @Query("SELECT * FROM products WHERE id = :productId")
    fun getProductByIdFlow(productId: String): Flow<Product?>

    @Query("DELETE FROM products WHERE id = :productId")
    suspend fun deleteProductById(productId: String)

    @Query("DELETE FROM cart_items WHERE productId = :productId")
    suspend fun deleteCartItemsByProductId(productId: String)

    @Query("DELETE FROM wishlist_items WHERE productId = :productId")
    suspend fun deleteWishlistItemsByProductId(productId: String)

    @Query("DELETE FROM recently_viewed WHERE productId = :productId")
    suspend fun deleteRecentlyViewedByProductId(productId: String)

    @Query("DELETE FROM product_crop_cross_ref WHERE productId = :productId")
    suspend fun deleteCropRefsByProductId(productId: String)

    @Query("DELETE FROM product_recommendations WHERE recommendedProductId = :productId")
    suspend fun deleteRecommendationRefsByProductId(productId: String)

    /**
     * Complete cleanup of a product and all its local references
     */
    @Transaction
    suspend fun deleteProductAndRelations(productId: String) {
        deleteCartItemsByProductId(productId)
        deleteWishlistItemsByProductId(productId)
        deleteRecentlyViewedByProductId(productId)
        deleteCropRefsByProductId(productId)
        deleteRecommendationsForProduct(productId)
        deleteRecommendationRefsByProductId(productId)
        deleteProductById(productId)
    }

    @Query("DELETE FROM cart_items WHERE productId NOT IN (SELECT id FROM products)")
    suspend fun cleanupOrphanedCartItems()

    @Query("DELETE FROM wishlist_items WHERE productId NOT IN (SELECT id FROM products)")
    suspend fun cleanupOrphanedWishlistItems()

    @Query("DELETE FROM recently_viewed WHERE productId NOT IN (SELECT id FROM products)")
    suspend fun cleanupOrphanedRecentlyViewed()

    @Query("DELETE FROM product_crop_cross_ref WHERE productId NOT IN (SELECT id FROM products)")
    suspend fun cleanupOrphanedCropRefs()

    @Query("DELETE FROM product_recommendations WHERE recommendedProductId NOT IN (SELECT id FROM products)")
    suspend fun cleanupOrphanedRecommendationRefs()

    @Transaction
    suspend fun cleanupAllOrphanedData() {
        cleanupOrphanedCartItems()
        cleanupOrphanedWishlistItems()
        cleanupOrphanedRecentlyViewed()
        cleanupOrphanedCropRefs()
        cleanupOrphanedRecommendationRefs()
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertVariants(variants: List<Variant>)

    @Query("SELECT * FROM variants WHERE productId = :productId")
    fun getVariantsByProductId(productId: String): Flow<List<Variant>>

    @Query("SELECT * FROM variants WHERE productId = :productId")
    suspend fun getVariantsByProductIdOnce(productId: String): List<Variant>

    @Query("DELETE FROM variants WHERE id = :variantId")
    suspend fun deleteVariantById(variantId: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun addToWishlist(item: WishlistItem)

    @Delete
    suspend fun removeFromWishlist(item: WishlistItem)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRecommendations(recommendations: List<com.company.krishivishal.core.model.ProductRecommendationCrossRef>)

    @Query("SELECT products.* FROM products INNER JOIN product_recommendations ON products.id = product_recommendations.recommendedProductId WHERE product_recommendations.sourceProductId = :productId AND product_recommendations.type = :type ORDER BY product_recommendations.position ASC")
    suspend fun getRecommendationsByType(productId: String, type: String): List<Product>

    @Query("DELETE FROM product_recommendations WHERE sourceProductId = :productId")
    suspend fun deleteRecommendationsForProduct(productId: String)

    @RewriteQueriesToDropUnusedColumns
    @Query("SELECT products.* FROM products INNER JOIN wishlist_items ON products.id = wishlist_items.productId WHERE wishlist_items.userId = :userId")
    fun getWishlistProducts(userId: String): Flow<List<Product>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRecentlyViewed(item: com.company.krishivishal.core.model.RecentlyViewedProduct)

    @RewriteQueriesToDropUnusedColumns
    @Query("SELECT products.* FROM products INNER JOIN recently_viewed ON products.id = recently_viewed.productId WHERE recently_viewed.userId = :userId ORDER BY recently_viewed.timestamp DESC LIMIT 10")
    fun getRecentlyViewedProducts(userId: String): Flow<List<Product>>
}
