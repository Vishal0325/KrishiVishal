package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.UserDao
import com.company.krishivishal.data.model.User
import com.company.krishivishal.utils.Resource
import com.google.firebase.auth.AuthCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
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
import com.google.firebase.auth.PhoneAuthCredential

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
}

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore,
    private val userDao: UserDao,
    private val guestWishlistDao: com.company.krishivishal.data.local.GuestWishlistDao,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) : AuthRepository {

    override fun getCurrentUser(): Flow<User?> = callbackFlow {
        val firebaseUser = auth.currentUser
        if (firebaseUser == null) {
            // No user, but we will handle anonymous sign-in in ViewModel or elsewhere
            trySend(null)
            close()
            return@callbackFlow
        }

        // Emit local data first
        val localJob = launch {
            userDao.getUserById(firebaseUser.uid).collect { user ->
                if (user != null) {
                    trySend(user)
                }
            }
        }

        // Try to sync from Firestore
        launch {
            try {
                val userDoc = firestore.collection("users").document(firebaseUser.uid).get().await()
                val user = userDoc.toObject(User::class.java)
                if (user != null) {
                    userDao.insertUser(user)
                    trySend(user)
                } else if (firebaseUser.isAnonymous) {
                    // Create basic guest profile
                    val guest = User(id = firebaseUser.uid, name = "Guest User")
                    trySend(guest)
                }
            } catch (e: Exception) {
                if (firebaseUser.isAnonymous) {
                    trySend(User(id = firebaseUser.uid, name = "Guest User"))
                }
            }
        }

        awaitClose { localJob.cancel() }
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
        val options = PhoneAuthOptions.newBuilder(auth)
            .setPhoneNumber(phoneNumber)
            .setTimeout(60L, java.util.concurrent.TimeUnit.SECONDS)
            .setActivity(activity)
            .setCallbacks(callbacks)
            .build()
        PhoneAuthProvider.verifyPhoneNumber(options)
    }

    override fun signInWithCredential(credential: AuthCredential): Flow<Resource<User>> = safeCall(ioDispatcher) {
        val result = auth.signInWithCredential(credential).await()
        val firebaseUser = result.user ?: throw Exception("Sign in failed")

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
        val localItems = guestWishlistDao.getAllLocalWishlistItems()
        
        if (localItems.isNotEmpty()) {
            val productIds = localItems.map { it.productId }
            
            // Sync with Firestore using arrayUnion to avoid duplicates
            firestore.collection("users").document(userId)
                .update("wishlist", com.google.firebase.firestore.FieldValue.arrayUnion(*productIds.toTypedArray()))
                .await()
            
            // Successfully synced, clear local guest wishlist
            guestWishlistDao.clearLocalWishlist()
        }
        Unit
    }
}
