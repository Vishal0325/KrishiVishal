package com.company.krishivishal.utils

import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.util.Base64
import android.util.Log
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.NoSuchAlgorithmException
import java.util.*

/**
 * This is a helper class to generate your message hash to be included in your SMS message.
 *
 * Without the correct hash, your app won't receive the message callback. This only needs to be
 * generated once per app and package name.
 */
class AppSignatureHelper(context: Context) : ContextWrapper(context) {

    /**
     * Get all the app signatures for the current package
     * @return
     */
    val appSignatures: ArrayList<String>
        get() {
            val appCodes = ArrayList<String>()

            try {
                // Get all package signatures for the current package
                val packageName = packageName
                val packageManager = packageManager
                
                val signatures = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                    val packageInfo = packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                    packageInfo.signingInfo?.apkContentsSigners
                } else {
                    @Suppress("DEPRECATION")
                    val packageInfo = packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNATURES)
                    packageInfo.signatures
                }

                // For each signature create a compatible hash
                if (signatures != null) {
                    for (signature in signatures) {
                        val hash = hash(packageName, signature.toCharsString())
                        if (hash != null) {
                            appCodes.add(String.format("%s", hash))
                        }
                    }
                }
            } catch (e: PackageManager.NameNotFoundException) {
                Log.e(TAG, "Unable to find package to obtain hash.", e)
            }

            return appCodes
        }

    private fun hash(packageName: String, signature: String): String? {
        val appInfo = "$packageName $signature"
        try {
            val messageDigest = MessageDigest.getInstance(HASH_TYPE)
            messageDigest.update(appInfo.toByteArray(StandardCharsets.UTF_8))
            var hashSignature = messageDigest.digest()

            // truncated into NUM_HASHED_BYTES
            hashSignature = hashSignature.copyOfRange(0, NUM_HASHED_BYTES)
            // encode into Base64
            var base64Hash = Base64.encodeToString(hashSignature, Base64.NO_PADDING or Base64.NO_WRAP)
            base64Hash = base64Hash.substring(0, NUM_BASE64_CHAR)

            Log.d(TAG, String.format("pkg: %s -- hash: %s", packageName, base64Hash))
            return base64Hash
        } catch (e: NoSuchAlgorithmException) {
            Log.e(TAG, "hash:NoSuchAlgorithm", e)
        }

        return null
    }

    companion object {
        val TAG: String = AppSignatureHelper::class.java.simpleName

        private const val HASH_TYPE = "SHA-256"
        const val NUM_HASHED_BYTES = 9
        const val NUM_BASE64_CHAR = 11
    }
}
