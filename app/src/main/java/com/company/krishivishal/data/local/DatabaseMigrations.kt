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
     * Migration from 38 to 42
     * Bridge migration ensuring 'returns' base table and schema consistency across versions 38-42.
     */
    val MIGRATION_38_42 = object : Migration(38, 42) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS `returns` (
                    `id` TEXT NOT NULL,
                    `orderId` TEXT NOT NULL,
                    `userId` TEXT NOT NULL,
                    `reason` TEXT NOT NULL,
                    `status` TEXT NOT NULL,
                    `createdAt` INTEGER NOT NULL,
                    `updatedAt` INTEGER NOT NULL,
                    PRIMARY KEY(`id`)
                )
                """.trimIndent()
            )
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

    /**
     * Migration from 43 to 48
     * Covers structural changes for recommendations, recently viewed, and product analytics.
     */
    val MIGRATION_43_48 = object : Migration(43, 48) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // 1. Create product_recommendations table
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS `product_recommendations` (
                    `sourceProductId` TEXT NOT NULL,
                    `recommendedProductId` TEXT NOT NULL,
                    `type` TEXT NOT NULL,
                    `score` INTEGER NOT NULL DEFAULT 0,
                    `position` INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY(`sourceProductId`, `recommendedProductId`, `type`)
                )
                """.trimIndent()
            )

            // 2. Create recently_viewed table
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS `recently_viewed` (
                    `userId` TEXT NOT NULL,
                    `productId` TEXT NOT NULL,
                    `timestamp` INTEGER NOT NULL,
                    PRIMARY KEY(`userId`, `productId`)
                )
                """.trimIndent()
            )

            // 3. Create recent_searches table (Consolidated from KrishiVishalDatabase)
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS `recent_searches` (
                    `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    `query` TEXT NOT NULL,
                    `searchedAt` INTEGER NOT NULL
                )
                """.trimIndent()
            )

            // 4. Update products table with missing analytics and technical columns
            // SQLite ALTER TABLE doesn't support multiple columns at once
            db.execSQL("ALTER TABLE products ADD COLUMN technicalName TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE products ADD COLUMN technicalNameNormalized TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE products ADD COLUMN priceBand TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE products ADD COLUMN packSizeBand TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE products ADD COLUMN salesCount INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE products ADD COLUMN salesCount90d INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE products ADD COLUMN viewCount INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE products ADD COLUMN searchCount INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE products ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'")
            db.execSQL("ALTER TABLE products ADD COLUMN targetPestIds TEXT NOT NULL DEFAULT '[]'")
            db.execSQL("ALTER TABLE products ADD COLUMN usageInstructions TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE products ADD COLUMN targetCrops TEXT NOT NULL DEFAULT '[]'")
            db.execSQL("ALTER TABLE products ADD COLUMN targetPests TEXT NOT NULL DEFAULT '[]'")
            db.execSQL("ALTER TABLE products ADD COLUMN targetDiseases TEXT NOT NULL DEFAULT '[]'")
            db.execSQL("ALTER TABLE products ADD COLUMN applicationMethod TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE products ADD COLUMN safetyNotes TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE products ADD COLUMN mixingCompatibility TEXT NOT NULL DEFAULT ''")

            // 5. Create indexes for performance
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_products_technicalNameNormalized` ON `products` (`technicalNameNormalized`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_products_isActive` ON `products` (`isActive`)")
        }
    }

    /**
     * Migration from 48 to 49
     * Adds SKU, Batch, Warehouse, and Inventory Movement tables with indexes.
     * Also adds missing landmark column to orders table.
     */
    val MIGRATION_48_49 = object : Migration(48, 49) {
        override fun migrate(db: SupportSQLiteDatabase) {
            // 1. Update variants table
            db.execSQL("ALTER TABLE variants ADD COLUMN skuCode TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE variants ADD COLUMN barcode TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE variants ADD COLUMN reorderLevel INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE variants ADD COLUMN availableStock INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE variants ADD COLUMN committedStock INTEGER NOT NULL DEFAULT 0")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_variants_skuCode` ON `variants` (`skuCode`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_variants_barcode` ON `variants` (`barcode`)")

            // 2. Update cart_items table
            db.execSQL("ALTER TABLE cart_items ADD COLUMN skuCode TEXT")

            // 3. Update orders table (Add missing landmark)
            db.execSQL("ALTER TABLE orders ADD COLUMN landmark TEXT NOT NULL DEFAULT ''")

            // 4. Create skus table
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS `skus` (
                    `skuCode` TEXT NOT NULL PRIMARY KEY,
                    `productId` TEXT NOT NULL,
                    `name` TEXT NOT NULL,
                    `categoryCode` TEXT NOT NULL,
                    `itemCode` TEXT NOT NULL,
                    `varietyCode` TEXT NOT NULL,
                    `gradeCode` TEXT NOT NULL,
                    `packCode` TEXT NOT NULL,
                    `brandCode` TEXT NOT NULL,
                    `unit` TEXT NOT NULL,
                    `size` TEXT NOT NULL,
                    `mrp` REAL NOT NULL,
                    `consumerPrice` REAL NOT NULL,
                    `dealerPrice` REAL NOT NULL,
                    `landingCost` REAL NOT NULL,
                    `totalStock` INTEGER NOT NULL,
                    `availableStock` INTEGER NOT NULL,
                    `committedStock` INTEGER NOT NULL,
                    `hsnCode` TEXT NOT NULL,
                    `gstRate` REAL NOT NULL,
                    `barcode` TEXT NOT NULL,
                    `reorderLevel` INTEGER NOT NULL,
                    `minStockLimit` INTEGER NOT NULL,
                    `isActive` INTEGER NOT NULL,
                    `updatedAt` INTEGER NOT NULL
                )
            """.trimIndent())
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_skus_productId` ON `skus` (`productId`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_skus_barcode` ON `skus` (`barcode`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_skus_isActive` ON `skus` (`isActive`)")

            // 4. Create batches table
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS `batches` (
                    `batchId` TEXT NOT NULL PRIMARY KEY,
                    `skuCode` TEXT NOT NULL,
                    `batchNumber` TEXT NOT NULL,
                    `mfgDate` INTEGER,
                    `expiryDate` INTEGER,
                    `stock` INTEGER NOT NULL,
                    `warehouseId` TEXT NOT NULL,
                    `binLocation` TEXT NOT NULL,
                    `supplierId` TEXT NOT NULL,
                    `purchaseOrderId` TEXT NOT NULL,
                    `grnId` TEXT NOT NULL,
                    `landingCost` REAL NOT NULL,
                    `qualityStatus` TEXT NOT NULL,
                    `isActive` INTEGER NOT NULL,
                    `createdAt` INTEGER NOT NULL,
                    `updatedAt` INTEGER NOT NULL
                )
            """.trimIndent())
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_batches_skuCode` ON `batches` (`skuCode`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_batches_expiryDate` ON `batches` (`expiryDate`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_batches_warehouseId` ON `batches` (`warehouseId`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_batches_qualityStatus` ON `batches` (`qualityStatus`)")

            // 5. Create warehouses table
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS `warehouses` (
                    `id` TEXT NOT NULL PRIMARY KEY,
                    `name` TEXT NOT NULL,
                    `city` TEXT NOT NULL,
                    `state` TEXT NOT NULL,
                    `type` TEXT NOT NULL,
                    `isActive` INTEGER NOT NULL
                )
            """.trimIndent())

            // 6. Create inventory_movements table
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS `inventory_movements` (
                    `movementId` TEXT NOT NULL PRIMARY KEY,
                    `movementType` TEXT NOT NULL,
                    `skuCode` TEXT NOT NULL,
                    `batchId` TEXT,
                    `batchNumber` TEXT,
                    `warehouseId` TEXT NOT NULL,
                    `quantity` INTEGER NOT NULL,
                    `availableBefore` INTEGER NOT NULL,
                    `availableAfter` INTEGER NOT NULL,
                    `committedBefore` INTEGER NOT NULL,
                    `committedAfter` INTEGER NOT NULL,
                    `referenceId` TEXT NOT NULL,
                    `actorId` TEXT NOT NULL,
                    `actorRole` TEXT NOT NULL,
                    `reason` TEXT NOT NULL,
                    `note` TEXT NOT NULL,
                    `idempotencyKey` TEXT,
                    `timestamp` INTEGER NOT NULL
                )
            """.trimIndent())
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_inventory_movements_skuCode` ON `inventory_movements` (`skuCode`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_inventory_movements_timestamp` ON `inventory_movements` (`timestamp`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_inventory_movements_referenceId` ON `inventory_movements` (`referenceId`)")
        }
    }

    val MIGRATION_49_50 = object : Migration(49, 50) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_wishlist_items_userId` ON `wishlist_items` (`userId`)")
            db.execSQL(
                "CREATE INDEX IF NOT EXISTS `index_recently_viewed_userId_timestamp` " +
                    "ON `recently_viewed` (`userId`, `timestamp`)"
            )
            db.execSQL(
                "CREATE INDEX IF NOT EXISTS `index_product_recommendations_sourceProductId_type_position` " +
                    "ON `product_recommendations` (`sourceProductId`, `type`, `position`)"
            )
        }
    }

    val ALL_MIGRATIONS = arrayOf(
        MIGRATION_33_34,
        MIGRATION_34_35,
        MIGRATION_35_36,
        MIGRATION_36_37,
        MIGRATION_37_38,
        MIGRATION_38_42,
        MIGRATION_42_43,
        MIGRATION_43_48,
        MIGRATION_48_49,
        MIGRATION_49_50
    )
}

