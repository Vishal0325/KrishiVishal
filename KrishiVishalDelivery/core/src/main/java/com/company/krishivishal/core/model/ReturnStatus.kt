package com.company.krishivishal.core.model

enum class ReturnStatus(val displayName: String) {
    REQUESTED("Requested"),
    APPROVED("Approved"),
    RIDER_ASSIGNED("Rider Assigned"),
    PICKUP_SCHEDULED("Pickup Scheduled"),
    PICKED_UP("Picked Up"),
    HUB_RECEIVED("Hub Received"),
    QC_PENDING("QC Pending"),
    QC_PASSED("QC Passed"),
    QC_FAILED("QC Failed"),
    REFUND_PENDING("Refund Pending"),
    COMPLETED("Completed"),
    REJECTED("Rejected"),
    CANCELLED("Cancelled");

    companion object {
        fun fromString(status: String?): ReturnStatus {
            return entries.find { it.name.equals(status, ignoreCase = true) } ?: REQUESTED
        }
    }
}
