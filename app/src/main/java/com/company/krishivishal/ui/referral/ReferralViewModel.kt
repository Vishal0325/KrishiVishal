package com.company.krishivishal.ui.referral

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.Referral
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.data.repository.ReferralRepository
import com.company.krishivishal.domain.usecase.auth.GetCurrentUserUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ReferralUiState(
    val myReferralCode: String = "",
    val referrals: List<Referral> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null
)

@HiltViewModel
class ReferralViewModel @Inject constructor(
    private val referralRepository: ReferralRepository,
    private val getCurrentUserUseCase: GetCurrentUserUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReferralUiState())
    val uiState: StateFlow<ReferralUiState> = _uiState.asStateFlow()

    init {
        loadReferralData()
    }

    private var observedUid: String? = null

    private fun loadReferralData() {
        viewModelScope.launch {
            getCurrentUserUseCase().collectLatest { user ->
                val uid = user?.id ?: return@collectLatest
                if (observedUid == uid) return@collectLatest
                observedUid = uid

                // Get User Referral Code
                launch {
                    referralRepository.getUserReferralCode(uid).collectLatest { res ->
                        if (res is Resource.Success) {
                            val code = res.data
                            if (!code.isNullOrBlank()) {
                                _uiState.update { it.copy(myReferralCode = code) }
                            }
                        }
                    }
                }

                // Get Referrals list
                launch {
                    referralRepository.getReferrals(uid).collectLatest { res ->
                        when (res) {
                            is Resource.Success -> {
                                _uiState.update { it.copy(referrals = res.data ?: emptyList(), isLoading = false) }
                            }
                            is Resource.Error -> {
                                _uiState.update { it.copy(error = res.message, isLoading = false) }
                            }
                            else -> {}
                        }
                    }
                }
            }
        }
    }
}
