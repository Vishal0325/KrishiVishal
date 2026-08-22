package com.company.krishivishal.ui.admin

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.company.krishivishal.core.model.BannerItem
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminBannerScreen(
    onBack: () -> Unit,
    viewModel: AdminBannerViewModel = hiltViewModel()
) {
    val bannersRes by viewModel.banners.collectAsState()
    var bannerToEdit by remember { mutableStateOf<BannerItem?>(null) }
    var isAddingNew by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Manage Banners", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { isAddingNew = true }) {
                        Icon(Icons.Default.Add, contentDescription = "Add Banner")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize().background(Color(0xFFF8F9FA))) {
            when (val res = bannersRes) {
                is Resource.Loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = PrimaryGreen)
                is Resource.Success -> {
                    val banners = res.data ?: emptyList()
                    if (banners.isEmpty()) {
                        Text("No banners found", modifier = Modifier.align(Alignment.Center), color = Color.Gray)
                    } else {
                        LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(banners) { banner ->
                                BannerCard(
                                    banner = banner,
                                    onEdit = { bannerToEdit = it },
                                    onDelete = { viewModel.deleteBanner(it.id) }
                                )
                            }
                        }
                    }
                }
                is Resource.Error -> Text("Error: ${res.message}", modifier = Modifier.align(Alignment.Center), color = Color.Red)
                else -> {}
            }
        }

        if (isAddingNew || bannerToEdit != null) {
            BannerDialog(
                banner = bannerToEdit ?: BannerItem(id = UUID.randomUUID().toString()),
                onDismiss = {
                    isAddingNew = false
                    bannerToEdit = null
                },
                onSave = {
                    viewModel.saveBanner(it)
                    isAddingNew = false
                    bannerToEdit = null
                },
                onUpload = { uri, onComplete ->
                    viewModel.uploadBannerImage(bannerToEdit?.id ?: "new", uri) { url ->
                        onComplete(url)
                    }
                }
            )
        }
    }
}

@Composable
fun BannerCard(banner: BannerItem, onEdit: (BannerItem) -> Unit, onDelete: (BannerItem) -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column {
            AsyncImage(
                model = banner.imageUrl,
                contentDescription = null,
                modifier = Modifier.fillMaxWidth().height(150.dp),
                contentScale = ContentScale.Crop
            )
            Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(banner.title, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Text(banner.linkUrl, fontSize = 12.sp, color = Color.Gray)
                }
                IconButton(onClick = { onEdit(banner) }) {
                    Icon(Icons.Default.Edit, null, tint = Color.Gray)
                }
                IconButton(onClick = { onDelete(banner) }) {
                    Icon(Icons.Default.Delete, null, tint = Color.Red.copy(alpha = 0.6f))
                }
            }
        }
    }
}

@Composable
fun BannerDialog(
    banner: BannerItem,
    onDismiss: () -> Unit,
    onSave: (BannerItem) -> Unit,
    onUpload: (Uri, (String) -> Unit) -> Unit
) {
    var titleText by remember { mutableStateOf(banner.title) }
    var imageUrlText by remember { mutableStateOf(banner.imageUrl) }
    var linkUrlText by remember { mutableStateOf(banner.linkUrl) }
    var priorityText by remember { mutableStateOf(banner.priority.toString()) }

    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let {
            onUpload(it) { url ->
                imageUrlText = url
            }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (banner.title.isEmpty()) "Add Banner" else "Edit Banner") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(modifier = Modifier.fillMaxWidth().height(120.dp).clip(RoundedCornerShape(8.dp)).background(Color.LightGray).clickable {
                    launcher.launch("image/*")
                }) {
                    AsyncImage(model = imageUrlText, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    Icon(Icons.Default.AddAPhoto, null, modifier = Modifier.align(Alignment.Center), tint = Color.White)
                }
                OutlinedTextField(value = imageUrlText, onValueChange = { imageUrlText = it }, label = { Text("Image URL") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = titleText, onValueChange = { titleText = it }, label = { Text("Title") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = linkUrlText, onValueChange = { linkUrlText = it }, label = { Text("Link URL (optional)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = priorityText, onValueChange = { priorityText = it }, label = { Text("Priority (1-10)") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(onClick = {
                onSave(banner.copy(
                    title = titleText,
                    imageUrl = imageUrlText,
                    linkUrl = linkUrlText,
                    priority = priorityText.toIntOrNull() ?: 0
                ))
            }) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
