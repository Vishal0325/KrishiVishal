package com.company.krishivishal.utils

import java.util.*

object SearchUnderstandingUtil {

    private val SYNONYMS = mapOf(
        "dhan" to listOf("rice", "paddy", "धान"),
        "rice" to listOf("dhan", "paddy", "धान"),
        "gehun" to listOf("wheat", "गेहूं"),
        "wheat" to listOf("gehun", "गेहूं"),
        "makka" to listOf("maize", "corn", "मक्का"),
        "maize" to listOf("makka", "corn", "मक्का"),
        "khad" to listOf("fertilizer", "खाद"),
        "fertilizer" to listOf("khad", "खाद"),
        "keeda" to listOf("pest", "insect", "कीड़ा"),
        "pest" to listOf("keeda", "insect", "कीड़ा"),
        "dawa" to listOf("medicine", "insecticide", "pesticide", "fungicide", "herbicide", "दवा"),
        "alu" to listOf("potato", "आलू"),
        "potato" to listOf("alu", "आलू"),
        "mirch" to listOf("chilli", "pepper", "मिर्च"),
        "tamatar" to listOf("tomato", "टमाटर")
    )

    private val STOP_WORDS = setOf("me", "ki", "ka", "ke", "liye", "chahiye", "hai", "ko", "wala", "wali")

    data class SearchIntent(
        val crop: String? = null,
        val problem: String? = null,
        val category: String? = null,
        val technical: String? = null,
        val keywords: List<String> = emptyList()
    )

    fun understandQuery(query: String): SearchIntent {
        val tokens = query.lowercase(Locale.getDefault())
            .replace(Regex("[^a-z0-9\\u0900-\\u097F\\s]"), "") // Keep Hindi chars
            .split("\\s+".toRegex())
            .filter { it.isNotBlank() && !STOP_WORDS.contains(it) }

        var detectedCrop: String? = null
        var detectedProblem: String? = null
        var detectedCategory: String? = null
        
        val expandedKeywords = mutableListOf<String>()

        tokens.forEach { token ->
            expandedKeywords.add(token)
            
            // Map Synonyms
            SYNONYMS[token]?.let { expandedKeywords.addAll(it) }

            // Detect Intent (Simplified)
            when {
                isCrop(token) -> detectedCrop = mapToCanonicalCrop(token)
                isProblem(token) -> detectedProblem = mapToCanonicalProblem(token)
                isCategory(token) -> detectedCategory = mapToCanonicalCategory(token)
            }
        }

        return SearchIntent(
            crop = detectedCrop,
            problem = detectedProblem,
            category = detectedCategory,
            keywords = expandedKeywords.distinct()
        )
    }

    private fun isCrop(token: String): Boolean = 
        setOf("dhan", "rice", "paddy", "धान", "gehun", "wheat", "गेहूं", "makka", "maize", "मक्का", "alu", "potato", "आलू").contains(token)

    private fun isProblem(token: String): Boolean =
        setOf("keeda", "pest", "कीड़ा", "bimari", "disease", "खरपतवार", "weed").contains(token)

    private fun isCategory(token: String): Boolean =
        setOf("khad", "fertilizer", "खाद", "dawa", "insecticide", "pesticide", "fungicide").contains(token)

    private fun mapToCanonicalCrop(token: String): String = when(token) {
        "dhan", " धान", "paddy" -> "Rice"
        "gehun", "गेहूं" -> "Wheat"
        "makka", "मक्का", "corn" -> "Maize"
        "alu", "आलू" -> "Potato"
        else -> token.replaceFirstChar { it.uppercase() }
    }

    private fun mapToCanonicalProblem(token: String): String = when(token) {
        "keeda", "कीड़ा" -> "Pest"
        "bimari", "disease" -> "Disease"
        "खरपतवार", "weed" -> "Weed"
        else -> token.replaceFirstChar { it.uppercase() }
    }

    private fun mapToCanonicalCategory(token: String): String = when(token) {
        "khad", "खाद" -> "Fertilizer"
        "dawa", "दवा" -> "Pesticide"
        else -> token.replaceFirstChar { it.uppercase() }
    }
}
