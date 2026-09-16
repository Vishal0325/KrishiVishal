package com.company.krishivishaldelivery.data.model

data class CashDepositRecord(
    val id: String = "",
    val riderId: String = "",
    val amount: Double = 0.0,
    val ordersCount: Int = 0,
    val orderIds: List<String> = emptyList(),
    val status: String = "DEPOSITED_AT_WAREHOUSE",
    val depositedAtMillis: Long = System.currentTimeMillis()
)
