import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { formatCurrency, formatDate } from "../formatters";

/**
 * Generates a professional PDF Expense Report
 */
export const generateExpenseReportPDF = (expenses, title = "Expense Report") => {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("KrishiVishal", 14, 20);

  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text(title, 14, 30);

  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 38);

  // Summary Stats
  const total = expenses.reduce((sum, e) => sum + (e.totalAmountMinor || 0), 0) / 100;
  doc.setFont("helvetica", "bold");
  doc.text(`Total Volume: ${formatCurrency(total)}`, 14, 50);
  doc.text(`Expense Count: ${expenses.length}`, 14, 55);

  // Table
  const tableColumn = ["Date", "Expense No", "Category", "Vendor", "Amount", "Status"];
  const tableRows = [];

  expenses.forEach(e => {
    const expenseData = [
      formatDate(e.expenseDate),
      e.expenseNumber,
      e.categoryName,
      e.vendorName || 'Self',
      formatCurrency(e.totalAmountMinor / 100),
      e.approvalStatus
    ];
    tableRows.push(expenseData);
  });

  doc.autoTable({
    head: [tableColumn],
    body: tableRows,
    startY: 65,
    theme: 'grid',
    headStyles: { fillColor: [27, 94, 32], fontSize: 9 }, // KrishiVishal Green
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 245, 245] }
  });

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for(let i = 1; i <= pageCount; i++) {
     doc.setPage(i);
     doc.setFontSize(8);
     doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10);
  }

  doc.save(`KrishiVishal_Report_${Date.now()}.pdf`);
};
