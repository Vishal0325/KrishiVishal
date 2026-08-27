package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.UserDao
import com.company.krishivishal.core.model.User
import com.company.krishivishal.core.util.Resource
import com.google.firebase.auth.AuthCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton
import com.company.krishivishal.utils.safeCall
import com.company.krishivishal.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import android.app.Activity
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.firebase.auth.PhoneAuthCredential
import com.company.krishivishal.performance.SmsResilienceManager

interface AuthRepository {
    fun getCurrentUser(): Flow<User?>
    suspend fun signInAnonymously(): Resource<User>
    fun login(email: String, password: String): Flow<Resource<User>>
    fun register(name: String, email: String, password: String): Flow<Resource<User>>
    fun signInWithCredential(credential: AuthCredential): Flow<Resource<User>>
    suspend fun logout()
    fun startPhoneVerification(phoneNumber: String, activity: Activity, callbacks: PhoneAuthProvider.OnVerificationStateChangedCallbacks)
    fun updateUser(user: User): Flow<Resource<Unit>>
    fun mergeGuestWishlistToFirestore(userId: String): Flow<Resource<Unit>>
    fun deleteAccount(): Flow<Resource<Unit>>
}

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore,
    private val userDao: UserDao,
    private val wishlistDao: com.company.krishivishal.data.local.WishlistDao,
    private val smsResilienceManager: SmsResilienceManager,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) : AuthRepository {

    override fun getCurrentUser(): Flow<User?> = callbackFlow {
        // Use an auth state listener so the flow stays alive and reacts to login/logout
        val authListener = com.google.firebase.auth.FirebaseAuth.AuthStateListener { firebaseAuth ->
            val firebaseUser = firebaseAuth.currentUser
            if (firebaseUser == null) {
                trySend(null)
                return@AuthStateListener
            }

            // Emit local user data immediately for fast UI
            launch {
                userDao.getUserById(firebaseUser.uid).collect { user ->
                    if (user != null) trySend(user)
                }
            }

            // Sync from Firestore in the background
            launch {
                try {
                    val userDoc = firestore.collection("users").document(firebaseUser.uid).get().await()
                    val user = userDoc.toObject(User::class.java)
                    if (user != null) {
                        val updatedUser = if (user.phone.isNullOrEmpty()) user.copy(phone = firebaseUser.phoneNumber) else user
                        userDao.insertUser(updatedUser)
                        trySend(updatedUser)
                    } else {
                        val newUser = User(
                            id = firebaseUser.uid,
                            name = firebaseUser.displayName ?: "Farmer",
                            email = firebaseUser.email,
                            phone = firebaseUser.phoneNumber
                        )
                        userDao.insertUser(newUser)
                        trySend(newUser)
                        firestore.collection("users").document(firebaseUser.uid).set(newUser)
                    }
                } catch (e: Exception) {
                    userDao.getUserById(firebaseUser.uid).firstOrNull()?.let { trySend(it) }
                }
            }
        }

        auth.addAuthStateListener(authListener)
        awaitClose { auth.removeAuthStateListener(authListener) }
    }

    override suspend fun signInAnonymously(): Resource<User> = withContext(ioDispatcher) {
        try {
            android.util.Log.d("AuthRepo", "Starting anonymous sign in...")
            val result = auth.signInAnonymously().await()
            val firebaseUser = result.user ?: throw Exception("Anonymous sign in failed")
            android.util.Log.d("AuthRepo", "Anonymous sign in SUCCESS: ${firebaseUser.uid}")
            val user = User(id = firebaseUser.uid, name = "Guest User")
            userDao.insertUser(user)
            Resource.Success(user)
        } catch (e: Exception) {
            android.util.Log.e("AuthRepo", "Anonymous sign in ERROR: ${e.message}")
            Resource.Error(e.message ?: "Anonymous Login Error")
        }
    }

    override fun login(email: String, password: String): Flow<Resource<User>> = safeCall(ioDispatcher) {
        val result = auth.signInWithEmailAndPassword(email, password).await()
        val firebaseUser = result.user ?: throw Exception("Login failed")
        
        val userDoc = firestore.collection("users").document(firebaseUser.uid).get().await()
        val user = userDoc.toObject(User::class.java) ?: throw Exception("User data not found")
        
        userDao.insertUser(user)
        user
    }

    override fun register(name: String, email: String, password: String): Flow<Resource<User>> = safeCall(ioDispatcher) {
        val result = auth.createUserWithEmailAndPassword(email, password).await()
        val firebaseUser = result.user ?: throw Exception("Registration failed")
        
        val user = User(
            id = firebaseUser.uid,
            name = name,
            email = email
        )
        
        firestore.collection("users").document(user.id).set(user).await()
        userDao.insertUser(user)
        user
    }

    override suspend fun logout() {
        withContext(ioDispatcher) {
            auth.signOut()
        }
    }

    override fun startPhoneVerification(
        phoneNumber: String,
        activity: Activity,
        callbacks: PhoneAuthProvider.OnVerificationStateChangedCallbacks
    ) {
        if (!smsResilienceManager.canSendSms()) {
            callbacks.onVerificationFailed(com.google.firebase.FirebaseException("SMS quota exceeded. Please try again later."))
            return
        }

        // Start SMS Retriever for Auto-Read
        val client = SmsRetriever.getClient(activity)
        client.startSmsRetriever()
        
        val options = PhoneAuthOptions.newBuilder(auth)
            .setPhoneNumber(phoneNumber)
            .setTimeout(60L, java.util.concurrent.TimeUnit.SECONDS)
            .setActivity(activity)
            .setCallbacks(callbacks)
            .build()
        
        android.util.Log.d("AuthRepo", "Starting SMS verification for: $phoneNumber with SMS Retriever")
        PhoneAuthProvider.verifyPhoneNumber(options)
    }

    override fun signInWithCredential(credential: AuthCredential): Flow<Resource<User>> = safeCall(ioDispatcher) {
        val result = auth.signInWithCredential(credential).await()
        val firebaseUser = result.user ?: throw Exception("Sign in failed")

        android.util.Log.d("AuthRepo", "Credential sign-in succeeded for uid=${firebaseUser.uid}")

        val userDoc = firestore.collection("users").document(firebaseUser.uid).get().await()
        var user = userDoc.toObject(User::class.java)

        if (user == null) {
            // New user via social or phone
            user = User(
                id = firebaseUser.uid,
                name = firebaseUser.displayName ?: "",
                email = firebaseUser.email ?: "",
                phone = firebaseUser.phoneNumber
            )
            android.util.Log.d("AuthRepo", "Creating a missing profile for ${firebaseUser.uid}")
            firestore.collection("users").document(user.id).set(user).await()
        }

        userDao.insertUser(user)
        user
    }

    override fun updateUser(user: User): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        firestore.collection("users").document(user.id).set(user).await()
        userDao.insertUser(user)
    }

    override fun mergeGuestWishlistToFirestore(userId: String): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        val localItems = wishlistDao.getAllGuestItems()
        
        if (localItems.isNotEmpty()) {
            val productIds = localItems.map { it.productId }
            
            // Sync with Firestore using arrayUnion to avoid duplicates
            @Suppress("SpreadOperator")
            firestore.collection("users").document(userId)
                .update("wishlist", com.google.firebase.firestore.FieldValue.arrayUnion(*productIds.toTypedArray()))
                .await()
            
            // Successfully synced, clear local guest wishlist
            wishlistDao.clearGuestWishlist()
        }
        Unit
    }

    override fun deleteAccount(): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        val firebaseUser = auth.currentUser ?: throw Exception("User not logged in")
        val userId = firebaseUser.uid

        // 1. Delete user document from Firestore
        firestore.collection("users").document(userId).delete().await()

        // 2. Delete user from Firebase Auth
        firebaseUser.delete().await()

        // 3. Clear local database
        userDao.deleteUserById(userId)
        
        // 4. Local Sign out just in case
        auth.signOut()
        
        Unit
    }
}
