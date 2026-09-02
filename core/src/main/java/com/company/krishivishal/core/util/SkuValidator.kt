package com.company.krishivishal.core.util

/**
 * KrishiVishal SKU Validator & Master Data Segment Helper (Android)
 * Standard nomenclature: CC-III-VVV-GG-SSSUU-BBB
 */
object SkuValidator {
    val SKU_REGEX = Regex("^[A-Z]{2}-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{2}-[A-Z0-9]{5}-[A-Z0-9]{3}$")

    val VALID_CATEGORIES = setOf("FE", "PE", "SE", "EQ", "IR", "OG", "NT", "OT")
    val VALID_UNITS = setOf("KG", "GM", "LT", "ML", "PC", "MT", "PK", "DO", "BG")

    data class SkuSegments(
        val category: String,
        val item: String,
        val variety: String,
        val grade: String,
        val pack: String,
        val size: Int,
        val unit: String,
        val brand: String
    )

    data class ValidationResult(
        val isValid: Boolean,
        val skuCode: String = "",
        val productId: String = "",
        val segments: SkuSegments? = null,
        val error: String? = null
    )

    fun validate(skuCode: String?): ValidationResult {
        if (skuCode.isNullOrBlank()) {
            return ValidationResult(isValid = false, error = "SKU Code cannot be empty.")
        }

        val upper = skuCode.trim().uppercase()
        if (!SKU_REGEX.matches(upper)) {
            return ValidationResult(
                isValid = false,
                error = "Invalid SKU format '$upper'. Must match CC-III-VVV-GG-SSSUU-BBB (e.g. FE-URE-GRN-46-050KG-IFF)."
            )
        }

        val parts = upper.split("-")
        val category = parts[0]
        val item = parts[1]
        val variety = parts[2]
        val grade = parts[3]
        val pack = parts[4]
        val brand = parts[5]

        if (!VALID_CATEGORIES.contains(category)) {
            return ValidationResult(isValid = false, error = "Invalid Category code '$category'.")
        }

        val sizeStr = pack.take(3)
        val unit = pack.substring(3)
        val sizeNum = sizeStr.toIntOrNull()

        if (sizeNum == null || sizeNum <= 0) {
            return ValidationResult(isValid = false, error = "Invalid pack size '$sizeStr' in '$pack'. Must be > 0.")
        }

        if (!VALID_UNITS.contains(unit)) {
            return ValidationResult(isValid = false, error = "Invalid pack unit '$unit'.")
        }

        val productId = "$category-$item-$variety-$brand"
        val segments = SkuSegments(
            category = category,
            item = item,
            variety = variety,
            grade = grade,
            pack = pack,
            size = sizeNum,
            unit = unit,
            brand = brand
        )

        return ValidationResult(
            isValid = true,
            skuCode = upper,
            productId = productId,
            segments = segments
        )
    }

    fun deriveProductId(skuCode: String?): String? {
        val result = validate(skuCode)
        return if (result.isValid) result.productId else null
    }
}
