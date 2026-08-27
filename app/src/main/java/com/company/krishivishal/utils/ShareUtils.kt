package com.company.krishivishal.utils

import android.content.Context
import android.content.Intent
import com.company.krishivishal.core.model.Product

import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

object ShareUtils {
    fun saveTextToFile(context: Context, fileName: String, content: String): Uri? {
        return try {
            val file = File(context.cacheDir, fileName)
            val outputStream = FileOutputStream(file)
            outputStream.write(content.toByteArray())
            outputStream.close()
            FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        } catch (e: Exception) {
            null
        }
    }

    fun shareFile(context: Context, uri: Uri, mimeType: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Share Exported File"))
    }
    fun shareProduct(context: Context, product: Product) {
        val shareMessage = """
            🌾 *Krishi Vishal - Farmer's Choice* 🌾
            
            Check out this high-quality product:
            *Product:* ${product.name}
            *Brand:* ${product.brand}
            *Price:* ₹${product.price.toInt()}
            
            Download Krishi Vishal App for more exciting deals!
            🔗 https://play.google.com/store/apps/details?id=${context.packageName}
        """.trimIndent()

        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Check out ${product.name}")
            putExtra(Intent.EXTRA_TEXT, shareMessage)
        }

        context.startActivity(Intent.createChooser(intent, "Share via"))
    }

    fun shareApp(context: Context) {
        val shareMessage = """
            🌾 *Krishi Vishal - Krishi Mitra* 🌾
            
            Get all your agricultural needs at one place! 
            Seeds, Pesticides, Fertilizers and more at best prices.
            
            Download the app now:
            🔗 https://play.google.com/store/apps/details?id=${context.packageName}
            
            Grow more, Grow better! 🚜🌱
        """.trimIndent()

        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Download Krishi Vishal App")
            putExtra(Intent.EXTRA_TEXT, shareMessage)
        }

        context.startActivity(Intent.createChooser(intent, "Share Krishi Vishal via"))
    }
}
