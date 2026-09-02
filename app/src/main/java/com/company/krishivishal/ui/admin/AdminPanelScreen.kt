package com.company.krishivishal.ui.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsBike
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.domain.usecase.admin.AdminStats
import java.text.SimpleDateFormat
import java.util.Locale

import com.company.krishivishal.ui.admin.components.BarChart
import com.company.krishivishal.ui.admin.components.PieChart

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AdminPanelScreen(
    onBack: () -> Unit,
    onManageCategories: () -> Unit,
    onManageBrands: () -> Unit,
    onManageCrops: () -> Unit,
    onManageProducts: () -> Unit,
    onManageOrders: () -> Unit,
    onManageUsers: (String) -> Unit, // CUSTOMER, SELLER, RIDER
    onManageCoupons: () -> Unit,
    onManageBanners: () -> Unit,
    onSettings: () -> Unit,
    viewModel: AdminPanelViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Dashboard", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.loadDashboard() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // Stats Overview
            StatsOverviewSection(uiState.stats)

            // Visual Analytics
            if (uiState.stats is Resource.Success) {
                val stats = (uiState.stats as? Resource.Success)?.data
                if (stats != null) {
                    Text("Sales Trends", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Card(
                        modifier = Modifier.fillMaxWidth().height(250.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Revenue (Daily)", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.height(16.dp))
                            BarChart(
                                data = stats.revenueByDay,
                                modifier = Modifier.fillMaxSize().padding(bottom = 20.dp)
                            )
                        }
                    }

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Card(
                            modifier = Modifier.weight(1f).height(200.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                        ) {
                            Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("Orders", style = MaterialTheme.typography.labelMedium)
                                PieChart(data = stats.ordersByStatus, modifier = Modifier.size(100.dp).padding(top = 16.dp))
                            }
                        }
                        Card(
                            modifier = Modifier.weight(1f).height(200.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                        ) {
                            Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("Categories", style = MaterialTheme.typography.labelMedium)
                                PieChart(data = stats.topCategories, modifier = Modifier.size(100.dp).padding(top = 16.dp))
                            }
                        }
                    }
                }
            }

            Text("Management Hub", fontWeight = FontWeight.Bold, fontSize = 18.sp)

            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                maxItemsInEachRow = 2
            ) {
                val itemModifier = Modifier.weight(1f)
                AdminGridItem(
                    title = "Products",
                    icon = Icons.Default.Inventory,
                    color = Color(0xFF4CAF50),
                    onClick = onManageProducts,
                    modifier = itemModifier
                )
                AdminGridItem(
                    title = "Orders",
                    icon = Icons.Default.ShoppingCart,
                    color = Color(0xFF2196F3),
                    onClick = onManageOrders,
                    modifier = itemModifier
                )
            }

            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                maxItemsInEachRow = 3
            ) {
                val itemModifier = Modifier.weight(1f)
                AdminGridItem(
                    title = "Categories",
                    icon = Icons.Default.Category,
                    color = Color(0xFFFF9800),
                    onClick = onManageCategories,
                    modifier = itemModifier
                )
                AdminGridItem(
                    title = "Brands",
                    icon = Icons.Default.BrandingWatermark,
                    color = Color(0xFFE91E63),
                    onClick = onManageBrands,
                    modifier = itemModifier
                )
                AdminGridItem(
                    title = "Crops",
                    icon = Icons.Default.Eco,
                    color = Color(0xFF8BC34A),
                    onClick = onManageCrops,
                    modifier = itemModifier
                )
            }

            Text("Users & Marketing", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = MaterialTheme.colorScheme.onBackground)
            
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AdminMenuItem(
                    title = "Customers",
                    subtitle = "Manage app users and tiers",
                    icon = Icons.Default.People,
                    primaryColor = Color(0xFF673AB7),
                    onClick = { onManageUsers("CUSTOMER") }
                )
                AdminMenuItem(
                    title = "Sellers",
                    subtitle = "Manage verified sellers",
                    icon = Icons.Default.Storefront,
                    primaryColor = Color(0xFF009688),
                    onClick = { onManageUsers("SELLER") }
                )
                AdminMenuItem(
                    title = "Riders",
                    subtitle = "Manage delivery partners",
                    icon = Icons.AutoMirrored.Filled.DirectionsBike,
                    primaryColor = Color(0xFF795548),
                    onClick = { onManageUsers("RIDER") }
                )
                AdminMenuItem(
                    title = "Coupons",
                    subtitle = "Offers and discounts",
                    icon = Icons.Default.LocalOffer,
                    primaryColor = Color(0xFFFF5722),
                    onClick = onManageCoupons
                )
                AdminMenuItem(
                    title = "Banners",
                    subtitle = "Home screen promo banners",
                    icon = Icons.Default.Image,
                    primaryColor = Color(0xFF3F51B5),
                    onClick = onManageBanners
                )
            }

            Text("Recent Activity", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = MaterialTheme.colorScheme.onBackground)
            RecentActivitySection(uiState.recentLogs)

            Spacer(modifier = Modifier.height(16.dp))
            AdminMenuItem(
                title = "App Settings",
                subtitle = "Support and Configuration",
                icon = Icons.Default.Settings,
                primaryColor = Color.Gray,
                onClick = onSettings
            )
            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@Composable
fun StatsOverviewSection(statsRes: Resource<AdminStats>) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Dashboard Overview", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.height(16.dp))
            
            when (statsRes) {
                is Resource.Loading -> {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth(), color = PrimaryGreen)
                }
                is Resource.Success -> {
                    val stats = statsRes.data
                    if (stats != null) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            StatItem("Revenue", "₹${stats.totalRevenue.toInt()}", Color(0xFF2E7D32))
                            StatItem("Orders", "${stats.totalOrders}", Color(0xFF1565C0))
                            StatItem("Products", "${stats.totalProducts}", Color(0xFFEF6C00))
                        }
                    }
                }
                is Resource.Error -> {
                    Text("Failed to load stats", color = Color.Red, fontSize = 12.sp)
                }
                else -> {}
            }
        }
    }
}

@Composable
fun StatItem(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = value, fontWeight = FontWeight.Black, fontSize = 20.sp, color = color)
        Text(text = label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun AdminGridItem(
    title: String,
    icon: ImageVector,
    color: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.clickable { onClick() },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Surface(
                modifier = Modifier.size(40.dp),
                shape = CircleShape,
                color = color.copy(alpha = 0.1f)
            ) {
                Icon(imageVector = icon, contentDescription = null, modifier = Modifier.padding(10.dp), tint = color)
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = title, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
    }
}

@Composable
fun RecentActivitySection(logsRes: Resource<List<com.company.krishivishal.core.model.AdminLog>>) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            when (logsRes) {
                is Resource.Loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally).size(24.dp))
                is Resource.Success -> {
                    val logs = logsRes.data ?: emptyList()
                    if (logs.isEmpty()) {
                        Text("No recent activity", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        logs.take(5).forEach { log ->
                            Row(modifier = Modifier.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Box(modifier = Modifier.size(8.dp).background(PrimaryGreen, CircleShape))
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    val time = remember(log.timestamp) {
                                        SimpleDateFormat("hh:mm a", Locale.getDefault()).format(log.timestamp.toDate())
                                    }
                                    Text(text = log.action, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                                    Text(text = "${log.adminName} • $time", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
                else -> {}
            }
        }
    }
}

@Composable
fun AdminMenuItem(
    title: String,
    subtitle: String,
    icon: ImageVector,
    primaryColor: Color,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                modifier = Modifier.size(48.dp),
                shape = RoundedCornerShape(12.dp),
                color = primaryColor.copy(alpha = 0.1f)
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.padding(12.dp),
                    tint = primaryColor
                )
            }
            
            Spacer(modifier = Modifier.width(16.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Text(text = title, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Text(text = subtitle, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            
            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.outline
            )
        }
    }
}
