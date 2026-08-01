package com.company.krishivishal.utils

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import java.net.URLEncoder

object SupportUtils {

    fun openWhatsApp(context: Context, number: String, message: String) {
        try {
            val url = "https://api.whatsapp.com/send?phone=$number&text=" + URLEncoder.encode(message, "UTF-8")
            val intent = Intent(Intent.ACTION_VIEW)
            intent.data = Uri.parse(url)
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "WhatsApp not installed", Toast.LENGTH_SHORT).show()
        }
    }

    fun makeCall(context: Context, number: String) {
        try {
            val intent = Intent(Intent.ACTION_DIAL)
            intent.data = Uri.parse("tel:$number")
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Unable to open dialer", Toast.LENGTH_SHORT).show()
        }
    }

    fun openEmail(context: Context, email: String) {
        val intent = Intent(Intent.ACTION_SENDTO)
        intent.data = Uri.parse("mailto:$email")
        intent.putExtra(Intent.EXTRA_SUBJECT, "Support Request - Krishi Vishal")
        try {
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "No email app found", Toast.LENGTH_SHORT).show()
        }
    }
}
