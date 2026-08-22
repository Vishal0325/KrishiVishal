# 🚚 Rider & Delivery Intelligence Design

**Project:** KrishiVishal V4
**Status:** DESIGN READY
**Author:** Operations Hardening Architect

## 1. Objective
Transform delivery operations from basic tracking to "Intelligent Logistics" by measuring rider performance, automating SLA enforcement, and providing actionable insights.

## 2. Core Metrics (Rider Scorecard)
We will track the following metrics for every rider in a new `rider_performance` collection:

| Metric | Calculation | Goal |
| :--- | :--- | :--- |
| **Delivery Success Rate** | (Successful / Total Assigned) * 100 | > 95% |
| **Average Delivery Time** | Avg(DeliveredAt - AssignedAt) | < 45 Mins |
| **On-Time Rate** | % of orders delivered within target SLA | > 90% |
| **Return/Cancellation Rate** | (Cancelled / Total Assigned) * 100 | < 5% |
| **Rider Rating** | Avg(Customer Rating) | > 4.5 Stars |

## 3. SLA Automation (Push Nudges)
The `monitorOrderSLA` function will be upgraded to perform "Active Nudging":

1. **Delayed Pickup:** If order is `ASSIGNED` for > 30 mins and not `PICKED_UP`.
   - **Action:** Send high-priority notification to Rider: "Order #XYZ is waiting for pickup!"
2. **Delayed Delivery:** If order is `OUT_FOR_DELIVERY` for > 60 mins.
   - **Action:** Notify Admin and Rider: "Delivery delay detected for Order #XYZ."

## 4. Implementation Steps

### Phase 1: Performance Triggers
- Add a trigger `onOrderDeliveryUpdate` that calculates and updates `rider_performance` stats whenever an order moves to a final state (`DELIVERED`, `CANCELLED`, `RETURNED`).

### Phase 2: Active SLA Monitoring
- Upgrade `monitorOrderSLA` to check for granular status-specific timers and send FCM messages.

### Phase 3: Rider Intelligence UI
- Create `RiderPerformance.jsx` in Admin Dashboard with a leaderboard and individual drill-down cards.

## 5. Security
- Riders can only view their own performance metrics in the Delivery App.
- Admins have full access to the Leaderboard and comparative analytics.
