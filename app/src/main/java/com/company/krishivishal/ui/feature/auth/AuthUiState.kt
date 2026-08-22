package com.company.krishivishal.ui.feature.auth

/**
 * UI State for the Authentication screen.
 */
data class AuthUiState(
    val phoneNumber: String = "",
    val otp: String = "",
    val isOtpSent: Boolean = false,
    val isLoading: Boolean = false,
    val error: String? = null,
    val resendTimer: Int = 0,
    val isResendEnabled: Boolean = false
)

/**
 * One-time UI events for the Authentication flow.
 */
sealed class AuthUiEvent {
    data class ShowSnackbar(val message: String) : AuthUiEvent()
    object LoginSuccess : AuthUiEvent()
    object OtpSent : AuthUiEvent()
}
