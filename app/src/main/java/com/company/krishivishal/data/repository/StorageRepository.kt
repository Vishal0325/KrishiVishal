package com.company.krishivishal.data.repository

import android.net.Uri
import com.company.krishivishal.utils.Resource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.storage.FirebaseStorage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton
import com.company.krishivishal.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher

interface StorageRepository {
    fun uploadProfileImage(userId: String, imageUri: Uri): Flow<Resource<String>>
    fun uploadCategoryImage(categoryId: String, imageUri: Uri): Flow<Resource<String>>
    fun uploadSubCategoryImage(subCategoryId: String, imageUri: Uri): Flow<Resource<String>>
    fun uploadBrandImage(brandId: String, imageUri: Uri): Flow<Resource<String>>
    fun uploadCropImage(cropId: String, imageUri: Uri): Flow<Resource<String>>
    fun uploadBannerImage(bannerId: String, imageUri: Uri): Flow<Resource<String>>
}

@Singleton
class StorageRepositoryImpl @Inject constructor(
    private val storage: FirebaseStorage,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : StorageRepository {

    override fun uploadProfileImage(userId: String, imageUri: Uri): Flow<Resource<String>> = safeCall(ioDispatcher) {
        val ref = storage.reference.child("profile_images/$userId.jpg")
        ref.putFile(imageUri).await()
        ref.downloadUrl.await().toString()
    }

    override fun uploadCategoryImage(categoryId: String, imageUri: Uri): Flow<Resource<String>> = safeCall(ioDispatcher) {
        val ref = storage.reference.child("categories/$categoryId.jpg")
        ref.putFile(imageUri).await()
        ref.downloadUrl.await().toString()
    }

    override fun uploadSubCategoryImage(subCategoryId: String, imageUri: Uri): Flow<Resource<String>> = safeCall(ioDispatcher) {
        val ref = storage.reference.child("subcategories/$subCategoryId.jpg")
        ref.putFile(imageUri).await()
        ref.downloadUrl.await().toString()
    }

    override fun uploadBrandImage(brandId: String, imageUri: Uri): Flow<Resource<String>> = safeCall(ioDispatcher) {
        val ref = storage.reference.child("brands/$brandId.jpg")
        ref.putFile(imageUri).await()
        ref.downloadUrl.await().toString()
    }

    override fun uploadCropImage(cropId: String, imageUri: Uri): Flow<Resource<String>> = safeCall(ioDispatcher) {
        val ref = storage.reference.child("crops/$cropId.jpg")
        ref.putFile(imageUri).await()
        ref.downloadUrl.await().toString()
    }

    override fun uploadBannerImage(bannerId: String, imageUri: Uri): Flow<Resource<String>> = safeCall(ioDispatcher) {
        val ref = storage.reference.child("banners/$bannerId.jpg")
        ref.putFile(imageUri).await()
        ref.downloadUrl.await().toString()
    }
}
