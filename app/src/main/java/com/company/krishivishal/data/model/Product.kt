package com.company.krishivishal.data.model

import android.os.Parcelable
import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName
import com.google.firebase.firestore.PropertyName
import com.google.firebase.firestore.IgnoreExtraProperties
import com.google.firebase.firestore.Exclude
import com.google.firebase.Timestamp
import androidx.compose.runtime.Immutable
import kotlinx.parcelize.Parcelize
import kotlinx.parcelize.IgnoredOnParcel
import java.util.Date

@Parcelize
data class ReviewItem(
    val authorName: String = "",
    val location: String = "",
    val rating: Float = 0f,
    val text: String = "",
    val date: Timestamp? = null
) : Parcelable

@Immutable
@IgnoreExtraProperties
@Parcelize
@Entity(
    tableName = "products",
    indices = [
        androidx.room.Index("category"),
        androidx.room.Index("brand"),
        androidx.room.Index("cropId")
    ]
)
data class Product(
    @PrimaryKey
    @ColumnInfo(name = "id")
    @SerializedName("id")
    var id: String = "",

    @ColumnInfo(name = "name")
    @SerializedName("name")
    var name: String = "",

    @ColumnInfo(name = "brand")
    @SerializedName("brand")
    var brand: String = "",

    @ColumnInfo(name = "description")
    @SerializedName("description")
    var description: String = "",

    @ColumnInfo(name = "composition")
    @SerializedName("composition")
    @get:PropertyName("composition")
    @set:PropertyName("composition")
    var composition: String = "",

    @ColumnInfo(name = "category")
    @SerializedName("category")
    var category: String = "",

    @ColumnInfo(name = "cropId")
    @SerializedName("cropId")
    var cropId: String = "",

    @ColumnInfo(name = "cropName")
    @SerializedName("cropName")
    var cropName: String = "",

    @ColumnInfo(name = "associatedCropIds")
    @SerializedName("associatedCropIds")
    var associatedCropIds: List<String> = emptyList(),

    @ColumnInfo(name = "associatedCropNames")
    @SerializedName("associatedCropNames")
    var associatedCropNames: List<String> = emptyList(),

    @ColumnInfo(name = "isAllCrops")
    @SerializedName("isAllCrops")
    var isAllCrops: Boolean = false,

    @ColumnInfo(name = "classification")
    @SerializedName("classification")
    @get:PropertyName("classification")
    @set:PropertyName("classification")
    var classification: String = "",

    @ColumnInfo(name = "subCategory")
    @SerializedName("subCategory")
    @get:PropertyName("subCategory")
    @set:PropertyName("subCategory")
    var subCategory: String = "",

    @ColumnInfo(name = "imageUrl")
    @SerializedName("imageUrl")
    @get:PropertyName("imageUrl")
    @set:PropertyName("imageUrl")
    var imageUrl: String = "",

    @ColumnInfo(name = "basePrice")
    @SerializedName("basePrice")
    @get:PropertyName("basePrice")
    @set:PropertyName("basePrice")
    var basePrice: Double = 0.0,

    @ColumnInfo(name = "discountedPrice")
    @SerializedName("discountedPrice")
    @get:PropertyName("discountedPrice")
    @set:PropertyName("discountedPrice")
    var discountedPrice: Double = 0.0,

    @ColumnInfo(name = "discountPercent")
    @SerializedName("discountPercent")
    @get:PropertyName("discountPercent")
    @set:PropertyName("discountPercent")
    var discountPercent: Int = 0,

    @ColumnInfo(name = "savedPrice")
    @SerializedName("savedPrice")
    @get:PropertyName("savedPrice")
    @set:PropertyName("savedPrice")
    var savedPrice: Double = 0.0,

    @ColumnInfo(name = "rating")
    @SerializedName("rating")
    var rating: Float = 0f,

    @ColumnInfo(name = "reviewsCount")
    @SerializedName("reviewsCount")
    @get:PropertyName("reviewsCount")
    @set:PropertyName("reviewsCount")
    var reviewsCount: Int = 0,

    @ColumnInfo(name = "deliveryLocation")
    @SerializedName("deliveryLocation")
    @get:PropertyName("deliveryLocation")
    @set:PropertyName("deliveryLocation")
    var deliveryLocation: String = "",

    @ColumnInfo(name = "deliveryDate")
    @SerializedName("deliveryDate")
    @get:PropertyName("deliveryDate")
    @set:PropertyName("deliveryDate")
    var deliveryDate: String = "",

    @ColumnInfo(name = "mfgDate")
    @SerializedName("mfgDate")
    @get:PropertyName("mfgDate")
    @set:PropertyName("mfgDate")
    var mfgDate: Timestamp? = null,

    @ColumnInfo(name = "expiryDate")
    @SerializedName("expiryDate")
    @get:PropertyName("expiryDate")
    @set:PropertyName("expiryDate")
    var expiryDate: Timestamp? = null,

    @ColumnInfo(name = "stockQuantity")
    @SerializedName("stockQuantity")
    @get:PropertyName("stockQuantity")
    @set:PropertyName("stockQuantity")
    var stockQuantity: Int = 0,

    @ColumnInfo(name = "isActive")
    @SerializedName("isActive")
    @get:PropertyName("isActive")
    @set:PropertyName("isActive")
    var isActive: Boolean = true,

    @ColumnInfo(name = "isReturnable")
    @SerializedName("isReturnable")
    @get:PropertyName("isReturnable")
    @set:PropertyName("isReturnable")
    var isReturnable: Boolean = true,

    @ColumnInfo(name = "features")
    @SerializedName("features")
    @get:PropertyName("features")
    @set:PropertyName("features")
    var features: List<String> = emptyList(),

    @androidx.room.Ignore
    @IgnoredOnParcel
    @SerializedName("variants")
    @get:PropertyName("variants")
    @set:PropertyName("variants")
    var variants: List<Variant> = emptyList(),

    @androidx.room.Ignore
    @IgnoredOnParcel
    @SerializedName("reviews")
    @get:PropertyName("reviews")
    @set:PropertyName("reviews")
    var reviewItems: List<ReviewItem> = emptyList(),

    // Legacy fields for compatibility
    @androidx.room.Ignore
    @IgnoredOnParcel
    var usage: String = "",

    @ColumnInfo(name = "mrp")
    @IgnoredOnParcel
    var mrp: Double = 0.0,

    @ColumnInfo(name = "unit")
    @SerializedName("unit")
    @get:PropertyName("unit")
    @set:PropertyName("unit")
    var unit: String = "",

    @ColumnInfo(name = "weight")
    @SerializedName("weight")
    @get:PropertyName("weight")
    @set:PropertyName("weight")
    var weight: String = "",

    @androidx.room.Ignore
    @IgnoredOnParcel
    var images: List<String> = emptyList(),

    @androidx.room.Ignore
    @IgnoredOnParcel
    @SerializedName("searchKeywords")
    @get:PropertyName("searchKeywords")
    @set:PropertyName("searchKeywords")
    var searchKeywords: List<String> = emptyList(),

    @androidx.room.Ignore
    @IgnoredOnParcel
    var reviewCount: Int = 0,

    @androidx.room.Ignore
    @IgnoredOnParcel
    var usageInstructions: String = "",
    
    @androidx.room.Ignore
    @IgnoredOnParcel
    var safetyWarnings: String = "",

    @androidx.room.Ignore
    @IgnoredOnParcel
    @get:Exclude
    @set:Exclude
    var price: Double = 0.0,

    @androidx.room.Ignore
    @IgnoredOnParcel
    @get:Exclude
    @set:Exclude
    var stock: Int = 0,

    @androidx.room.Ignore
    @IgnoredOnParcel
    var seedMetadata: Map<String, Any?>? = null,

    @androidx.room.Ignore
    @IgnoredOnParcel
    var agroMetadata: Map<String, Any?>? = null,

    @androidx.room.Ignore
    @IgnoredOnParcel
    var herbicideMetadata: Map<String, Any?>? = null
) : Parcelable
