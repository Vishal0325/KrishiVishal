package com.company.krishivishal.data.local

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Room Database Migrations
 * Add all migrations here to avoid data loss when schema changes
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

    // Add more migrations as list
    val ALL_MIGRATIONS = arrayOf(
        MIGRATION_33_34
    )
}
