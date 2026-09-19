package com.company.krishivishaldelivery.utils

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import kotlinx.coroutines.*

/**
 * Manages loud alarm sound + vibration for incoming job alerts.
 * 
 * Behavior (like Ola/Uber/Swiggy):
 * - Plays system alarm sound at MAX volume on STREAM_ALARM (bypasses silent mode)
 * - Vibrates with a heavy repeating pattern
 * - Auto-stops after [SIREN_DURATION_MS] milliseconds
 * - Restores original volume on stop
 */
class IncomingJobAlertManager(private val context: Context) {

    companion object {
        private const val TAG = "IncomingJobAlert"
        private const val SIREN_DURATION_MS = 30_000L // 30 seconds
    }

    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var audioManager: AudioManager? = null
    private var originalAlarmVolume: Int = 0
    private var isPlaying = false
    private var autoStopJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    /**
     * Start the loud alarm siren + vibration.
     * Call this when IncomingJobAlertScreen enters composition.
     */
    fun start() {
        if (isPlaying) return
        isPlaying = true

        try {
            startAlarmSound()
            startVibration()
            scheduleAutoStop()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start alert", e)
            // Don't crash the app if alarm fails — screen still works visually
        }
    }

    /**
     * Stop alarm sound and vibration.
     * Call this on Accept/Decline tap or when screen is disposed.
     */
    fun stop() {
        if (!isPlaying) return
        isPlaying = false

        autoStopJob?.cancel()
        autoStopJob = null

        stopAlarmSound()
        stopVibration()
        restoreVolume()
    }

    private fun startAlarmSound() {
        audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val am = audioManager ?: return

        // Request Audio Focus
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val focusRequest = android.media.AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                .build()
            am.requestAudioFocus(focusRequest)
        } else {
            @Suppress("DEPRECATION")
            am.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        }

        // Save original volume and set to max
        originalAlarmVolume = am.getStreamVolume(AudioManager.STREAM_ALARM)
        val maxVolume = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
        am.setStreamVolume(AudioManager.STREAM_ALARM, maxVolume, 0)

        // Get system alarm sound URI
        val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        mediaPlayer = MediaPlayer().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            setDataSource(context, alarmUri)
            isLooping = true
            prepare()
            start()
        }

        Log.d(TAG, "Alarm siren started at max volume ($maxVolume)")
    }

    private fun startVibration() {
        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vibratorManager?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }

        val vib = vibrator ?: return

        // Heavy vibration pattern: wait 0ms, vibrate 500ms, pause 200ms, vibrate 500ms, pause 200ms, vibrate 500ms
        val pattern = longArrayOf(0, 500, 200, 500, 200, 500, 300)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val amplitudes = intArrayOf(0, 255, 0, 255, 0, 255, 0) // Max amplitude
            val effect = VibrationEffect.createWaveform(pattern, amplitudes, 0) // repeat from index 0
            vib.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vib.vibrate(pattern, 0) // repeat from index 0
        }

        Log.d(TAG, "Vibration started with heavy pattern")
    }

    private fun scheduleAutoStop() {
        autoStopJob = scope.launch {
            delay(SIREN_DURATION_MS)
            Log.d(TAG, "Auto-stopping siren after ${SIREN_DURATION_MS / 1000}s")
            stop()
        }
    }

    private fun stopAlarmSound() {
        try {
            mediaPlayer?.let { player ->
                if (player.isPlaying) {
                    player.stop()
                }
                player.release()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping alarm sound", e)
        }
        mediaPlayer = null
        Log.d(TAG, "Alarm sound stopped")
    }

    private fun stopVibration() {
        try {
            vibrator?.cancel()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping vibration", e)
        }
        vibrator = null
        Log.d(TAG, "Vibration stopped")
    }

    private fun restoreVolume() {
        try {
            audioManager?.setStreamVolume(AudioManager.STREAM_ALARM, originalAlarmVolume, 0)
            Log.d(TAG, "Volume restored to $originalAlarmVolume")
        } catch (e: Exception) {
            Log.e(TAG, "Error restoring volume", e)
        }
        audioManager = null
    }
}
