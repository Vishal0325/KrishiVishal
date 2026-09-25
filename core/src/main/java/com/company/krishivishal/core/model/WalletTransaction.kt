package com.company.krishivishal.core.model

import android.os.Parcelable
import com.google.firebase.firestore.IgnoreExtraProperties
import kotlinx.parcelize.Parcelize
import java.util.Date

/**
 * Represents a single wallet transaction for a user.
 * Stored in Firestore: users/{userId}/wallet_history/{txnId}
 *
 * type values:
 *   TOP_UP         - Customer added money via Razorpay
 *   ORDER_PAYMENT  - Wallet used to pay for an order
 *   REFUND_CREDIT  - Refund credited back to wallet
 *   ADMIN_CREDIT   - Admin manually credited (goodwill/correction)
 *   ADMIN_DEBIT    - Admin manually debited
 */
@IgnoreExtraProperties
@Parcelize
data class WalletTransaction(
    val id: String = "",
    val type: String = "",          // TOP_UP | ORDER_PAYMENT | REFUND_CREDIT | ADMIN_CREDIT | ADMIN_DEBIT
    val amount: Double = 0.0,
    val description: String = "",
    val orderId: String? = null,
    val returnId: String? = null,
    val razorpayPaymentId: String? = null,
    val timestamp: Date? = null,
) : Parcelable {

    /**
     * Returns true if this transaction adds money to the wallet (credit).
     */
    val isCredit: Boolean
        get() = type in listOf("TOP_UP", "REFUND_CREDIT", "CREDIT", "ADMIN_CREDIT", "REFERRAL_CREDIT", "REFERRAL_SIGNUP_CREDIT")

    /**
     * Display-friendly transaction type label.
     */
    val typeLabel: String
        get() = when (type) {
            "TOP_UP"         -> "Wallet Recharge"
            "ORDER_PAYMENT"  -> "Order Payment"
            "REFUND_CREDIT"  -> "Refund Credit"
            "CREDIT"         -> "Refund Credit"
            "ADMIN_CREDIT"   -> "Bonus Credit"
            "ADMIN_DEBIT"    -> "Adjustment"
            "REFERRAL_CREDIT" -> "Referral Reward"
            "REFERRAL_SIGNUP_CREDIT" -> "Signup Reward"
            "REFERRAL_REVERSAL" -> "Referral Reversal"
            "REDEEMED_AT_CHECKOUT" -> "Redeemed at Checkout"
            else             -> type
        }
}
