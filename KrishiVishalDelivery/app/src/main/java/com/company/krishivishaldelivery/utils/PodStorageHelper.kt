package com.company.krishivishaldelivery.utils

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import timber.log.Timber
import java.io.File
import java.io.FileOutputStream

object PodStorageHelper {

    private const val POD_DIR = "pod_cache"
    private const val MAX_IMAGE_DIMENSION = 1024
    private const val COMPRESSION_QUALITY = 80

    private fun getPodDirectory(context: Context): File {
        val dir = File(context.filesDir, POD_DIR)
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir
    }

    /**
     * Resizes and compresses bitmap, saving it to internal storage.
     * Returns absolute path of the saved file or null if failed.
     */
    fun saveCompressedBitmap(
        context: Context,
        bitmap: Bitmap,
        orderId: String,
        prefix: String = "photo"
    ): String? {
        return try {
            val podDir = getPodDirectory(context)
            val file = File(podDir, "${prefix}_${orderId}_${System.currentTimeMillis()}.jpg")

            // Downscale if larger than MAX_IMAGE_DIMENSION
            val scaledBitmap = scaleBitmapIfNeeded(bitmap, MAX_IMAGE_DIMENSION)

            FileOutputStream(file).use { out ->
                scaledBitmap.compress(Bitmap.CompressFormat.JPEG, COMPRESSION_QUALITY, out)
                out.flush()
            }

            if (scaledBitmap != bitmap) {
                scaledBitmap.recycle()
            }

            file.absolutePath
        } catch (e: Exception) {
            Timber.e(e, "Failed to save compressed bitmap for order $orderId")
            null
        }
    }

    fun saveFailurePhotoLocally(context: Context, orderId: String, bitmap: Bitmap): String? {
        return saveCompressedBitmap(context, bitmap, orderId, "failure")
    }

    /**
     * Deletes a local file if it exists.
     */
    fun deleteFileIfExists(path: String?) {
        if (path.isNullOrBlank()) return
        try {
            val file = File(path)
            if (file.exists()) {
                file.delete()
            }
        } catch (e: Exception) {
            Timber.w(e, "Could not delete POD file at path: $path")
        }
    }

    private fun scaleBitmapIfNeeded(bitmap: Bitmap, maxDim: Int): Bitmap {
        val width = bitmap.width
        val height = bitmap.height

        if (width <= maxDim && height <= maxDim) {
            return bitmap
        }

        val scale = if (width > height) {
            maxDim.toFloat() / width
        } else {
            maxDim.toFloat() / height
        }

        val matrix = Matrix().apply {
            postScale(scale, scale)
        }

        return Bitmap.createBitmap(bitmap, 0, 0, width, height, matrix, true)
    }
}
