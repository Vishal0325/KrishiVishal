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
}
