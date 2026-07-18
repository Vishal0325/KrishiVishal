# Razorpay Android Integration Guide

To enable real payments in KrishiVishal, follow these steps to integrate the Razorpay Android SDK.

## 1. Add Dependency
Add this to your `app/build.gradle.kts`:
```kotlin
dependencies {
    implementation("com.razorpay:checkout:1.6.38")
}
```

## 2. Update AndroidManifest.xml
Razorpay requires certain metadata:
```xml
<meta-data
    android:name="com.razorpay.ApiKey"
    android:value="YOUR_RAZORPAY_KEY_ID" />
```

## 3. Implement Checkout Logic
In your `PaymentFragment.kt`, initialize and start the Razorpay checkout:

```kotlin
import com.razorpay.Checkout
import com.razorpay.PaymentResultListener
import org.json.JSONObject

class PaymentFragment : Fragment(), PaymentResultListener {

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        Checkout.preload(requireContext())
        // ...
    }

    private fun startPayment(orderId: String, amount: Double) {
        val checkout = Checkout()
        checkout.setKeyID("YOUR_RAZORPAY_KEY_ID")

        try {
            val options = JSONObject()
            options.put("name", "KrishiVishal")
            options.put("description", "Purchase for Order #$orderId")
            options.put("theme.color", "#2E7D32")
            options.put("currency", "INR")
            options.put("amount", (amount * 100).toInt()) // Amount in paise
            
            val notes = JSONObject()
            notes.put("orderId", orderId)
            options.put("notes", notes)

            checkout.open(requireActivity(), options)
        } catch (e: Exception) {
            Toast.makeText(activity, "Error in payment: " + e.message, Toast.LENGTH_LONG).show()
        }
    }

    override fun onPaymentSuccess(razorpayPaymentId: String?) {
        // Log success, wait for Cloud Function webhook to confirm PAID status
        Toast.makeText(context, "Payment Successful", Toast.LENGTH_SHORT).show()
        viewModel.onPaymentSuccess() // Navigate to success screen
    }

    override fun onPaymentError(code: Int, response: String?) {
        Toast.makeText(context, "Payment Failed: $response", Toast.LENGTH_SHORT).show()
    }
}
```

## 4. Production Security
- **Server-side Verification**: Never fulfill an order based solely on `onPaymentSuccess`. Always use the webhook handler in `razorpay_verification.js`.
- **ProGuard**: Ensure your ProGuard rules (already in `proguard-rules.pro`) include Razorpay entries.
