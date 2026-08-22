package com.company.krishivishal.utils

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status

/**
 * BroadcastReceiver to wait for SMS messages. This can be registered dynamically
 * in the activity or fragment when an OTP is requested.
 */
class SmsReceiver : BroadcastReceiver() {

    private var otpListener: OtpReceivedListener? = null

    fun setOtpListener(receiver: OtpReceivedListener) {
        this.otpListener = receiver
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (SmsRetriever.SMS_RETRIEVED_ACTION == intent.action) {
            val extras = intent.extras
            val status = extras?.get(SmsRetriever.EXTRA_STATUS) as? Status

            when (status?.statusCode) {
                CommonStatusCodes.SUCCESS -> {
                    // Get SMS message contents
                    val message = extras.get(SmsRetriever.EXTRA_SMS_MESSAGE) as? String
                    message?.let {
                        // Extract 6-digit OTP using regex
                        val pattern = Regex("\\d{6}")
                        val match = pattern.find(it)
                        match?.value?.let { otp ->
                            otpListener?.onOtpReceived(otp)
                        }
                    }
                }
                CommonStatusCodes.TIMEOUT -> {
                    otpListener?.onOtpTimeout()
                }
            }
        }
    }

    interface OtpReceivedListener {
        fun onOtpReceived(otp: String)
        fun onOtpTimeout()
    }
}
