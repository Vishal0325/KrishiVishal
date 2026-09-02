import os
import sys
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        if self._pageNumber > 1:
            self.saveState()
            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor("#64748b"))
            # Header
            self.drawString(40, 805, "KrishiVishal ERP 2.0 • Admin Portal User Manual")
            self.drawRightString(555, 805, "02 September 2026")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(40, 798, 555, 798)
            
            # Footer
            self.line(40, 45, 555, 45)
            self.drawString(40, 32, "Confidential • For Internal & Warehouse Operations Only")
            self.drawRightString(555, 32, f"Page {self._pageNumber} of {page_count}")
            self.restoreState()

def build_pdf(filename="KrishiVishal_Admin_User_Manual_2026-09-02.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=50,
        bottomMargin=55
    )

    styles = getSampleStyleSheet()
    
    # Custom Palette
    primary_green = colors.HexColor("#14532d")
    emerald_dark = colors.HexColor("#166534")
    accent_green = colors.HexColor("#22c55e")
    bg_light_green = colors.HexColor("#f0fdf4")
    border_color = colors.HexColor("#e2e8f0")
    text_dark = colors.HexColor("#0f172a")
    text_muted = colors.HexColor("#475569")
    card_bg = colors.HexColor("#f8fafc")
    blue_badge = colors.HexColor("#0284c7")

    # Custom Typography Styles
    title_style = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=primary_green,
        spaceAfter=10
    )

    subtitle_style = ParagraphStyle(
        'CoverSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=text_muted,
        spaceAfter=20
    )

    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=colors.white,
        spaceAfter=0
    )

    card_title = ParagraphStyle(
        'CardTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=primary_green
    )

    route_badge = ParagraphStyle(
        'RouteBadge',
        parent=styles['Normal'],
        fontName='Courier-Bold',
        fontSize=8.5,
        leading=10,
        textColor=blue_badge
    )

    body_text = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=text_dark
    )

    bold_label = ParagraphStyle(
        'BoldLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=emerald_dark
    )

    bullet_style = ParagraphStyle(
        'BulletStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=text_dark,
        leftIndent=12,
        firstLineIndent=-12
    )

    pro_tip_style = ParagraphStyle(
        'ProTip',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#92400e")
    )

    story = []

    # ════════════════════ COVER PAGE ════════════════════
    story.append(Spacer(1, 20))
    story.append(Paragraph("<b>KRISHIVISHAL ERP 2.0 • OFFICIAL USER MANUAL</b>", ParagraphStyle('Badge', fontName='Helvetica-Bold', fontSize=9, textColor=emerald_dark, spaceAfter=15)))
    story.append(Paragraph("KrishiVishal Admin Portal<br/>Complete Operations &amp; User Manual", title_style))
    story.append(Paragraph("Complete Step-by-Step Guide for Every Module, Option &amp; 1-Click Feature", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=3, color=emerald_dark, spaceAfter=20))

    # Meta Table
    meta_data = [
        [
            Paragraph("<b>DOCUMENT DATE:</b>", bold_label),
            Paragraph("02 September 2026", body_text),
            Paragraph("<b>PLATFORM:</b>", bold_label),
            Paragraph("Web Admin ERP (Firebase)", body_text)
        ],
        [
            Paragraph("<b>LIVE URL:</b>", bold_label),
            Paragraph("https://krishivishal-a9ed7.web.app", route_badge),
            Paragraph("<b>TARGET ROLES:</b>", bold_label),
            Paragraph("SuperAdmin, Warehouse, Ops", body_text)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[110, 140, 100, 160])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), card_bg),
        ('BOX', (0, 0), (-1, -1), 1, border_color),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, border_color),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 25))

    # Summary of 7 Modules on Cover
    summary_html = """
    <b>Table of Contents / Index (7 Core Sections):</b><br/>
    <b>1. Dashboard &amp; Orders Pipeline:</b> Executive KPIs, Order Lifecycle, Packing Station, CRM.<br/>
    <b>2. Supply Chain &amp; Stock:</b> SKU Master (6-Segment), GRN Inward, Immutable Ledger, Procurement.<br/>
    <b>3. Catalog &amp; 1-Click Upload:</b> Single-Page Auto-SKU Product Form, 1-Click Bulk Excel Importer.<br/>
    <b>4. Logistics &amp; Fleet:</b> Rider Onboarding, Live GPS Tracking, Route Trips, Shift Attendance.<br/>
    <b>5. ERP, Tax &amp; Finance:</b> Unit Economics (P&L), GSTR-1/3B Tax Filing, COD Cash Recon, Supplier Ledger.<br/>
    <b>6. Growth &amp; Marketing:</b> Mobile Promo Banners, Push Notifications Broadcast.<br/>
    <b>7. AI &amp; Governance:</b> AI Demand Control Room, Role-Based Access (RBAC), Immutable Audit Logs.
    """
    summary_table = Table([[Paragraph(summary_html, ParagraphStyle('Summary', fontName='Helvetica', fontSize=8.5, leading=13, textColor=text_dark))]], colWidths=[515])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg_light_green),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#bbf7d0")),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
    ]))
    story.append(summary_table)
    story.append(PageBreak())

    # Helper function for Module Headers
    def create_module_header(title_text):
        t = Table([[Paragraph(f"<b>{title_text}</b>", section_heading)]], colWidths=[515])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), primary_green),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('CORNERPAD', (0, 0), (-1, -1), 4),
        ]))
        return t

    # Helper function for Feature Cards
    def create_feature_card(name, route, what_it_does, how_to_use_steps):
        content = [
            Table([
                [Paragraph(f"<b>{name}</b>", card_title), Paragraph(route, route_badge)]
            ], colWidths=[360, 140]),
            Spacer(1, 4),
            Paragraph(f"<b>What It Does:</b> {what_it_does}", body_text),
            Spacer(1, 4),
            Paragraph("<b>How to Operate (Step-by-Step):</b>", bold_label),
        ]
        for step in how_to_use_steps:
            content.append(Paragraph(f"• {step}", bullet_style))
        
        card_table = Table([[content]], colWidths=[515])
        card_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), card_bg),
            ('BOX', (0, 0), (-1, -1), 1, border_color),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ]))
        return card_table

    # ════════════════════ 1. DASHBOARD & ORDERS ════════════════════
    story.append(create_module_header("1. DASHBOARD & OPERATIONS"))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "Executive Live Dashboard",
        "Route: /",
        "Real-time overview of business KPIs: Today's revenue, active orders pipeline, low stock warnings, rider fleet status, and urgent support tickets.",
        [
            "View live Gross Revenue, Delivered Orders, and Active Orders count at the top.",
            "Use Quick Action buttons to immediately Add Products, Inward Goods (GRN), or Adjust Stock.",
            "Click on any order in the Recent Live Orders list to open full order details and process it."
        ]
    ))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "Orders Pipeline & Processing",
        "Route: /orders",
        "Manages full lifecycle of customer orders: Placed -> Confirmed -> Packed -> Out for Delivery -> Delivered.",
        [
            "Filter orders by Status: Pending, Confirmed, Packed, Out for Delivery, or Delivered.",
            "Click 'Confirm Order' to trigger Cloud Function FEFO inventory reservation.",
            "Click 'Mark Packed' once warehouse items are verified and packed.",
            "Assign an active Rider from the dropdown for dispatch.",
            "Delivery is completed when rider verifies the 4-digit OTP from the customer."
        ]
    ))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "Packing Station & Barcode Verification",
        "Route: /packing-station",
        "Dedicated touch UI for warehouse packers to verify correct items via barcode scanning and print dispatch slips.",
        [
            "Select an order from the Packing Queue or scan the invoice barcode.",
            "Scan each item's SKU barcode (system flashes green on match, red on mismatch).",
            "Click 'Print Packing Slip' to print customer label and hand over to logistics."
        ]
    ))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "Customer Care, Support & CRM",
        "Route: /support-tickets • /crm-dashboard",
        "Resolution of farmer complaints, returns, refund approvals, and tracking farmer credit profiles.",
        [
            "Open ticket to view complaint description, photos of damaged goods, and order history.",
            "Click 'Approve Return/Refund' to initiate automatic stock return restock and payment refund."
        ]
    ))
    story.append(PageBreak())

    # ════════════════════ 2. SUPPLY CHAIN & STOCK ════════════════════
    story.append(create_module_header("2. SUPPLY CHAIN, SKU & INVENTORY"))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "SKU Master & Stock Dashboard",
        "Route: /skus",
        "Central master control of all 6-segment Agri SKUs (CC-III-VVV-GG-SSSUU-BBB), FEFO active batches, barcode mappings, and stock balances.",
        [
            "Search SKUs by Code, Product Name, or EAN-13 Barcode.",
            "Click row expand (v) to view active batches sorted by Expiry Date (FEFO priority).",
            "Click '+ Add SKU' to create a new master code with live code derivation.",
            "Click 'Adjust Stock' to perform Cloud Function-secured physical cycle count corrections."
        ]
    ))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "Goods Receipt Note (GRN / Inward Invoicing)",
        "Route: /grn",
        "Records supplier deliveries (IFFCO, Bayer, etc.) into warehouse, creates batch documents, and updates authoritative stock.",
        [
            "Select Supplier and Purchase Order (PO).",
            "Enter received Batch Number, Mfg Date, Expiry Date, and Received Quantity.",
            "Upload supplier invoice document (PDF / Photo).",
            "Click 'Confirm & Record GRN' — Cloud Function automatically provisions batches and creates ledger records."
        ]
    ))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "Stock Movements Journal (Immutable Ledger)",
        "Route: /inventory-movements",
        "Auditable, tamper-proof journal recording every single stock delta: Inward, Order Reserve, Dispatch, Return, Damage, Expiry.",
        [
            "Filter movements by type: PURCHASE_RECEIPT, ORDER_RESERVED, RETURN_IN, DAMAGE, ADJUSTMENT.",
            "Check 'Stock Delta' column to see exact before-and-after stock balance for any event."
        ]
    ))
    story.append(PageBreak())

    # ════════════════════ 3. CATALOG & 1-CLICK UPLOAD ════════════════════
    story.append(create_module_header("3. CATALOG & 1-CLICK PRODUCT UPLOAD"))
    story.append(Spacer(1, 8))

    # Pro Tip
    tip_table = Table([[Paragraph("<b>1-Click Auto-Provisioning:</b> Product name, category, and pack size automatically create the 6-segment SKU (CC-III-VVV-GG-SSSUU-BBB), HSN Code, GST% (5%/18%), and initial warehouse batch in one single step!", pro_tip_style)]], colWidths=[515])
    tip_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#fef3c7")),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#fde68a")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(tip_table)
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "1-Click Product Master & Auto-SKU Form",
        "Route: /products",
        "Unified product catalog creation with automatic tax inference and instant multi-collection synchronization.",
        [
            "Click '+ Add New Product'.",
            "Enter Product Name (e.g. 'Urea 50kg Neem Coated'), select Brand ('IFFCO') and Category ('Fertilizers').",
            "Notice: HSN Code (31021010) and GST Rate (5%) auto-fill, and live SKU badge (FE-URE-GRN-00-050KG-IFF) generates.",
            "Enter MRP, Selling Price, Cost Price, and Initial Stock.",
            "Click 'Save Product' — Product doc, SKU Master record, and Initial Batch Ledger are all created simultaneously in 1 click!"
        ]
    ))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "1-Click Bulk Excel / CSV Importer",
        "Route: /products (Bulk Operations)",
        "Upload hundreds of products from a single spreadsheet with automatic SKU generation.",
        [
            "Click '📥 Template' to download the ready-to-use pre-formatted Excel template.",
            "Fill in Product Name, Brand, Category, Pack Size, Unit, MRP, Price, and Stock.",
            "Drag & drop the Excel file into the upload box.",
            "Review parsed rows and click 'Initialize Bulk Sync' — all products, SKUs, and inventory sync in seconds."
        ]
    ))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "Categories, Brands, Crops & Master Data Codes",
        "Route: /categories • /brands • /crops • /master-data",
        "App taxonomy hierarchy, crop-disease tagging, and 2-letter/3-letter master code dictionaries.",
        [
            "Manage Categories & Subcategories with display orders and icons.",
            "Manage Brands directory and official manufacturer logos.",
            "Tag Products with specific Crops (Paddy, Wheat, Sugarcane) so farmers easily find them."
        ]
    ))
    story.append(PageBreak())

    # ════════════════════ 4. LOGISTICS & FLEET ════════════════════
    story.append(create_module_header("4. LOGISTICS & FLEET MANAGEMENT"))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "Riders Management & KYC Verification",
        "Route: /riders",
        "Delivery agent onboarding, Aadhaar/DL verification, bank account details, and vehicle status.",
        [
            "Click '+ Add Rider', enter mobile number, full name, assigned warehouse hub.",
            "Upload KYC documents and approve profile for order assignment."
        ]
    ))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "Live GPS Tracking & Route Trips",
        "Route: /tracking • /trips",
        "Map-based real-time tracking of on-duty delivery agents and multi-order batching trips.",
        [
            "View live map markers of all riders currently delivering parcels.",
            "Use Trips tab to cluster deliveries in the same village/panchayat to save transit time."
        ]
    ))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "Rider Performance, Attendance & SOS Emergency",
        "Route: /rider-performance • /attendance • /sos",
        "Performance scoring, on-time delivery rates, daily shift clock-in, and emergency distress alerts.",
        [
            "Track daily delivery completion metrics and customer ratings per rider.",
            "Monitor SOS alerts for immediate roadside or technical assistance."
        ]
    ))
    story.append(Spacer(1, 8))

    # ════════════════════ 5. ERP, TAX & FINANCE ════════════════════
    story.append(create_module_header("5. ERP, TAX & FINANCE"))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "Unit Economics (P&L per Order)",
        "Route: /unit-economics",
        "Micro-level margin analysis per delivered order: Selling Price - Landing Cost - Delivery Cost - Packaging = Net Profit.",
        [
            "Check Gross Margin % and Net Margin % across categories and product lines."
        ]
    ))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "GST & Tax Filing Reports (GSTR-1 / GSTR-3B)",
        "Route: /gst-reports",
        "CA-ready monthly GST export with HSN-wise tax breakdown (0%, 5%, 12%, 18%).",
        [
            "Select filing month (e.g. August 2026).",
            "Click 'Export GSTR-1 Excel' to download government-compliant filing sheets."
        ]
    ))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "Rider Payouts & COD Cash Reconciliation",
        "Route: /payouts • /reconciliation",
        "Weekly delivery earnings disbursement and Cash-on-Delivery physical cash settlement.",
        [
            "Calculate per-order commission and trigger bank transfer exports.",
            "Reconcile daily cash collected by riders against warehouse counter receipts."
        ]
    ))
    story.append(PageBreak())

    # ════════════════════ 6. MARKETING & 7. INTELLIGENCE ════════════════════
    story.append(create_module_header("6. GROWTH & MARKETING • 7. INTELLIGENCE & SECURITY"))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "Home Screen Banners & Push Notifications",
        "Route: /banners • /notifications",
        "Seasonal discount banners (Kharif/Rabi campaigns) and instant broadcast notifications to farmers.",
        [
            "Upload 1200x600 px banner, link to specific product or category, and click Publish.",
            "Send broadcast notifications with weather advisories or flash sales."
        ]
    ))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "AI Demand Control Room & Supervisor",
        "Route: /ai-control",
        "Machine learning demand forecasting based on weather, pest alerts, and crop seasonality.",
        [
            "View 15-day stock demand forecasts to prevent stockouts during peak sowing seasons."
        ]
    ))
    story.append(Spacer(1, 8))

    story.append(create_feature_card(
        "Role-Based Access (RBAC), Audit Logs & Global Settings",
        "Route: /staff • /audit-logs • /settings",
        "Warehouse employee access control, immutable security audit logs, and global ERP configuration.",
        [
            "Assign roles: SuperAdmin (full), OrderManager (orders/riders), CatalogManager (products/SKU), Viewer (read-only).",
            "Audit Logs record exact timestamp and admin email for every create/update/delete operation.",
            "Settings manage warehouse address, delivery radius, support numbers, and business policies."
        ]
    ))
    story.append(Spacer(1, 15))

    # Standard SKU Nomenclature Reference Table
    sku_ref_header = ParagraphStyle('SKURefH', fontName='Helvetica-Bold', fontSize=9, textColor=primary_green)
    sku_ref_cell = ParagraphStyle('SKURefC', fontName='Helvetica', fontSize=8, leading=10, textColor=text_dark)
    sku_code_style = ParagraphStyle('SKURefCode', fontName='Courier-Bold', fontSize=8, textColor=primary_green)

    sku_table_data = [
        [Paragraph("<b>Segment</b>", sku_ref_header), Paragraph("<b>Meaning</b>", sku_ref_header), Paragraph("<b>Example</b>", sku_ref_header), Paragraph("<b>Standard Codes</b>", sku_ref_header)],
        [Paragraph("<b>CC</b>", sku_code_style), Paragraph("Category (2 Char)", sku_ref_cell), Paragraph("FE, PE, SE, EQ", sku_ref_cell), Paragraph("FE=Fertilizer, PE=Pesticide, SE=Seeds, EQ=Equipment", sku_ref_cell)],
        [Paragraph("<b>III</b>", sku_code_style), Paragraph("Item (3 Char)", sku_ref_cell), Paragraph("URE, DAP, COR", sku_ref_cell), Paragraph("URE=Urea, DAP=Di-Ammonium Phosphate, COR=Coragen", sku_ref_cell)],
        [Paragraph("<b>VVV</b>", sku_code_style), Paragraph("Variety (3 Char)", sku_ref_cell), Paragraph("GRN, HYB, STD", sku_ref_cell), Paragraph("GRN=Granular, HYB=Hybrid, STD=Standard", sku_ref_cell)],
        [Paragraph("<b>GG</b>", sku_code_style), Paragraph("Grade (2 Char)", sku_ref_cell), Paragraph("46, A1, 00", sku_ref_cell), Paragraph("46=46% Nitrogen, A1=Premium Grade", sku_ref_cell)],
        [Paragraph("<b>SSSUU</b>", sku_code_style), Paragraph("Pack Size + Unit (5 Char)", sku_ref_cell), Paragraph("050KG, 500ML", sku_ref_cell), Paragraph("050+KG=50 Kilogram, 500+ML=500 Millilitre", sku_ref_cell)],
        [Paragraph("<b>BBB</b>", sku_code_style), Paragraph("Brand (3 Char)", sku_ref_cell), Paragraph("IFF, BAY, FMC", sku_ref_cell), Paragraph("IFF=IFFCO, BAY=Bayer, FMC=FMC Chemicals", sku_ref_cell)],
    ]
    sku_table = Table(sku_table_data, colWidths=[65, 120, 110, 220])
    sku_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('BOX', (0, 0), (-1, -1), 1, border_color),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, border_color),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(Paragraph("<b>Appendix: Standard 6-Segment Agri SKU Architecture Reference</b>", bold_label))
    story.append(Spacer(1, 4))
    story.append(sku_table)

    # Build Document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated: {filename}")

if __name__ == "__main__":
    build_pdf()
