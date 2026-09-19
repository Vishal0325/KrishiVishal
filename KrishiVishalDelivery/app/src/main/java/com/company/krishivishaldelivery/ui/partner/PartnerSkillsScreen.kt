package com.company.krishivishaldelivery.ui.partner

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Agriculture
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Construction
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

data class SkillOption(
    val key: String,
    val title: String,
    val description: String,
    val iconEmoji: String
)

val AGRI_SKILL_OPTIONS = listOf(
    SkillOption("SPRAYING", "Dawa Chhidkaw (Spraying)", "Battery / Manual sprayer operation", "🌾"),
    SkillOption("KODAL_DIGGING", "Kodal / Field Digging Work", "Soil digging, bunding, canal work", "⛏️"),
    SkillOption("CROP_CUTTING", "Fasal Katai (Crop Cutting)", "Harvesting, threshing, manual cutting", "✂️"),
    SkillOption("SOIL_TESTING", "Soil Testing & Sampling", "Soil sample collection & field kit testing", "🧪"),
    SkillOption("DRONE_SPRAY", "Drone Spraying Operation", "Certified drone pilot for spray jobs", "🛸"),
    SkillOption("GENERAL_LABOUR", "General Farm Labour", "Multi-purpose daily farm tasks", "👨‍🌾")
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PartnerSkillsScreen(
    currentSkills: List<String> = emptyList(),
    currentEquipment: List<String> = emptyList(),
    onSaveSkills: (List<String>, List<String>) -> Unit,
    onBack: () -> Unit = {}
) {
    val selectedSkills = remember { mutableStateListOf<String>().apply { addAll(currentSkills) } }
    var equipmentInput by remember { mutableStateOf(currentEquipment.joinToString(", ")) }
    var isSaving by remember { mutableStateOf(false) }

    LaunchedEffect(currentSkills) {
        if (currentSkills.isNotEmpty()) {
            selectedSkills.clear()
            selectedSkills.addAll(currentSkills)
        }
    }

    LaunchedEffect(currentEquipment) {
        if (currentEquipment.isNotEmpty()) {
            equipmentInput = currentEquipment.joinToString(", ")
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My Skills & Services", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Agriculture,
                        contentDescription = null,
                        modifier = Modifier.size(32.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = "Multi-Skill Partner Profile",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Select all tasks you can perform to receive matching job alerts nearby.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Select Your Skills / Work Types",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))

            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(AGRI_SKILL_OPTIONS) { option ->
                    val isChecked = selectedSkills.contains(option.key)

                    Card(
                        onClick = {
                            if (isChecked) {
                                selectedSkills.remove(option.key)
                            } else {
                                selectedSkills.add(option.key)
                            }
                        },
                        colors = CardDefaults.cardColors(
                            containerColor = if (isChecked) MaterialTheme.colorScheme.primaryContainer
                            else MaterialTheme.colorScheme.surfaceVariant
                        ),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(
                                    text = option.iconEmoji,
                                    fontSize = 28.sp,
                                    modifier = Modifier.padding(end = 12.dp)
                                )
                                Column {
                                    Text(
                                        text = option.title,
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        text = option.description,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }

                            Checkbox(
                                checked = isChecked,
                                onCheckedChange = { checked ->
                                    if (checked) selectedSkills.add(option.key)
                                    else selectedSkills.remove(option.key)
                                }
                            )
                        }
                    }
                }

                item {
                    Spacer(modifier = Modifier.height(12.dp))
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Construction, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Equipment / Tools Owned",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            OutlinedTextField(
                                value = equipmentInput,
                                onValueChange = { equipmentInput = it },
                                label = { Text("Tools (Comma separated)") },
                                placeholder = { Text("e.g. Battery Sprayer, Kodal, Cutter Machine") },
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Button(
                onClick = {
                    isSaving = true
                    val eqList = equipmentInput.split(",").map { it.trim() }.filter { it.isNotEmpty() }
                    onSaveSkills(selectedSkills.toList(), eqList)
                    isSaving = false
                },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                enabled = !isSaving
            ) {
                Icon(Icons.Default.Save, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (isSaving) "Saving..." else "SAVE SKILLS & EQUIPMENT",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}
