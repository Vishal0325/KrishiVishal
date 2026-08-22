package com.company.krishivishal.data.local

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Room Database Migrations
 * Add all migrations here to avoid data loss when schema changes.
 * NEVER call fallbackToDestructiveMigration() in production — it wipes user data.
 */
object DatabaseMigrations {

    /**
     * Migration from 33 to 34
     * Adds 'referredBy' and 'walletBalance' columns to the 'users' table.
     */
    val MIGRATION_33_34 = object : Migration(33, 34) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("ALTER TABLE users ADD COLUMN referredBy TEXT")
            db.execSQL("ALTER TABLE users ADD COLUMN walletBalance REAL NOT NULL DEFAULT 0")
        }
    }

    /**
     * Migration from 34 to 35
     * Creates the 'notifications' table for the Notification entity.
     */
    val MIGRATION_34_35 = object : Migration(34, 35) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS `notifications` (
                    `id` TEXT NOT NULL,
                    `title` TEXT NOT NULL,
                    `body` TEXT NOT NULL,
                    `type` TEXT NOT NULL,
                    `referenceId` TEXT,
                    `isRead` INTEGER NOT NULL DEFAULT 0,
                    `createdAt` INTEGER NOT NULL,
                    PRIMARY KEY(`id`)
                )
                """.trimIndent()
            )
        }
    }

    /**
     * Migration from 35 to 36
     * Renames 'guest_wishlist' table to 'wishlist' to align with the updated DAO.
     * SQLite does not support ALTER TABLE RENAME COLUMN before 3.25.0, so we
     * recreate the table via copy-and-drop.
     */
    val MIGRATION_35_36 = object : Migration(35, 36) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Create new table with the correct name
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS `wishlist` (
                    `id` TEXT NOT NULL,
                    `userId` TEXT NOT NULL,
                    `productId` TEXT NOT NULL,
                    `productName` TEXT NOT NULL,
                    `productImage` TEXT NOT NULL,
                    `price` REAL NOT NULL,
                    `addedAt` INTEGER NOT NULL,
                    PRIMARY KEY(`id`)
                )
                """.trimIndent()
            )

            // Safe check for guest_wishlist table existence before copying
            val cursor = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='guest_wishlist'")
            val tableExists = cursor != null && cursor.count > 0
            cursor?.close()

            if (tableExists) {
                // Copy existing data from old table
                db.execSQL(
                    """
                    INSERT OR IGNORE INTO `wishlist`
                    SELECT * FROM `guest_wishlist`
                    """.trimIndent()
                )
                db.execSQL("DROP TABLE IF EXISTS `guest_wishlist`")
            }
        }
    }

    /**
     * Migration from 36 to 37
     * No structural change — version bump to align with Notification entity inclusion
     * in the @Database annotation.
     */
    val MIGRATION_36_37 = object : Migration(36, 37) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // Notifications table was created in 34→35.
            // This migration is a no-op to keep the version counter consistent.
        }
    }

    val MIGRATION_37_38 = object : Migration(37, 38) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS `product_crop_cross_ref` (
                    `productId` TEXT NOT NULL,
                    `cropId` TEXT NOT NULL,
                    PRIMARY KEY(`productId`, `cropId`)
                )
                """.trimIndent()
            )
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_product_crop_cross_ref_cropId` ON `product_crop_cross_ref` (`cropId`)")
        }
    }

    /**
     * Migration from 42 to 43
     * Expands the 'returns' table with logistics, QC, and refund fields.
     */
    val MIGRATION_42_43 = object : Migration(42, 43) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("ALTER TABLE returns ADD COLUMN orderItemId TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE returns ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1")
            db.execSQL("ALTER TABLE returns ADD COLUMN customerComment TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE returns ADD COLUMN riderId TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE returns ADD COLUMN qcStatus TEXT NOT NULL DEFAULT 'PENDING'")
            db.execSQL("ALTER TABLE returns ADD COLUMN qcPhotos TEXT NOT NULL DEFAULT '[]'")
            db.execSQL("ALTER TABLE returns ADD COLUMN refundStatus TEXT NOT NULL DEFAULT 'PENDING'")
            db.execSQL("ALTER TABLE returns ADD COLUMN refundAmount REAL NOT NULL DEFAULT 0.0")
            db.execSQL("ALTER TABLE returns ADD COLUMN gatewayRefundId TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE returns ADD COLUMN rejectionReason TEXT NOT NULL DEFAULT ''")
        }
    }

    val ALL_MIGRATIONS = arrayOf(
        MIGRATION_33_34,
        MIGRATION_34_35,
        MIGRATION_35_36,
        MIGRATION_36_37,
        MIGRATION_37_38,
        MIGRATION_42_43
    )
}

