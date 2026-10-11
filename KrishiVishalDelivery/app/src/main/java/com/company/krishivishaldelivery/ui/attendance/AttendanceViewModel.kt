package com.company.krishivishaldelivery.ui.attendance

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishaldelivery.data.model.AttendanceRecord
import com.google.android.gms.location.LocationServices
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import timber.log.Timber
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class AttendanceViewModel @Inject constructor(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore,
    @ApplicationContext private val context: Context
) : ViewModel() {

    private val _todayAttendance = MutableStateFlow<AttendanceRecord?>(null)
    val todayAttendance: StateFlow<AttendanceRecord?> = _todayAttendance.asStateFlow()

    private val _attendanceHistory = MutableStateFlow<List<AttendanceRecord>>(emptyList())
    val attendanceHistory: StateFlow<List<AttendanceRecord>> = _attendanceHistory.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)

    val todayDateString: String
        get() = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())

    init {
        loadAttendanceData()
    }

    fun clearError() {
        _errorMessage.value = null
    }

    fun onPermissionDenied() {
        _errorMessage.value = "Location permission required to start shift. Please allow in Settings."
    }

    private fun loadAttendanceData() {
        val uid = auth.currentUser?.uid ?: return
        val today = todayDateString

        // 1. Real-time listener for today's shift
        firestore.collection("riders").document(uid)
            .collection("attendance").document(today)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    Timber.e(error, "Failed to load today's attendance")
                    return@addSnapshotListener
                }
                if (snapshot != null && snapshot.exists()) {
                    _todayAttendance.value = snapshot.toObject(AttendanceRecord::class.java)
                } else {
                    _todayAttendance.value = null
                }
            }

        // 2. Load last 7 days history
        firestore.collection("riders").document(uid)
            .collection("attendance")
            .orderBy("date", Query.Direction.DESCENDING)
            .limit(7)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    Timber.e(error, "Failed to load attendance history")
                    return@addSnapshotListener
                }
                val records = snapshot?.documents?.mapNotNull { doc ->
                    doc.toObject(AttendanceRecord::class.java)
                } ?: emptyList()
                _attendanceHistory.value = records
            }
    }

    fun startShift() {
        val uid = auth.currentUser?.uid ?: return
        viewModelScope.launch {
            _isLoading.value = true
            try {
                var lat = 0.0
                var lng = 0.0
                try {
                    val location = fusedLocationClient.lastLocation.await()
                    if (location != null) {
                        lat = location.latitude
                        lng = location.longitude
                    }
                } catch (e: Exception) {
                    Timber.w(e, "Could not fetch GPS for startShift")
                }

                val today = todayDateString
                val data = hashMapOf(
                    "date" to today,
                    "shiftStart" to FieldValue.serverTimestamp(),
                    "startLat" to lat,
                    "startLng" to lng,
                    "status" to "ACTIVE"
                )

                firestore.collection("riders").document(uid)
                    .collection("attendance").document(today)
                    .set(data)
                    .await()

                firestore.collection("riders").document(uid)
                    .update(
                        mapOf(
                            "isAvailable" to true,
                            "isOnline" to true,
                            "shiftStartTime" to System.currentTimeMillis()
                        )
                    ).await()

            } catch (e: Exception) {
                Timber.e(e, "Error starting shift")
                _errorMessage.value = "Failed to start shift: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun endShift() {
        val uid = auth.currentUser?.uid ?: return
        val currentRecord = _todayAttendance.value ?: return

        viewModelScope.launch {
            _isLoading.value = true
            try {
                var lat = 0.0
                var lng = 0.0
                try {
                    val location = fusedLocationClient.lastLocation.await()
                    if (location != null) {
                        lat = location.latitude
                        lng = location.longitude
                    }
                } catch (e: Exception) {
                    Timber.w(e, "Could not fetch GPS for endShift")
                }

                val now = System.currentTimeMillis()
                val startTimeMs = currentRecord.shiftStart?.toDate()?.time ?: now
                val totalHours = kotlin.math.max(0.1, (now - startTimeMs) / 3_600_000.0)
                val roundedHours = kotlin.math.round(totalHours * 10) / 10.0

                val today = todayDateString
                val data = mapOf(
                    "shiftEnd" to FieldValue.serverTimestamp(),
                    "endLat" to lat,
                    "endLng" to lng,
                    "totalHours" to roundedHours,
                    "status" to "COMPLETED"
                )

                firestore.collection("riders").document(uid)
                    .collection("attendance").document(today)
                    .update(data)
                    .await()

                firestore.collection("riders").document(uid)
                    .update(
                        mapOf(
                            "isAvailable" to false,
                            "isOnline" to false,
                            "shiftEndTime" to System.currentTimeMillis()
                        )
                    ).await()

            } catch (e: Exception) {
                Timber.e(e, "Error ending shift")
                _errorMessage.value = "Failed to end shift: ${e.message}"
            } finally {
                _isLoading.value = false
            }
        }
    }
}
