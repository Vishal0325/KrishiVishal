package com.company.krishivishaldelivery.ui.partner

import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.company.krishivishaldelivery.ui.dashboard.DashboardViewModel
import kotlinx.coroutines.launch

@Composable
fun JobExecutionScreen(
    bookingId: String,
    jobStatus: String, // ASSIGNED, ON_THE_WAY, IN_PROGRESS
    viewModel: DashboardViewModel,
    onNavigateHome: () -> Unit
) {
    var otp by remember { mutableStateOf("") }
    var actualArea by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var isLoading by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        if (jobStatus == "ON_THE_WAY" || jobStatus == "ASSIGNED") {
            Text("Job En Route / Assigned", style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedTextField(
                value = otp, 
                onValueChange = { otp = it }, 
                label = { Text("Start OTP (Farmer provides this)") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = { 
                    scope.launch {
                        isLoading = true
                        val success = viewModel.verifyStartOtp(bookingId, otp)
                        isLoading = false
                        if (success) {
                            Toast.makeText(context, "Job Started!", Toast.LENGTH_SHORT).show()
                            onNavigateHome() // Will go to dashboard, and active booking will show IN_PROGRESS
                        } else {
                            Toast.makeText(context, "Invalid OTP", Toast.LENGTH_SHORT).show()
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading && otp.length >= 4
            ) { 
                Text(if (isLoading) "Verifying..." else "Verify Start OTP") 
            }
        } else if (jobStatus == "IN_PROGRESS") {
            var attendanceCount by remember { mutableStateOf(1) }
            var isMarkedToday by remember { mutableStateOf(false) }

            Text("Job In Progress", style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(12.dp))

            // Long-term Daily Attendance Card
            Card(
                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        "Long-Term Contract Check-in",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                    )
                    Text(
                        "Log daily attendance for multi-day/weekly/monthly contracts.",
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        "Total Days Checked In: $attendanceCount",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = {
                            if (!isMarkedToday) {
                                attendanceCount++
                                isMarkedToday = true
                            }
                        },
                        enabled = !isMarkedToday,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(if (isMarkedToday) "Today's Attendance Marked ✓" else "Mark Today's Attendance")
                    }
                }
            }

            Text("Job Completion & Final Verification", style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = actualArea, 
                onValueChange = { actualArea = it }, 
                label = { Text("Actual Area (e.g. Acres) / Work Done") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = otp, 
                onValueChange = { otp = it }, 
                label = { Text("End OTP") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = { 
                    val area = actualArea.toDoubleOrNull() ?: 0.0
                    scope.launch {
                        isLoading = true
                        val success = viewModel.completeServiceBooking(bookingId, area, otp)
                        isLoading = false
                        if (success) {
                            Toast.makeText(context, "Job Completed Successfully!", Toast.LENGTH_SHORT).show()
                            onNavigateHome()
                        } else {
                            Toast.makeText(context, "Failed to complete job. Check OTP.", Toast.LENGTH_SHORT).show()
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading && actualArea.isNotEmpty() && otp.length >= 4
            ) { 
                Text(if (isLoading) "Processing..." else "Verify End OTP & Complete Job") 
            }
        }
    }
}
