# 👥 KRISHIVISHAL CUSTOMER CRM — MASTER ROADMAP & PHASE SPECIFICATION

> **KrishiVishal Complete Customer Relationship Management (CRM) Architecture**  
> *Note: Khata / Udhaari / Credit System is excluded as per requirement. All other CRM pillars are structured phase-wise below.*

---

## 📌 Master Overview & Execution Flow

```
Phase 1 ─────────► Phase 2 ─────────► Phase 3 ─────────► Phase 4 ─────────► Phase 5
Support Tickets    Complaints &      Feedback &        360° Customer      CRM Dashboard
& Helpdesk ✅      Grievances ✅     Ratings Hub ✅    Hub & Timeline ✅  & Insights ✅
```

---

## 📊 Current System Status (Kaya Bana Hua Hai Aur Kaya Banna Hai)

| Module / Feature | File Path | Status |
|---|---|---|
| **Customer Directory** | `src/pages/Customers.jsx` | **ALREADY BUILT ✅** |
| **Customer Order History** | `src/pages/Orders.jsx` | **ALREADY BUILT ✅** |
| **Return & Refund Lifecycle** | `src/pages/Returns.jsx` | **ALREADY BUILT ✅** |
| **Support Ticket System** | `src/pages/SupportTickets.jsx` | **100% COMPLETE ✅** |
| **Complaint Management Hub** | `src/pages/Complaints.jsx` | **100% COMPLETE ✅** |
| **Feedback & Ratings Hub** | `src/pages/CustomerFeedback.jsx` | **100% COMPLETE ✅** |
| **360° Customer Profile & Timeline** | Enhanced `Customers.jsx` | **100% COMPLETE ✅** |
| **Customer KYC & Document Vault** | Inside `Customers.jsx` | **100% COMPLETE ✅** |
| **CRM Intelligence & Dashboard** | `src/pages/CRMDashboard.jsx` | **100% COMPLETE ✅** |

---

## 🎯 PHASE 1: Support Ticket Management & Helpdesk (STATUS: 100% COMPLETE ✅)

> **Objective:** Customer inquiries, delivery issues, aur helpline calls ko structured ticket lifecycle ke saath manage karna.

### 1.1 Features to Build:
- [x] **Tickets Table & Filter Bar**:
  - Filter by Status (`ALL`, `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`).
  - Filter by Priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`).
  - Filter by Issue Type (`Delivery Delay`, `Product Query`, `Payment Issue`, `Order Assistance`, `General`).
- [x] **"Create Support Ticket" Modal**:
  - Select Customer (from live `users` collection).
  - Optional: Link with Customer Order (`orders` collection).
  - Issue Subject, Description, Priority & Issue Type.
  - Auto-generated Ticket ID format: `TKT-YYYYMMDD-XXXX`.
- [x] **Ticket Detail & Resolution Drawer**:
  - Assign to Staff/Agent (SuperAdmin / OrderManager).
  - Internal Staff Notes & Customer Communication updates.
  - Action to Mark as `RESOLVED` with mandatory Resolution Note.
- [x] **Firestore Schema**: `support_tickets/{ticketId}`

---

## 🎯 PHASE 2: Complaint Management & Grievance Hub (STATUS: 100% COMPLETE ✅)

> **Objective:** Serious customer complaints (Damaged goods, wrong item, rider misconduct) ko track karna with SLA timers aur repeated complaint alerts.

### 2.1 Features to Build:
- [x] **Complaints Log Screen (`Complaints.jsx`)**:
  - Mandatory Order Link: Har complaint specific Order ID se bind hogi.
  - Complaint Categories: `DAMAGED_PRODUCT`, `WRONG_ITEM_DELIVERED`, `EXPIRED_ITEM`, `RIDER_MISBEHAVIOR`, `OVERCHARGED`, `MISSING_ITEM`.
- [x] **Repeated Complaints Detection Alert**:
  - Agar ek hi farmer ne pichle 30 dino me >2 complaints ki hain, to red alert badge dikhega: `⚠️ FREQUENT COMPLAINANT`.
  - Product-level alert: Agar kisi product pe frequent complaints aa rahi hain to catalog team ke liye alert.
- [x] **Resolution Workflow**:
  - Root Cause Analysis (RCA) dropdown (`Vendor Packaging Fault`, `Transit Damage`, `Warehouse Picking Error`).
  - Corrective Action: `REPLACEMENT_ORDER_DISPATCHED`, `REFUND_ISSUED`, `APOLOGY_AND_COUPON`, `REJECTED`.
- [x] **Firestore Schema**: `complaints/{complaintId}`

---

## 🎯 PHASE 3: Customer Feedback, Ratings & Action Alerts (STATUS: 100% COMPLETE ✅)

> **Objective:** Delivered orders par customer ka feedback, star ratings, aur negative feedback ka auto-escalation system.

### 3.1 Features to Build:
- [x] **Customer Feedback Screen (`CustomerFeedback.jsx`)**:
  - Star Ratings (1 to 5 Stars ⭐).
  - Order Reference, Delivery Date, Customer Name & Phone.
  - Feedback comment / Audio note reference.
- [x] **Low Rating Auto-Escalation Engine**:
  - Jab koi customer `1 Star` ya `2 Stars` dega, to wo row **Red Highlight** hogi with badge `🚨 ACTION REQUIRED`.
  - 1-Click Action: **"Convert to Support Ticket"** (automatic ticket create karega taaki agent farmer ko call kar sake).
- [x] **Customer Satisfaction (CSAT) Summary Cards**:
  - Average Customer Rating (e.g. `4.6 / 5.0 ⭐`).
  - Total Reviews, Positive % (>3 stars), Negative % (<=2 stars).
- [x] **Firestore Schema**: `customer_feedback/{feedbackId}`

---

## 🎯 PHASE 4: 360° Customer Profile, Activity Timeline & KYC Documents (STATUS: 100% COMPLETE ✅)

> **Objective:** `Customers.jsx` ko standard customer table se upgrade karke ek comprehensive **360° Customer Command Center** banana.

### 4.1 Features to Build:
- [x] **Customer 360° Drawer / Detail Page with 5 Tabs**:
  1. **Tab 1: Overview & Addresses**: Primary address, alternative delivery locations, farmer profile details, GPS pins.
  2. **Tab 2: Order History & Lifetime Value (LTV)**: All past orders, total amount spent, average order value (AOV), favorite items.
  3. **Tab 3: Support & Complaints History**: Farmer ke saare past support tickets, open grievances, aur unke resolutions.
  4. **Tab 4: Customer Activity Timeline**:
     ```
     Account Created ➔ Address Added ➔ Order #1 Placed ➔ Delivered ➔
     5★ Feedback Given ➔ Support Ticket Raised ➔ Resolved
     ```
  5. **Tab 5: Farm & KYC Documents Vault**:
     - Document upload (Kisan Credit Card / Land Records / Identity proof where required).
     - Verification status: `PENDING`, `VERIFIED`, `REJECTED`.
- [x] **Customer Intelligence & Persona Insights**:
  - Farmer Persona Tag (`High Value Farmer`, `Active Regular Buyer`, `New Farmer`, `Churn Risk (45+ Days Inactive)`).
  - Churn Risk Warning: Agar farmer ne pichle 45 dino se order nahi kiya to alert badge.

---

## 🎯 PHASE 5: CRM Dashboard, Global Search & Sidebar Integration (STATUS: 100% COMPLETE ✅)

> **Objective:** Executive CRM analytics dashboard, fast customer multi-attribute search, aur Sidebar integration.

### 5.1 Features to Build:
- [x] **CRM Executive Dashboard (`CRMDashboard.jsx`)**:
  - Top Metrics: `Total Registered Farmers`, `Active (30d)`, `Open Support Tickets`, `Open Complaints`, `CSAT Rating`, `Avg Resolution Time (Hours)`.
  - Recent CRM Interactions stream.
- [x] **Sidebar Category Grouping**:
  - Sidebar me dedicated **"Customer CRM"** category integrate:
    - 📊 CRM Overview (`/crm-dashboard`)
    - 👥 Farmers (360°) (`/customers`)
    - 🎫 Support Tickets (`/support-tickets`)
    - ⚠️ Grievances (`/complaints`)
    - ⭐ Customer Feedback (`/customer-feedback`)
- [x] **App.jsx Routing & Role Protection**:
  - Protected routes for all new CRM pages with `RequireRole`.

---

## 🚀 Execution Guide (Aap Kaise Start Karenge?)

Aap bas chat me bolenge:
- **`crm phase 1`** ➔ Hum **Support Ticket Management** pura bana denge.
- **`crm phase 2`** ➔ Hum **Complaint Management & Grievance Hub** bana denge.
- **`crm phase 3`** ➔ Hum **Customer Feedback & Action Alerts** bana denge.
- **`crm phase 4`** ➔ Hum **360° Customer Profile, Timeline & KYC Vault** bana denge.
- **`crm phase 5`** ➔ Hum **CRM Dashboard & Sidebar Integration** bana denge.
