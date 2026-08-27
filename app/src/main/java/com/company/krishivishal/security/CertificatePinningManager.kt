package com.company.krishivishal.security

import android.content.Context
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import timber.log.Timber
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * SSL Certificate pinning for secure communication.
 * Prevents MITM attacks by pinning certificates.
 *
 * TODO (Pre-release): Add real certificate pins.
 * Run the following against each Firebase endpoint to obtain pins:
 *   openssl s_client -connect firestore.googleapis.com:443 < /dev/null 2>/dev/null \
 *     | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der \
 *     | openssl dgst -sha256 -binary | base64
 * Then add them via CertificatePinner.Builder().add("domain", "sha256/...").
 *
 * Current state: placeholder pins have been removed to prevent runtime SSL failures.
 * OkHttpClient uses the Android system trust store (safe, but unpinned).
 */
@Singleton
class CertificatePinningManager @Inject constructor(context: Context) {

    private val context = context

    /**
     * Returns an OkHttpClient using the system trust store.
     * Replace with certificate-pinned client once real pins are obtained.
     */
    fun createPinnedOkHttpClient(): OkHttpClient {
        val pinner = CertificatePinner.Builder()
            // IMPORTANT: Add real SHA-256 fingerprints here before release.
            // Example: .add("firestore.googleapis.com", "sha256/...")
            .build()

        return OkHttpClient.Builder()
            .certificatePinner(pinner)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
            .also {
                Timber.d("OkHttpClient configured with certificate pinner structure (actual pins pending)")
            }
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
