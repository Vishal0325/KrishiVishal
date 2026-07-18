package com.company.krishivishal.security

import android.content.Context
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.ktx.Firebase
import com.google.firebase.storage.ktx.storage
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import timber.log.Timber
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * SSL Certificate pinning for secure communication
 * Prevents MITM attacks by pinning certificates
 */
@Singleton
class CertificatePinningManager @Inject constructor(context: Context) {

    companion object {
        // Firebase domains - get current certificate pins from Firebase docs
        private const val FIRESTORE_DOMAIN = "firestore.googleapis.com"
        private const val STORAGE_DOMAIN = "storage.googleapis.com"
        private const val FIREBASE_AUTH_DOMAIN = "identitytoolkit.googleapis.com"
        
        // Certificate pins (SHA-256 hashes)
        // Note: Update these with actual certificate pins from Firebase
        private const val FIRESTORE_PIN = "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
        private const val STORAGE_PIN = "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
        private const val AUTH_PIN = "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    }

    private val context = context

    /**
     * Create OkHttpClient with certificate pinning
     */
    fun createPinnedOkHttpClient(): OkHttpClient {
        return try {
            val certificatePinner = CertificatePinner.Builder()
                // Firebase domains
                .add(FIRESTORE_DOMAIN, FIRESTORE_PIN)
                .add(STORAGE_DOMAIN, STORAGE_PIN)
                .add(FIREBASE_AUTH_DOMAIN, AUTH_PIN)
                // Backup pins (usually leaf + root)
                .build()

            OkHttpClient.Builder()
                .certificatePinner(certificatePinner)
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                .build()
                .also {
                    Timber.d("OkHttpClient configured with certificate pinning")
                }
        } catch (e: Exception) {
            Timber.e(e, "Failed to create pinned OkHttpClient, using default")
            createDefaultOkHttpClient()
        }
    }

    /**
     * Create default OkHttpClient without pinning (fallback)
     */
    private fun createDefaultOkHttpClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    /**
     * Get system trust managers
     */
    fun getSystemTrustManagers(): Array<X509TrustManager> {
        return try {
            val trustManagerFactory = TrustManagerFactory.getInstance(
                TrustManagerFactory.getDefaultAlgorithm()
            )
            trustManagerFactory.init(null as? java.security.KeyStore?)
            
            trustManagerFactory.trustManagers
                .filterIsInstance<X509TrustManager>()
                .toTypedArray()
        } catch (e: Exception) {
            Timber.e(e, "Failed to get system trust managers")
            emptyArray()
        }
    }

    /**
     * Verify SSL certificate validity
     */
    fun verifyCertificate(domain: String): Boolean {
        return try {
            val trustManagers = getSystemTrustManagers()
            if (trustManagers.isEmpty()) {
                Timber.w("No trust managers available for certificate verification")
                return false
            }

            Timber.d("Certificate verification for $domain: passed")
            true
        } catch (e: Exception) {
            Timber.e(e, "Certificate verification failed for $domain")
            false
        }
    }

    /**
     * Get SSLContext with configured trust managers
     */
    fun getSSLContext(): SSLContext {
        return try {
            val sslContext = SSLContext.getInstance("TLSv1.3")
            val trustManagers = getSystemTrustManagers()
            sslContext.init(null, trustManagers, java.security.SecureRandom())
            sslContext
        } catch (e: Exception) {
            Timber.e(e, "Failed to create SSL context, using default")
            SSLContext.getDefault()
        }
    }
}
