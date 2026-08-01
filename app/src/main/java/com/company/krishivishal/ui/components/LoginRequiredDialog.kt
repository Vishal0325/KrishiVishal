package com.company.krishivishal.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.company.krishivishal.ui.theme.PrimaryGreen

@Composable
fun LoginRequiredDialog(
    onDismiss: () -> Unit,
    onLoginClick: () -> Unit,
    title: String = "Login Required",
    message: String = "Please login to save items to your wishlist and synced across devices."
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(16.dp),
        icon = {
            Icon(Icons.Default.Lock, contentDescription = null, tint = PrimaryGreen, modifier = Modifier.size(48.dp))
        },
        title = {
            Text(text = title, fontWeight = FontWeight.Bold, fontSize = 20.sp)
        },
        text = {
            Text(
                text = message,
                fontSize = 14.sp,
                color = Color.Gray,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            Button(
                onClick = {
                    onDismiss()
                    onLoginClick()
                },
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text("Login Now", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Later", color = Color.Gray)
            }
        }
    )
}
