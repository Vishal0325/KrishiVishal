package com.company.krishivishal.ui.services

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.AgriService
import com.company.krishivishal.core.model.ServiceBooking
import com.company.krishivishal.data.repository.ServiceBookingRepository
import com.company.krishivishal.data.repository.ServiceBookingRepositoryImpl
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

// Not using Hilt here for simplicity, typically would use @HiltViewModel and @Inject
class ServiceViewModel : ViewModel() {
    private val repository: ServiceBookingRepository = ServiceBookingRepositoryImpl()

    private val _services = MutableStateFlow<List<AgriService>>(emptyList())
    val services: StateFlow<List<AgriService>> = _services.asStateFlow()

    private val _selectedService = MutableStateFlow<AgriService?>(null)
    val selectedService: StateFlow<AgriService?> = _selectedService.asStateFlow()

    private val _bookingStatus = MutableStateFlow<ServiceBooking?>(null)
    val bookingStatus: StateFlow<ServiceBooking?> = _bookingStatus.asStateFlow()

    init {
        loadServices()
    }

    private fun loadServices() {
        viewModelScope.launch {
            repository.getAvailableServices().collectLatest { 
                _services.value = it
            }
        }
    }

    fun loadServiceById(serviceId: String) {
        viewModelScope.launch {
            _selectedService.value = repository.getServiceById(serviceId)
        }
    }

    fun bookService(
        farmArea: Double,
        areaUnit: String,
        amount: Double,
        selectedVariantName: String?,
        capacityInfo: String?,
        isLongTermJob: Boolean,
        onSuccess: (String) -> Unit
    ) {
        val service = _selectedService.value ?: return
        val currentUserId = FirebaseAuth.getInstance().currentUser?.uid ?: return
        
        viewModelScope.launch {
            val booking = ServiceBooking(
                farmerId = currentUserId,
                serviceId = service.id,
                serviceName = service.name,
                farmArea = farmArea,
                areaUnit = areaUnit,
                amount = amount,
                selectedVariantName = selectedVariantName,
                capacityInfo = capacityInfo,
                isLongTermJob = isLongTermJob
            )
            val bookingId = repository.createBooking(booking)
            onSuccess(bookingId)
        }
    }

    fun trackBooking(bookingId: String) {
        viewModelScope.launch {
            repository.getBookingStatus(bookingId).collectLatest {
                _bookingStatus.value = it
            }
        }
    }
}
