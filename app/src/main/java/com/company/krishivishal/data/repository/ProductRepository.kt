package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.ProductDao
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.Review
import com.company.krishivishal.core.model.Variant
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.networkBoundResource
import com.company.krishivishal.utils.safeCall
import com.company.krishivishal.core.util.Constants
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Filter
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton
import java.util.UUID
import com.company.krishivishal.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.QuerySnapshot
import com.google.firebase.Timestamp
import com.company.krishivishal.core.model.ReviewItem
import androidx.paging.PagingData
import androidx.paging.Pager
import androidx.paging.PagingConfig
import com.company.krishivishal.data.paging.ProductPagingSource
import com.google.firebase.functions.FirebaseFunctions
import com.company.krishivishal.core.model.RecommendationResult

fun DocumentSnapshot.toProduct(): Product? {
    val data = this.data ?: return null
    return try {
        Product().apply {
            id = this@toProduct.id
            name = (data["name"] ?: data["title"] ?: data["productName"] ?: "").toString()
            brand = (data["brand"] ?: data["brandName"] ?: "").toString()
            description = (data["description"] ?: data["desc"] ?: "").toString()
            composition = (data["composition"] ?: data["technicalContent"] ?: data["technical_content"] ?: data["chemicalComposition"] ?: "").toString()
            category = (data["category"] ?: "").toString()
            cropId = (data["cropId"] ?: "").toString()
            cropName = (data["cropName"] ?: "").toString()
            associatedCropIds = (data["associatedCropIds"] as? List<*>)?.mapNotNull { it?.toString() } ?: emptyList()
            associatedCropNames = (data["associatedCropNames"] as? List<*>)?.mapNotNull { it?.toString() } ?: emptyList()
            isAllCrops = (data["isAllCrops"] ?: false).toString().toBoolean()

            classification = (data["classification"] ?: data["classification_type"] ?: "").toString()
            subCategory = (data["subCategory"] ?: "").toString()
            
            val firebaseUrl = (data["imageUrl"] ?: data["image"] ?: data["thumb"] ?: "").toString().trim()
            val firebaseImages = (data["images"] as? List<*>)?.mapNotNull { it?.toString() } 
                ?: (data["imageUrls"] as? List<*>)?.mapNotNull { it?.toString() }
                ?: (data["gallery"] as? List<*>)?.mapNotNull { it?.toString() }
                ?: emptyList()
            
            // Clean up potentially weird string "null" from Firestore
            imageUrl = if (firebaseUrl == "null") "" else firebaseUrl
            images = firebaseImages.filter { it.isNotBlank() && it != "null" }
            
            if (imageUrl.isBlank() && images.isNotEmpty()) {
                imageUrl = images.first()
            }
            // Ensure imageUrl is in the images list if not already there
            if (imageUrl.isNotBlank() && !images.contains(imageUrl)) {
                images = listOf(imageUrl) + images
            }
            
            mrp = (data["mrp"] ?: data["basePrice"] ?: data["price"] ?: 0.0).toString().toDoubleOrNull() ?: 0.0
            basePrice = (data["basePrice"] ?: data["mrp"] ?: data["price"] ?: 0.0).toString().toDoubleOrNull() ?: 0.0
            discountedPrice = (data["discountedPrice"] ?: data["offerPrice"] ?: data["salePrice"] ?: data["price"] ?: 0.0).toString().toDoubleOrNull() ?: 0.0
            
            // Logic to ensure price > 0
            if (discountedPrice > 0) {
                price = discountedPrice
                if (mrp <= 0) mrp = if (basePrice > 0) basePrice else discountedPrice
            } else if (basePrice > 0) {
                price = basePrice
                discountedPrice = basePrice
                if (mrp <= 0) mrp = basePrice
            } else {
                val p = (data["price"] ?: 0.0).toString().toDoubleOrNull() ?: 0.0
                price = p
                discountedPrice = p
                if (mrp <= 0) mrp = p
            }

            discountPercent = (data["discountPercent"] ?: data["discount"] ?: 0).toString().toIntOrNull() ?: 0
            savedPrice = (data["savedPrice"] ?: (mrp - price).coerceAtLeast(0.0)).toString().toDoubleOrNull() ?: 0.0
            
            rating = (data["rating"] ?: 0.0).toString().toFloatOrNull() ?: 0f
            reviewsCount = (data["reviewsCount"] ?: data["reviewCount"] ?: 0).toString().toIntOrNull() ?: 0
            
            deliveryLocation = (data["deliveryLocation"] ?: "").toString()
            deliveryDate = (data["deliveryDate"] ?: "").toString()
            weight = (data["weight"] ?: data["size"] ?: data["packSize"] ?: data["pack_size"] ?: data["pack_weight"] ?: data["net_quantity"] ?: data["quantity"] ?: "").toString().removeSuffix(".0")
            unit = (data["unit"] ?: "").toString()
            
            mfgDate = data["mfgDate"] as? Timestamp
            expiryDate = data["expiryDate"] as? Timestamp
            stockQuantity = (data["stockQuantity"] ?: data["stockCount"] ?: data["stock"] ?: 10).toString().toIntOrNull() ?: 10
            
            val featuresData = data["features"] as? List<*>
            features = featuresData?.mapNotNull { it?.toString() } ?: emptyList()

            // Robust Variants parsing
            val variantsData = data["variants"] as? List<*>
            variants = variantsData?.mapNotNull { item ->
                val vMap = item as? Map<*, *> ?: return@mapNotNull null
                try {
                    val vPrice = (vMap["price"] ?: vMap["discountedPrice"] ?: vMap["sellingPrice"] ?: 0.0).toString().toDoubleOrNull() ?: 0.0
                    val vBasePrice = (vMap["basePrice"] ?: vMap["mrp"] ?: vPrice).toString().toDoubleOrNull() ?: vPrice
                    val calculatedDiscount = if (vBasePrice > vPrice && vBasePrice > 0) {
                        (((vBasePrice - vPrice) / vBasePrice) * 100).toInt()
                    } else 0
                    val vDiscount = (vMap["discountPercent"] ?: vMap["discount"] ?: calculatedDiscount).toString().toIntOrNull() ?: calculatedDiscount
                    val vLabel = (vMap["label"] ?: vMap["size"] ?: vMap["weight"] ?: "").toString()
                    val vSize = (vMap["size"] ?: vMap["weight"] ?: vMap["packSize"] ?: vLabel).toString()
                    val vStock = (vMap["stock"] ?: vMap["stockQuantity"] ?: vMap["stockCount"] ?: 10).toString().toIntOrNull() ?: 10

                    Variant(
                        id = (vMap["id"] ?: UUID.randomUUID().toString()).toString(),
                        productId = this@toProduct.id,
                        size = vSize,
                        weight = (vMap["weight"] ?: "").toString(),
                        unit = (vMap["unit"] ?: "").toString(),
                        price = vPrice,
                        basePrice = vBasePrice,
                        discountPercent = vDiscount,
                        isBestSeller = (vMap["isBestSeller"] ?: false).toString().toBoolean(),
                        stock = vStock,
                        label = vLabel,
                        mfgDate = vMap["mfgDate"] as? Timestamp,
                        expiryDate = vMap["expiryDate"] as? Timestamp
                    )
                } catch (e: Exception) { null }
            } ?: emptyList()

            // Restore Reviews parsing
            val reviewsData = data["reviews"] as? List<*>
            reviewItems = reviewsData?.mapNotNull { item ->
                val rMap = item as? Map<*, *> ?: return@mapNotNull null
                try {
                    ReviewItem(
                        authorName = rMap["authorName"]?.toString() ?: "",
                        location = rMap["location"]?.toString() ?: "",
                        rating = (rMap["rating"] ?: 0.0).toString().toFloatOrNull() ?: 0f,
                        text = rMap["text"]?.toString() ?: "",
                        date = rMap["date"] as? Timestamp
                    )
                } catch (e: Exception) { null }
            } ?: emptyList()

            isActive = (data["isActive"] ?: true).toString().toBoolean()
            isReturnable = (data["isReturnable"] ?: true).toString().toBoolean()

            technicalName = (data["technicalName"] ?: "").toString()
            technicalNameNormalized = (data["technicalNameNormalized"] ?: "").toString()
            priceBand = (data["priceBand"] ?: "").toString()
            packSizeBand = (data["packSizeBand"] ?: "").toString()
            salesCount = (data["salesCount"] ?: 0).toString().toIntOrNull() ?: 0
            salesCount90d = (data["salesCount90d"] ?: 0).toString().toIntOrNull() ?: 0
            viewCount = (data["viewCount"] ?: 0).toString().toIntOrNull() ?: 0
            searchCount = (data["searchCount"] ?: 0).toString().toIntOrNull() ?: 0
            tags = (data["tags"] as? List<*>)?.mapNotNull { it?.toString() } ?: emptyList()
            targetPestIds = (data["targetPestIds"] as? List<*>)?.mapNotNull { it?.toString() } ?: emptyList()

            usageInstructionsField = (data["usageInstructions"] ?: "").toString()
            targetCrops = (data["targetCrops"] as? List<*>)?.mapNotNull { it?.toString() } ?: emptyList()
            targetPests = (data["targetPests"] as? List<*>)?.mapNotNull { it?.toString() } ?: emptyList()
            targetDiseases = (data["targetDiseases"] as? List<*>)?.mapNotNull { it?.toString() } ?: emptyList()
            applicationMethod = (data["applicationMethod"] ?: "").toString()
            safetyNotes = (data["safetyNotes"] ?: "").toString()
            mixingCompatibility = (data["mixingCompatibility"] ?: "").toString()
        }
    } catch (e: Exception) {
        android.util.Log.e("ProductRepo", "Error mapping product ${this.id}: ${e.message}")
        null
    }
}

interface ProductRepository {
    fun getProducts(): Flow<Resource<List<Product>>>
    fun getProductsPaged(pageSize: Int = 20): Flow<PagingData<Product>>
    fun getProductsByCategory(category: String): Flow<Resource<List<Product>>>
    fun getProductsByBrand(brand: String): Flow<Resource<List<Product>>>
    fun getProductsByCrop(cropId: String, cropName: String): Flow<Resource<List<Product>>>
    fun getProductDetails(productId: String): Flow<Resource<Product?>>
    fun getVariantsByProductId(productId: String): Flow<Resource<List<Variant>>>
    suspend fun saveProduct(product: Product): Flow<Resource<Unit>>
    suspend fun deleteProduct(productId: String): Flow<Resource<Unit>>
    suspend fun seedProducts()
    fun addReview(review: Review): Flow<Resource<Unit>>
    fun getReviews(productId: String): Flow<Resource<List<Review>>>
    fun requestStockNotification(productId: String, userId: String): Flow<Resource<Unit>>
    fun getRecommendations(productId: String): Flow<Resource<RecommendationResult>>
}

@Singleton
class ProductRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val productDao: ProductDao,
    private val functions: FirebaseFunctions,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : ProductRepository {

    override fun getProducts(): Flow<Resource<List<Product>>> = networkBoundResource(
        query = { 
            productDao.getAllProducts().map { products ->
                products.map { product ->
                    val variants = productDao.getVariantsByProductIdOnce(product.id)
                    product.apply { this.variants = variants }
                }
            }
        },
        fetch = {
            firestore.collection("products").get().await().mapNotNull { it.toProduct() }
        },
        saveFetchResult = { products ->
            productDao.insertProducts(products)
            
            // Sync Crop Junction Table for fast indexed lookups
            val cropRefs = products.flatMap { product ->
                product.associatedCropIds.map { cropId ->
                    com.company.krishivishal.core.model.ProductCropCrossRef(product.id, cropId)
                }
            }
            if (cropRefs.isNotEmpty()) {
                productDao.insertProductCropCrossRefs(cropRefs)
            }

            val allVariants = products.flatMap { p -> 
                p.variants.onEach { v -> if (v.productId.isEmpty()) v.productId = p.id } 
            }
            if (allVariants.isNotEmpty()) {
                productDao.insertVariants(allVariants)
            }
        },
        dispatcher = ioDispatcher
    )

    override fun getProductsPaged(pageSize: Int): Flow<PagingData<Product>> {
        return Pager<QuerySnapshot, Product>(
            config = PagingConfig(
                pageSize = pageSize,
                enablePlaceholders = false
            ),
            pagingSourceFactory = { ProductPagingSource(firestore) }
        ).flow
    }

    override fun getProductsByCategory(category: String): Flow<Resource<List<Product>>> = networkBoundResource(
        query = { 
            productDao.getProductsByCategory(category).map { products ->
                products.map { product ->
                    val variants = productDao.getVariantsByProductIdOnce(product.id)
                    product.apply { this.variants = variants }
                }
            }
        },
        fetch = {
            firestore.collection("products").whereEqualTo("category", category).get().await().mapNotNull { it.toProduct() }
        },
        saveFetchResult = { products ->
            productDao.insertProducts(products)
            
            // Sync Crop Junction Table for fast indexed lookups
            val cropRefs = products.flatMap { product ->
                product.associatedCropIds.map { cropId ->
                    com.company.krishivishal.core.model.ProductCropCrossRef(product.id, cropId)
                }
            }
            if (cropRefs.isNotEmpty()) {
                productDao.insertProductCropCrossRefs(cropRefs)
            }

            val allVariants = products.flatMap { p -> 
                p.variants.onEach { v -> if (v.productId.isEmpty()) v.productId = p.id } 
            }
            if (allVariants.isNotEmpty()) {
                productDao.insertVariants(allVariants)
            }
        },
        dispatcher = ioDispatcher
    )

    override fun getProductsByBrand(brand: String): Flow<Resource<List<Product>>> = networkBoundResource(
        query = { 
            productDao.getProductsByBrand(brand).map { products ->
                products.map { product ->
                    val variants = productDao.getVariantsByProductIdOnce(product.id)
                    product.apply { this.variants = variants }
                }
            }
        },
        fetch = {
            firestore.collection("products").whereEqualTo("brand", brand).get().await().mapNotNull { it.toProduct() }
        },
        saveFetchResult = { products ->
            productDao.insertProducts(products)
            
            // Sync Crop Junction Table for fast indexed lookups
            val cropRefs = products.flatMap { product ->
                product.associatedCropIds.map { cropId ->
                    com.company.krishivishal.core.model.ProductCropCrossRef(product.id, cropId)
                }
            }
            if (cropRefs.isNotEmpty()) {
                productDao.insertProductCropCrossRefs(cropRefs)
            }

            val allVariants = products.flatMap { p -> 
                p.variants.onEach { v -> if (v.productId.isEmpty()) v.productId = p.id } 
            }
            if (allVariants.isNotEmpty()) {
                productDao.insertVariants(allVariants)
            }
        },
        dispatcher = ioDispatcher
    )

    override fun getProductsByCrop(cropId: String, cropName: String): Flow<Resource<List<Product>>> = networkBoundResource(
        query = { 
            productDao.getProductsByCrop(cropId, cropName).map { products ->
                products.map { product ->
                    val variants = productDao.getVariantsByProductIdOnce(product.id)
                    product.apply { this.variants = variants }
                }
            }
        },
        fetch = {
            firestore.collection("products").whereArrayContains("associatedCropIds", cropId).get().await().mapNotNull { it.toProduct() }
        },
        saveFetchResult = { products ->
            productDao.insertProducts(products)
            
            // Sync Crop Junction Table for fast indexed lookups
            val cropRefs = products.flatMap { product ->
                product.associatedCropIds.map { cropId ->
                    com.company.krishivishal.core.model.ProductCropCrossRef(product.id, cropId)
                }
            }
            if (cropRefs.isNotEmpty()) {
                productDao.insertProductCropCrossRefs(cropRefs)
            }

            val allVariants = products.flatMap { p -> 
                p.variants.onEach { v -> if (v.productId.isEmpty()) v.productId = p.id } 
            }
            if (allVariants.isNotEmpty()) {
                productDao.insertVariants(allVariants)
            }
        },
        dispatcher = ioDispatcher
    )

    override fun getProductDetails(productId: String): Flow<Resource<Product?>> = networkBoundResource(
        query = { 
            productDao.getProductByIdFlow(productId).map { product ->
                if (product != null) {
                    val variants = productDao.getVariantsByProductIdOnce(product.id)
                    product.apply { this.variants = variants }
                } else null
            }
        },
        fetch = {
            firestore.collection("products").document(productId).get().await().toProduct()
        },
        saveFetchResult = { product ->
            product?.let {
                productDao.insertProducts(listOf(it))
                if (it.variants.isNotEmpty()) {
                    it.variants.forEach { v -> if (v.productId.isEmpty()) v.productId = it.id }
                    productDao.insertVariants(it.variants)
                }
            }
        },
        dispatcher = ioDispatcher
    )

    override fun getVariantsByProductId(productId: String): Flow<Resource<List<Variant>>> = networkBoundResource(
        query = { productDao.getVariantsByProductId(productId).map { it } },
        fetch = {
            val docSnapshot = firestore.collection("products").document(productId).get().await()
            val product = docSnapshot.toProduct()
            val embeddedVariants = product?.variants ?: emptyList()
            if (embeddedVariants.isNotEmpty()) {
                embeddedVariants
            } else {
                val snapshot = firestore.collection("products").document(productId)
                    .collection("variants")
                    .get()
                    .await()
                snapshot.documents.mapNotNull { it.toObject(Variant::class.java)?.apply { id = it.id } }
            }
        },
        saveFetchResult = { variants ->
            if (variants.isNotEmpty()) {
                variants.forEach { if (it.productId.isEmpty()) it.productId = productId }
                productDao.insertVariants(variants)
            }
        },
        dispatcher = ioDispatcher
    )

    override suspend fun saveProduct(product: Product): Flow<Resource<Unit>> = kotlinx.coroutines.flow.flow {
        emit(Resource.Loading())
        try {
            // 1. First, ensure all variants have IDs and correct productId
            product.variants.forEach { variant ->
                if (variant.id.isEmpty()) {
                    variant.id = UUID.randomUUID().toString()
                }
                variant.productId = product.id
            }

            // 2. Save main product
            firestore.collection("products").document(product.id).set(product).await()
            
            // 3. Save variants in sub-collection
            val variantsCollection = firestore.collection("products").document(product.id).collection("variants")
            
            // Handle deletions
            val existingVariantsSnapshot = variantsCollection.get().await()
            val existingIds = existingVariantsSnapshot.documents.map { it.id }
            val currentIds = product.variants.map { it.id }
            
            existingIds.forEach { id ->
                if (!currentIds.contains(id)) {
                    variantsCollection.document(id).delete().await()
                }
            }

            // Save/Update variants in sub-collection
            product.variants.forEach { variant ->
                variantsCollection.document(variant.id).set(variant).await()
            }

            productDao.insertProducts(listOf(product))
            if (product.variants.isNotEmpty()) {
                productDao.insertVariants(product.variants)
            }
            emit(Resource.Success(Unit))
        } catch (e: Exception) {
            emit(Resource.Error(e.message ?: "Error saving product"))
        }
    }

    override suspend fun deleteProduct(productId: String): Flow<Resource<Unit>> = kotlinx.coroutines.flow.flow {
        emit(Resource.Loading())
        try {
            // 1. Delete from Firestore
            firestore.collection("products").document(productId).delete().await()
            
            // 2. Delete from Room (including all relations: cart, wishlist, crop refs, etc.)
            productDao.deleteProductAndRelations(productId)
            
            emit(Resource.Success(Unit))
        } catch (e: Exception) {
            emit(Resource.Error(e.message ?: "Error deleting product"))
        }
    }

    override suspend fun seedProducts() {
        Constants.SAMPLE_PRODUCTS.forEach { product ->
            try {
                firestore.collection("products").document(product.id).set(product).await()
            } catch (e: Exception) {
                // Ignore
            }
        }
    }

    override fun addReview(review: Review): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        val reviewRef = firestore.collection("products").document(review.productId)
            .collection("reviews").document()
        val finalReview = review.copy(id = reviewRef.id, createdAt = com.google.firebase.Timestamp.now())
        reviewRef.set(finalReview).await()

        // Update product average rating
        val reviews = firestore.collection("products").document(review.productId)
            .collection("reviews").get().await().toObjects(Review::class.java)
        
        val avgRating = reviews.map { it.rating }.average().toFloat()
        firestore.collection("products").document(review.productId)
            .update("rating", avgRating, "reviewCount", reviews.size).await()
    }

    override fun getReviews(productId: String): Flow<Resource<List<Review>>> = safeCall(ioDispatcher) {
        firestore.collection("products").document(productId)
            .collection("reviews")
            .orderBy("createdAt", com.google.firebase.firestore.Query.Direction.DESCENDING)
            .get()
            .await()
            .toObjects(Review::class.java)
    }

    override fun requestStockNotification(productId: String, userId: String): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        val request = mapOf(
            "productId" to productId,
            "userId" to userId,
            "timestamp" to com.google.firebase.Timestamp.now(),
            "status" to "PENDING"
        )
        firestore.collection("stock_notification_requests").add(request).await()
    }

    override fun getRecommendations(productId: String): Flow<Resource<RecommendationResult>> = kotlinx.coroutines.flow.flow {
        emit(Resource.Loading())
        try {
            val data = hashMapOf(
                "productId" to productId,
                "maxResults" to 15
            )

            val result = functions
                .getHttpsCallable("getRecommendations")
                .call(data)
                .await()

            val sections = result.data as? Map<String, Any> ?: emptyMap()
            
            fun parseList(key: String): List<Product> {
                val list = sections[key] as? List<Map<String, Any>> ?: return emptyList()
                return list.mapNotNull { map ->
                    try {
                        Product().apply {
                            id = map["id"]?.toString() ?: ""
                            name = map["name"]?.toString() ?: ""
                            brand = map["brand"]?.toString() ?: ""
                            price = (map["price"] ?: 0.0).toString().toDoubleOrNull() ?: 0.0
                            imageUrl = map["imageUrl"]?.toString() ?: ""
                            composition = map["composition"]?.toString() ?: ""
                            category = map["category"]?.toString() ?: ""
                            technicalNameNormalized = map["technicalNameNormalized"]?.toString() ?: ""
                            recommendationReason = map["recommendationReason"]?.toString() ?: ""
                        }
                    } catch (e: Exception) { null }
                }
            }

            val finalResult = RecommendationResult(
                technical = parseList("technical"),
                similar = parseList("similar"),
                related = parseList("related")
            )

            // Cache to Room
            productDao.deleteRecommendationsForProduct(productId)
            val crossRefs = mutableListOf<com.company.krishivishal.core.model.ProductRecommendationCrossRef>()
            
            fun addRefs(products: List<Product>, type: String) {
                products.forEachIndexed { index, p ->
                    crossRefs.add(com.company.krishivishal.core.model.ProductRecommendationCrossRef(
                        sourceProductId = productId,
                        recommendedProductId = p.id,
                        type = type,
                        position = index
                    ))
                }
            }
            
            addRefs(finalResult.technical, "technical")
            addRefs(finalResult.similar, "similar")
            addRefs(finalResult.related, "related")
            
            productDao.insertRecommendations(crossRefs)
            // Also ensure products themselves are in DAO (shallow)
            productDao.insertProducts(finalResult.technical + finalResult.similar + finalResult.related)

            emit(Resource.Success(finalResult))
        } catch (e: Exception) {
            // Fallback to local cache
            try {
                val technical = productDao.getRecommendationsByType(productId, "technical")
                val similar = productDao.getRecommendationsByType(productId, "similar")
                val related = productDao.getRecommendationsByType(productId, "related")
                
                if (technical.isNotEmpty() || similar.isNotEmpty() || related.isNotEmpty()) {
                    emit(Resource.Success(RecommendationResult(technical, similar, related)))
                } else {
                    emit(Resource.Error(e.message ?: "Recommendations unavailable"))
                }
            } catch (localEx: Exception) {
                emit(Resource.Error(e.message ?: "Recommendations unavailable"))
            }
        }
    }.flowOn(ioDispatcher)
}

