package com.company.krishivishal.utils

import com.company.krishivishal.KrishiVishalApp
import com.company.krishivishal.R
import com.google.firebase.FirebaseException
import com.google.firebase.firestore.FirebaseFirestoreException
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class NetworkErrorHandlerTest {

    private val mockApp = mockk<KrishiVishalApp>()

    @Before
    fun setUp() {
        mockkObject(KrishiVishalApp.Companion)
        every { KrishiVishalApp.instance } returns mockApp

        every { mockApp.getString(R.string.error_no_internet) } returns "No internet connection!"
        every { mockApp.getString(R.string.error_timeout) } returns "Lost contact with the server"
        every { mockApp.getString(R.string.error_db_permission) } returns "No permission to access database"
        every { mockApp.getString(R.string.error_technical) } returns "Technical error"
    }

    @Test
    fun `asFriendlyError should return no internet message on UnknownHostException`() {
        val error = UnknownHostException("Unable to resolve host")
        val result = NetworkErrorHandler.asFriendlyError(error)
        assertEquals("No internet connection!", result)
    }

    @Test
    fun `asFriendlyError should return no internet message on ConnectException`() {
        val error = ConnectException("Connection refused")
        val result = NetworkErrorHandler.asFriendlyError(error)
        assertEquals("No internet connection!", result)
    }

    @Test
    fun `asFriendlyError should return timeout message on SocketTimeoutException`() {
        val error = SocketTimeoutException("Read timed out")
        val result = NetworkErrorHandler.asFriendlyError(error)
        assertEquals("Lost contact with the server", result)
    }

    @Test
    fun `asFriendlyError should return permission message on Firestore PERMISSION_DENIED`() {
        val error = FirebaseFirestoreException("Missing or insufficient permissions", FirebaseFirestoreException.Code.PERMISSION_DENIED)
        val result = NetworkErrorHandler.asFriendlyError(error)
        assertEquals("No permission to access database", result)
    }

    @Test
    fun `asFriendlyError should return custom App Check message on App Check FirebaseException`() {
        val error = FirebaseException("App Check Blocked")
        val result = NetworkErrorHandler.asFriendlyError(error)
        assertEquals("App Check Blocked: Please use a real device.", result)
    }
}
