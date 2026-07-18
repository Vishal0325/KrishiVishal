package com.company.krishivishal.utils

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status

import android.os.Build

class SmsReceiver : BroadcastReceiver() {

    private var smsListener: SmsListener? = null

    fun setSmsListener(listener: SmsListener) {
        this.smsListener = listener
    }

    override fun onReceive(context: Context?, intent: Intent?) {
        if (SmsRetriever.SMS_RETRIEVED_ACTION == intent?.action) {
            val extras = intent.extras
            @Suppress("DEPRECATION")
            val status = extras?.get(SmsRetriever.EXTRA_STATUS) as? Status

            if (status != null) {
                when (status.statusCode) {
                    CommonStatusCodes.SUCCESS -> {
                        @Suppress("DEPRECATION")
                        val message = extras?.get(SmsRetriever.EXTRA_SMS_MESSAGE) as? String
                        message?.let { smsListener?.onSmsReceived(it) }
                    }
                    CommonStatusCodes.TIMEOUT -> {
                        smsListener?.onSmsTimeOut()
                    }
                }
            }
        }
    }

    interface SmsListener {
        fun onSmsReceived(message: String)
        fun onSmsTimeOut()
    }
}
