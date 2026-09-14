const fs = require('fs');
// NOTE: Require 'pdfkit' to run this script: npm install pdfkit
const PDFDocument = require('pdfkit');

function buildPdf(filename = "KrishiVishal_Admin_User_Manual_2026-09-02.pdf") {
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(fs.createWriteStream(filename));

  // Colors
  const primaryGreen = "#14532d";
  const emeraldDark = "#166534";
  const textDark = "#0f172a";
  const textMuted = "#475569";

  // Cover Page
  doc.moveDown(2);
  doc.fontSize(10).fillColor(emeraldDark).text("KRISHIVISHAL ERP 2.0 • OFFICIAL USER MANUAL", { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(24).fillColor(primaryGreen).text("KrishiVishal Admin Portal\nComplete Operations & User Manual", { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor(textMuted).text("Complete Step-by-Step Guide for Every Module, Option & 1-Click Feature", { align: 'left' });
  
  doc.moveDown(2);
  doc.moveTo(40, doc.y).lineTo(550, doc.y).strokeColor(emeraldDark).lineWidth(3).stroke();
  doc.moveDown(2);

  // Meta Data
  doc.fontSize(10).fillColor(textDark);
  doc.text("DOCUMENT DATE: 02 September 2026");
  doc.text("PLATFORM: Web Admin ERP (Firebase)");
  doc.text("LIVE URL: https://krishivishal-a9ed7.web.app");
  doc.text("TARGET ROLES: SuperAdmin, Warehouse, Ops");

  doc.moveDown(2);

  // Summary
  doc.fontSize(12).fillColor(primaryGreen).text("Table of Contents / Index (7 Core Sections):");
  doc.fontSize(10).fillColor(textDark);
  doc.text("1. Dashboard & Orders Pipeline");
  doc.text("2. Supply Chain & Stock");
  doc.text("3. Catalog & 1-Click Upload");
  doc.text("4. Logistics & Fleet");
  doc.text("5. ERP, Tax & Finance");
  doc.text("6. Growth & Marketing");
  doc.text("7. AI & Governance");

  doc.addPage();
  doc.fontSize(16).fillColor(primaryGreen).text("1. DASHBOARD & OPERATIONS");
  doc.fontSize(10).fillColor(textDark).text("Executive Live Dashboard - Route: /");
  doc.text("Real-time overview of business KPIs: Today's revenue, active orders pipeline, low stock warnings, rider fleet status, and urgent support tickets.");

  // Add more content sections as needed following the same pattern
  doc.addPage();
  doc.fontSize(12).fillColor(primaryGreen).text("Appendix: Standard 6-Segment Agri SKU Architecture Reference");
  doc.fontSize(10).fillColor(textDark);
  doc.text("CC - Category (2 Char)");
  doc.text("III - Item (3 Char)");
  doc.text("VVV - Variety (3 Char)");
  doc.text("GG - Grade (2 Char)");
  doc.text("SSSUU - Pack Size + Unit (5 Char)");
  doc.text("BBB - Brand (3 Char)");

  doc.end();
  console.log(`Successfully generated: ${filename}`);
}

buildPdf();
