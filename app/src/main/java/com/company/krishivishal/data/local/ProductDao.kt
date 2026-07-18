package com.company.krishivishal.data.local

import androidx.room.*
import com.company.krishivishal.data.model.Product
import com.company.krishivishal.data.model.Variant
import com.company.krishivishal.data.model.WishlistItem
import kotlinx.coroutines.flow.Flow

@Dao
interface ProductDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProducts(products: List<Product>)

    @Query("SELECT * FROM products")
    fun getAllProducts(): Flow<List<Product>>

    @Query("SELECT * FROM products WHERE (category = :category OR subCategory = :category) AND isActive = 1")
    fun getProductsByCategory(category: String): Flow<List<Product>>

    @Query("SELECT * FROM products WHERE brand = :brand AND isActive = 1")
    fun getProductsByBrand(brand: String): Flow<List<Product>>

    @Query("SELECT * FROM products WHERE (cropId = :cropId OR cropName = :cropName OR isAllCrops = 1 OR associatedCropIds LIKE '%' || :cropId || '%') AND isActive = 1")
    fun getProductsByCrop(cropId: String, cropName: String): Flow<List<Product>>

    @Query("SELECT * FROM products WHERE id = :productId")
    suspend fun getProductById(productId: String): Product?

    @Query("SELECT * FROM products WHERE id = :productId")
    fun getProductByIdFlow(productId: String): Flow<Product?>

    @Query("DELETE FROM products WHERE id = :productId")
    suspend fun deleteProductById(productId: String)

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

    @RewriteQueriesToDropUnusedColumns
    @Query("SELECT * FROM products INNER JOIN wishlist_items ON products.id = wishlist_items.productId WHERE wishlist_items.userId = :userId")
    fun getWishlistProducts(userId: String): Flow<List<Product>>
}
