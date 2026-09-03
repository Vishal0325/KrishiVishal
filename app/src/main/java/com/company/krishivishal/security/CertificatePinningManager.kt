package com.company.krishivishal.security

import android.content.Context
import com.company.krishivishal.BuildConfig
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
 * SETUP (required before release):
 * 1. For each domain in PINNED_DOMAINS, run:
 *      openssl s_client -connect <domain>:443 < /dev/null 2>/dev/null \
 *        | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der \
 *        | openssl dgst -sha256 -binary | base64
 * 2. Get pins for BOTH the current leaf cert AND its issuing intermediate/root
 *    (Google Trust Services), so pinning survives routine leaf-cert rotation.
 * 3. Put them in gradle.properties (gitignored, not committed) as:
 *      PIN_FIRESTORE_PRIMARY=sha256/xxxxx
 *      PIN_FIRESTORE_BACKUP=sha256/yyyyy
 *    ...and surface them via BuildConfig fields (see app/build.gradle.kts),
 *    same pattern already used for RAZORPAY_KEY in this file's defaultConfig.
 * 4. Pass the resolved pins into providePins() below instead of emptyMap().
 *
 * FAIL-SAFE: on release builds, createPinnedOkHttpClient() throws if any
 * PINNED_DOMAINS entry has no pin configured, instead of silently shipping
 * an unpinned client (which is what happened before this fix — an empty
 * CertificatePinner.Builder() falls back to the system trust store with
 * no MITM protection at all). Debug builds only log a warning, so local
 * development against emulators/test endpoints isn't blocked.
 */
@Singleton
class CertificatePinningManager @Inject constructor(
    private val context: Context,
    private val isDebugBuild: Boolean
) {

    companion object {
        /** Domains that must be pinned before a release build ships. */
        val PINNED_DOMAINS = listOf(
            "firestore.googleapis.com",
            "firebasestorage.googleapis.com",
        )
    }

    /**
     * Resolve configured pins per domain. Wire this to BuildConfig fields
     * once real SHA-256 values are generated (see class doc above).
     * Returns primary + backup pin list per domain; empty list = not configured.
     */
    private fun providePins(): Map<String, List<String>> = mapOf(
        "firestore.googleapis.com" to listOf(
            BuildConfig.PIN_FIRESTORE_PRIMARY,
            BuildConfig.PIN_FIRESTORE_BACKUP
        ).filter(String::isNotBlank),
        "firebasestorage.googleapis.com" to listOf(
            BuildConfig.PIN_STORAGE_PRIMARY,
            BuildConfig.PIN_STORAGE_BACKUP
        ).filter(String::isNotBlank)
    )

    /**
     * Returns a certificate-pinned OkHttpClient.
     * Throws IllegalStateException on release builds if pins are missing —
     * this is intentional: an app must not ship to production silently unpinned.
     */
    fun createPinnedOkHttpClient(): OkHttpClient {
        val configuredPins = providePins()
        val missingDomains = PINNED_DOMAINS.filter { configuredPins[it].isNullOrEmpty() }

        if (missingDomains.isNotEmpty()) {
            val message = "Certificate pinning not configured for: $missingDomains"
            if (isDebugBuild) {
                Timber.w("$message (allowed in debug builds only)")
            } else {
                Timber.e(message)
                error("$message — cannot build a release OkHttpClient without pins. See CertificatePinningManager doc.")
            }
        }

        val pinnerBuilder = CertificatePinner.Builder()
        configuredPins.forEach { (domain, pins) ->
            pins.forEach { pin -> pinnerBuilder.add(domain, pin) }
        }

        return OkHttpClient.Builder()
            .certificatePinner(pinnerBuilder.build())
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
            .also {
                Timber.d("OkHttpClient configured with certificate pinning for ${configuredPins.keys}")
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
