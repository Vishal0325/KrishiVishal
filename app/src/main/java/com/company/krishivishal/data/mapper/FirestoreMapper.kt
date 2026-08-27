package com.company.krishivishal.data.mapper

import com.company.krishivishal.core.model.*
import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import java.util.UUID

fun DocumentSnapshot.toProduct(): Product? {
    val data = this.data ?: return null
    return try {
        Product().apply {
            id = this@toProduct.id
            parseBasicInfo(data)
            val (finalUrl, finalImages) = parseImages(data)
            imageUrl = finalUrl
            images = finalImages
            parsePricing(data)
            parseReviewsAndFeatures(data)
            parseLogistics(data)
            applyTechnicalMetadata(data)
            isActive = (data["isActive"] ?: true).toString().toBoolean()
            isReturnable = (data["isReturnable"] ?: true).toString().toBoolean()
        }
    } catch (e: Exception) {
        android.util.Log.e("FirestoreMapper", "Error mapping product ${this.id}: ${e.message}")
        null
    }
}

private fun Product.parseBasicInfo(data: Map<String, Any>) {
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
}

private fun Product.parseReviewsAndFeatures(data: Map<String, Any>) {
    rating = (data["rating"] ?: 0.0).toString().toFloatOrNull() ?: 0f
    reviewsCount = (data["reviewsCount"] ?: data["reviewCount"] ?: 0).toString().toIntOrNull() ?: 0
    features = (data["features"] as? List<*>)?.mapNotNull { it?.toString() } ?: emptyList()
    variants = parseVariants(data, id)
    reviewItems = parseReviews(data)
}

private fun Product.parseLogistics(data: Map<String, Any>) {
    deliveryLocation = (data["deliveryLocation"] ?: "").toString()
    deliveryDate = (data["deliveryDate"] ?: "").toString()
    weight = (data["weight"] ?: data["size"] ?: data["packSize"] ?: data["pack_size"] ?: data["pack_weight"] ?: data["net_quantity"] ?: data["quantity"] ?: "").toString().removeSuffix(".0")
    unit = (data["unit"] ?: "").toString()
    mfgDate = data["mfgDate"] as? Timestamp
    expiryDate = data["expiryDate"] as? Timestamp
    stockQuantity = (data["stockQuantity"] ?: data["stockCount"] ?: data["stock"] ?: 10).toString().toIntOrNull() ?: 10
}

private fun parseImages(data: Map<String, Any>): Pair<String, List<String>> {
    val firebaseUrl = (data["imageUrl"] ?: data["image"] ?: data["thumb"] ?: "").toString().trim()
    val firebaseImages = (data["images"] as? List<*>)?.mapNotNull { it?.toString() }
        ?: (data["imageUrls"] as? List<*>)?.mapNotNull { it?.toString() }
        ?: (data["gallery"] as? List<*>)?.mapNotNull { it?.toString() }
        ?: emptyList()

    val imageUrl = if (firebaseUrl == "null") "" else firebaseUrl
    val images = firebaseImages.filter { it.isNotBlank() && it != "null" }.toMutableList()

    var finalImageUrl = imageUrl
    if (finalImageUrl.isBlank() && images.isNotEmpty()) {
        finalImageUrl = images.first()
    }
    if (finalImageUrl.isNotBlank() && !images.contains(finalImageUrl)) {
        images.add(0, finalImageUrl)
    }
    return Pair(finalImageUrl, images)
}

private fun Product.parsePricing(data: Map<String, Any>) {
    val rawMrp = (data["mrp"] ?: data["basePrice"] ?: data["price"] ?: 0.0).toString().toDoubleOrNull() ?: 0.0
    val rawBasePrice = (data["basePrice"] ?: data["mrp"] ?: data["price"] ?: 0.0).toString().toDoubleOrNull() ?: 0.0
    val discPrice = (data["discountedPrice"] ?: data["offerPrice"] ?: data["salePrice"] ?: data["price"] ?: 0.0).toString().toDoubleOrNull() ?: 0.0

    if (discPrice > 0) {
        price = discPrice
        discountedPrice = discPrice
        mrp = if (rawMrp > 0) rawMrp else if (rawBasePrice > 0) rawBasePrice else discPrice
    } else if (rawBasePrice > 0) {
        price = rawBasePrice
        discountedPrice = rawBasePrice
        mrp = if (rawMrp > 0) rawMrp else rawBasePrice
    } else {
        val p = (data["price"] ?: 0.0).toString().toDoubleOrNull() ?: 0.0
        price = p
        discountedPrice = p
        mrp = if (rawMrp > 0) rawMrp else p
    }

    basePrice = rawBasePrice
    discountPercent = (data["discountPercent"] ?: data["discount"] ?: 0).toString().toIntOrNull() ?: 0
    savedPrice = (data["savedPrice"] ?: (mrp - price).coerceAtLeast(0.0)).toString().toDoubleOrNull() ?: 0.0
}

private fun parseVariants(data: Map<String, Any>, productId: String): List<Variant> {
    val variantsData = data["variants"] as? List<*> ?: return emptyList()
    return variantsData.mapNotNull { item ->
        val vMap = item as? Map<*, *> ?: return@mapNotNull null
        mapVariant(vMap, productId)
    }
}

private fun mapVariant(vMap: Map<*, *>, productId: String): Variant {
    val vPrice = (vMap["price"] ?: vMap["discountedPrice"] ?: vMap["sellingPrice"] ?: 0.0).toString().toDoubleOrNull() ?: 0.0
    val vBasePrice = (vMap["basePrice"] ?: vMap["mrp"] ?: vPrice).toString().toDoubleOrNull() ?: vPrice
    val calculatedDiscount = if (vBasePrice > vPrice && vBasePrice > 0) {
        (((vBasePrice - vPrice) / vBasePrice) * 100).toInt()
    } else 0
    val vDiscount = (vMap["discountPercent"] ?: vMap["discount"] ?: calculatedDiscount).toString().toIntOrNull() ?: calculatedDiscount
    val vLabel = (vMap["label"] ?: vMap["size"] ?: vMap["weight"] ?: "").toString()
    val vSize = (vMap["size"] ?: vMap["weight"] ?: vMap["packSize"] ?: vLabel).toString()
    val vStock = (vMap["stock"] ?: vMap["stockQuantity"] ?: vMap["stockCount"] ?: 10).toString().toIntOrNull() ?: 10

    return Variant(
        id = (vMap["id"] ?: UUID.randomUUID().toString()).toString(),
        productId = productId,
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
}

private fun parseReviews(data: Map<String, Any>): List<ReviewItem> {
    val reviewsData = data["reviews"] as? List<*> ?: return emptyList()
    return reviewsData.mapNotNull { item ->
        val rMap = item as? Map<*, *> ?: return@mapNotNull null
        ReviewItem(
            authorName = rMap["authorName"]?.toString() ?: "",
            location = rMap["location"]?.toString() ?: "",
            rating = (rMap["rating"] ?: 0.0).toString().toFloatOrNull() ?: 0f,
            text = rMap["text"]?.toString() ?: "",
            date = rMap["date"] as? Timestamp
        )
    }
}

private fun Product.applyTechnicalMetadata(data: Map<String, Any>) {
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
