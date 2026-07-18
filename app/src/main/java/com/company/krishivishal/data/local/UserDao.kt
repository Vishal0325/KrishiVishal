package com.company.krishivishal.data.local

import androidx.room.*
import com.company.krishivishal.data.model.User
import com.company.krishivishal.data.model.Address
import kotlinx.coroutines.flow.Flow

@Dao
interface UserDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertUser(user: User)

    @Query("SELECT * FROM users WHERE id = :userId")
    fun getUserById(userId: String): Flow<User?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAddress(address: Address)

    @Query("SELECT * FROM addresses WHERE userId = :userId")
    fun getAddressesByUserId(userId: String): Flow<List<Address>>

    @Delete
    suspend fun deleteAddress(address: Address)
}
