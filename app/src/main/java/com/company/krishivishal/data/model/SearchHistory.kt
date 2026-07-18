package com.company.krishivishal.data.model

import android.os.Parcelable
import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize
import java.util.Date

@Parcelize
@Entity(
    tableName = "search_history",
    foreignKeys = [
        ForeignKey(
            entity = User::class,
            parentColumns = ["id"],
            childColumns = ["userId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("userId")]
)
data class SearchHistory(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id")
    @SerializedName("id")
    val id: Long = 0,

    @ColumnInfo(name = "userId")
    @SerializedName("user_id")
    val userId: String,

    @ColumnInfo(name = "query")
    @SerializedName("query")
    val query: String,

    @ColumnInfo(name = "timestamp")
    @SerializedName("timestamp")
    val timestamp: Date
) : Parcelable
