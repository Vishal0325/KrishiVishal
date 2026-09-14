package com.company.krishivishaldelivery.utils

import android.content.Context
import android.speech.tts.TextToSpeech
import timber.log.Timber
import java.util.Locale

class VoicePromptHelper(context: Context) {
    private var tts: TextToSpeech? = null
    private var isInitialized = false

    init {
        tts = TextToSpeech(context.applicationContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val hindiLocale = Locale("hi", "IN")
                val result = tts?.setLanguage(hindiLocale)
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    Timber.w("VoicePromptHelper: Hindi not supported, falling back to default")
                    tts?.language = Locale.getDefault()
                }
                isInitialized = true
            } else {
                Timber.e("VoicePromptHelper: TTS initialization failed")
            }
        }
    }

    fun speak(text: String) {
        if (!isInitialized) return
        try {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "KV_TTS_ID_${System.currentTimeMillis()}")
        } catch (e: Exception) {
            Timber.e(e, "TTS speak error")
        }
    }

    fun speakTripStarted(stopCount: Int) {
        speak("डिलीवरी ट्रिप शुरू हो गई है। आपके पास आज $stopCount डिलीवरी स्टॉप हैं। कृपया सुरक्षित गति में वाहन चलाएं।")
    }

    fun speakArrivedAtDestination(customerName: String, landmark: String) {
        val landmarkText = if (landmark.isNotBlank()) "पहचान स्थल: $landmark" else ""
        speak("आप $customerName के गाँव पहुँच चुके हैं। $landmarkText")
    }

    fun speakHazardWarning() {
        speak("सावधानी! इस पार्सल में कृषि रसायन और कीटनाशक हैं। कृपया डिब्बे को सीधा रखें।")
    }

    fun shutdown() {
        try {
            tts?.stop()
            tts?.shutdown()
        } catch (e: Exception) {
            Timber.e(e, "TTS shutdown error")
        }
    }
}
