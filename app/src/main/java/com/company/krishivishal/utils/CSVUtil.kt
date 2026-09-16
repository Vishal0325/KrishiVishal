package com.company.krishivishal.utils

import java.util.*

/**
 * Lightweight CSV Utility for parsing and generating CSV content.
 * Follows RFC 4180 principles (quoted strings, escaped quotes).
 */
object CSVUtil {

    /**
     * Parses a single CSV line into a list of strings.
     */
    fun parseLine(line: String): List<String> {
        val result = mutableListOf<String>()
        var current = StringBuilder()
        var inQuotes = false
        
        var i = 0
        while (i < line.length) {
            val c = line[i]
            if (inQuotes) {
                if (c == '\"') {
                    if (i + 1 < line.length && line[i + 1] == '\"') {
                        current.append('\"') // Escaped quote
                        i++
                    } else {
                        inQuotes = false
                    }
                } else {
                    current.append(c)
                }
            } else {
                if (c == '\"') {
                    inQuotes = true
                } else if (c == ',') {
                    result.add(current.toString().trim())
                    current = StringBuilder()
                } else {
                    current.append(c)
                }
            }
            i++
        }
        result.add(current.toString().trim())
        return result
    }

    /**
     * Generates a CSV row from a list of items.
     */
    fun toCsvRow(items: List<Any?>): String {
        return items.joinToString(",") { item ->
            val str = item?.toString() ?: ""
            if (str.contains(",") || str.contains("\"") || str.contains("\n")) {
                "\"${str.replace("\"", "\"\"")}\""
            } else {
                str
            }
        }
    }

    /**
     * Standardizes weight strings to numeric grams.
     * Examples: "500g" -> 500, "1kg" -> 1000, "250ml" -> 250, "1L" -> 1000, "1.5 kg" -> 1500
     */
    fun parseWeightToGrams(raw: String?): Long? {
        if (raw.isNullOrBlank()) return null
        val clean = raw.trim().lowercase()
        val regex = Regex("""^([\d.]+)\s*(kg|g|gm|gms|l|ltr|litre|litres|ml)?$""")
        val match = regex.find(clean) ?: return clean.toDoubleOrNull()?.toLong()
        val value = match.groupValues[1].toDoubleOrNull() ?: return null
        val unit = match.groupValues.getOrNull(2) ?: "g"
        val grams = when (unit) {
            "kg", "l", "ltr", "litre", "litres" -> value * 1000.0
            else -> value
        }
        return kotlin.math.round(grams).toLong()
    }
}
