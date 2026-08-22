package com.company.krishivishaldelivery.service

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.company.krishivishaldelivery.R
import com.company.krishivishaldelivery.data.repository.DeliveryRepository
import com.google.android.gms.location.*
import com.google.firebase.auth.FirebaseAuth
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class RiderLocationService : Service() {

    @Inject
    lateinit var repository: DeliveryRepository

    @Inject
    lateinit var auth: FirebaseAuth

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback

    companion object {
        private const val CHANNEL_ID = "rider_location_channel"
        private const val NOTIFICATION_ID = 12345
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        const val ACTION_IN_TRANSIT = "ACTION_IN_TRANSIT"
        const val ACTION_AT_DELIVERY = "ACTION_AT_DELIVERY"
    }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                locationResult.lastLocation?.let { location ->
                    updateLocation(location)
                }
            }
        }
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startForegroundService(Priority.PRIORITY_HIGH_ACCURACY, 15000) // Initial start
            ACTION_IN_TRANSIT -> startForegroundService(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 45000)
            ACTION_AT_DELIVERY -> startForegroundService(Priority.PRIORITY_LOW_POWER, 120000)
            ACTION_STOP -> stopSelf()
        }
        return START_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun startForegroundService(priority: Int, interval: Long) {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Delivery Mode Active")
            .setContentText("Your location is being shared for active deliveries")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        startForeground(NOTIFICATION_ID, notification)

        // Remove previous updates before re-applying with new context
        fusedLocationClient.removeLocationUpdates(locationCallback)

        val locationRequest = LocationRequest.Builder(priority, interval)
            .setMinUpdateIntervalMillis(interval / 2)
            .setMaxUpdateDelayMillis(interval * 2)
            .build()

        fusedLocationClient.requestLocationUpdates(
            locationRequest,
            locationCallback,
            Looper.getMainLooper()
        )
        
        updateRiderStatus(true)
    }

    private fun updateLocation(location: Location) {
        val riderId = auth.currentUser?.uid ?: return
        serviceScope.launch {
            repository.updateRiderLocation(riderId, location.latitude, location.longitude)
        }
    }

    private fun updateRiderStatus(isOnline: Boolean) {
        val riderId = auth.currentUser?.uid ?: return
        serviceScope.launch {
            repository.updateRiderStatus(riderId, isOnline)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Rider Location Channel",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        fusedLocationClient.removeLocationUpdates(locationCallback)
        updateRiderStatus(false)
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
