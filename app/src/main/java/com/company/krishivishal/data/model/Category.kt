package com.company.krishivishal.data.model

import android.os.Parcelable
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.firebase.firestore.IgnoreExtraProperties
import kotlinx.parcelize.Parcelize

@IgnoreExtraProperties
@Parcelize
@Entity(tableName = "categories")
data class Category(
    @PrimaryKey val id: String = "",
    val name: String = "",
    val imageUrl: String = "",
    val subCategories: List<SubCategory> = emptyList()
) : Parcelable

@Parcelize
data class SubCategory(
    val id: String = "",
    val name: String = "",
    val imageUrl: String = ""
) : Parcelable
