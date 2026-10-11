package com.company.krishivishaldelivery.ui.attendance

import android.Manifest
import android.content.pm.PackageManager
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishaldelivery.data.model.AttendanceRecord
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AttendanceScreen(
    onNavigateBack: () -> Unit,
    viewModel: AttendanceViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val todayRecord by viewModel.todayAttendance.collectAsState()
    val history by viewModel.attendanceHistory.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()

    // Permission launcher
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                      permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) {
            viewModel.startShift()
        } else {
            viewModel.onPermissionDenied()
        }
    }

    // Helper function
    fun checkAndStartShift() {
        val fineGranted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        val coarseGranted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        if (fineGranted || coarseGranted) {
            viewModel.startShift()
        } else {
            locationPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        }
    }

    LaunchedEffect(errorMessage) {
        errorMessage?.let {
            Toast.makeText(context, it, Toast.LENGTH_LONG).show()
            viewModel.clearError()
        }
    }

    val todayFormatted = remember {
        SimpleDateFormat("EEEE, dd MMMM yyyy", Locale.getDefault()).format(Date())
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("उपस्थिति व शिफ्ट (Attendance)", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF2E7D32),
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // ── Today's Date Header Card ──
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F8E9)),
                    border = BorderStroke(1.dp, Color(0xFFC8E6C9))
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFF2E7D32),
                            modifier = Modifier.size(42.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.CalendarToday,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(22.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text("आज की तारीख (Today)", fontSize = 12.sp, color = Color.Gray)
                            Text(todayFormatted, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color(0xFF1B5E20))
                        }
                    }
                }
            }

            // ── Main Shift Action Card ──
            item {
                val status = todayRecord?.status?.uppercase() ?: "NOT_STARTED"
                val isActive = status == "ACTIVE"
                val isCompleted = status == "COMPLETED"

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = when {
                            isActive -> Color(0xFFFFFBEB)
                            isCompleted -> Color(0xFFF0FDF4)
                            else -> Color.White
                        }
                    ),
                    elevation = CardDefaults.cardElevation(3.dp),
                    border = BorderStroke(
                        1.5.dp,
                        when {
                            isActive -> Color(0xFFF59E0B)
                            isCompleted -> Color(0xFF22C55E)
                            else -> Color(0xFFE5E7EB)
                        }
                    )
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        when {
                            // 1. ACTIVE SHIFT WITH LIVE DURATION TIMER
                            isActive -> {
                                val startTime = todayRecord?.shiftStart?.toDate()
                                val timeFormat = remember { SimpleDateFormat("hh:mm a", Locale.getDefault()) }
                                val startTimeStr = startTime?.let { timeFormat.format(it) } ?: "Just started"

                                // Live Timer Tick
                                var elapsedSeconds by remember { mutableLongStateOf(0L) }
                                LaunchedEffect(startTime) {
                                    val startMs = startTime?.time ?: System.currentTimeMillis()
                                    while (true) {
                                        elapsedSeconds = (System.currentTimeMillis() - startMs) / 1000
                                        delay(1000)
                                    }
                                }

                                val hours = elapsedSeconds / 3600
                                val minutes = (elapsedSeconds % 3600) / 60
                                val seconds = elapsedSeconds % 60
                                val timerStr = String.format(Locale.getDefault(), "%02d:%02d:%02d", hours, minutes, seconds)

                                Surface(
                                    color = Color(0xFFFEF3C7),
                                    shape = RoundedCornerShape(20.dp),
                                    modifier = Modifier.padding(bottom = 12.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(8.dp)
                                                .background(Color(0xFFD97706), CircleShape)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("शिफ्ट चालू है (Shift Active)", color = Color(0xFFB45309), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                    }
                                }

                                Text(
                                    text = timerStr,
                                    fontSize = 42.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color(0xFFB45309)
                                )
                                Text("Shift Duration (HH:MM:SS)", fontSize = 12.sp, color = Color.Gray)

                                Spacer(modifier = Modifier.height(16.dp))
                                HorizontalDivider(thickness = 0.5.dp, color = Color(0xFFFDE68A))
                                Spacer(modifier = Modifier.height(12.dp))

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceAround
                                ) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text("शुरू समय (Started At)", fontSize = 11.sp, color = Color.Gray)
                                        Text(startTimeStr, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                    }
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text("GPS स्थिति (Status)", fontSize = 11.sp, color = Color.Gray)
                                        Text("✓ Geotagged", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color(0xFF2E7D32))
                                    }
                                }

                                Spacer(modifier = Modifier.height(20.dp))

                                Button(
                                    onClick = { viewModel.endShift() },
                                    enabled = !isLoading,
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(50.dp)
                                ) {
                                    if (isLoading) {
                                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(22.dp))
                                    } else {
                                        Icon(Icons.Default.Stop, contentDescription = null)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("⏹ शिफ्ट समाप्त करें (End Shift)", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                    }
                                }
                            }

                            // 2. COMPLETED SHIFT FOR TODAY
                            isCompleted -> {
                                val timeFormat = remember { SimpleDateFormat("hh:mm a", Locale.getDefault()) }
                                val startStr = todayRecord?.shiftStart?.toDate()?.let { timeFormat.format(it) } ?: "-"
                                val endStr = todayRecord?.shiftEnd?.toDate()?.let { timeFormat.format(it) } ?: "-"

                                Icon(
                                    imageVector = Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = Color(0xFF16A34A),
                                    modifier = Modifier.size(54.dp)
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    "आज की शिफ्ट पूरी हुई! (Shift Completed)",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp,
                                    color = Color(0xFF16A34A)
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    "कुल काम: ${todayRecord?.totalHours ?: 0.0} घंटे (${startStr} से ${endStr})",
                                    fontSize = 13.sp,
                                    color = Color.DarkGray
                                )
                            }

                            // 3. NOT STARTED YET
                            else -> {
                                Icon(
                                    imageVector = Icons.Default.Timer,
                                    contentDescription = null,
                                    tint = Color(0xFF2E7D32),
                                    modifier = Modifier.size(54.dp)
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("दैनिक उपस्थिति चेक-इन", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                                Text("डिलिवरी शुरू करने से पहले शिफ्ट शुरू करें", fontSize = 13.sp, color = Color.Gray)

                                Spacer(modifier = Modifier.height(20.dp))

                                Button(
                                    onClick = { checkAndStartShift() },
                                    enabled = !isLoading,
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(52.dp)
                                ) {
                                    if (isLoading) {
                                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(22.dp))
                                    } else {
                                        Icon(Icons.Default.PlayArrow, contentDescription = null)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("▶ शिफ्ट शुरू करें (Start Shift)", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ── Last 7 Days Attendance History Section ──
            item {
                Spacer(modifier = Modifier.height(8.dp))
                Text("पिछली उपस्थिति (Last 7 Days History)", fontWeight = FontWeight.Bold, fontSize = 17.sp)
            }

            if (history.isEmpty()) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFF9FAFB)),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Box(modifier = Modifier.padding(24.dp).fillMaxWidth(), contentAlignment = Alignment.Center) {
                            Text("No past attendance records found.", color = Color.Gray, fontSize = 13.sp)
                        }
                    }
                }
            } else {
                items(history) { record ->
                    AttendanceHistoryRow(record)
                }
            }
        }
    }
}

@Composable
fun AttendanceHistoryRow(record: AttendanceRecord) {
    val timeFormat = remember { SimpleDateFormat("hh:mm a", Locale.getDefault()) }
    val startStr = record.shiftStart?.toDate()?.let { timeFormat.format(it) } ?: "--:--"
    val endStr = record.shiftEnd?.toDate()?.let { timeFormat.format(it) } ?: "--:--"

    val (badgeBg, badgeText, badgeColor) = when (record.status.uppercase()) {
        "COMPLETED" -> Triple(Color(0xFFDCFCE7), "COMPLETED", Color(0xFF16A34A))
        "ACTIVE" -> Triple(Color(0xFFFEF3C7), "ACTIVE", Color(0xFFD97706))
        else -> Triple(Color(0xFFF3F4F6), "NOT STARTED", Color(0xFF6B7280))
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(1.5.dp),
        border = BorderStroke(0.5.dp, Color(0xFFE5E7EB))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = record.date,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "$startStr → $endStr",
                    fontSize = 12.sp,
                    color = Color.DarkGray
                )
            }

            Column(horizontalAlignment = Alignment.End) {
                Surface(
                    color = badgeBg,
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        text = badgeText,
                        color = badgeColor,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "${record.totalHours} hrs",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFF1E3A8A)
                )
            }
        }
    }
}
