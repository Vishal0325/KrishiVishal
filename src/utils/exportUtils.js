import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * Exports JSON data to an Excel (.xlsx) file
 * @param {Array<Object>} data Array of objects to export
 * @param {String} fileName Name of the output file (without extension)
 * @param {String} sheetName Name of the worksheet
 */
export const exportToExcel = async (data, fileName = 'Export', sheetName = 'Data') => {
  if (!data || data.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Extract columns from the first object
  const firstItem = data[0];
  const columns = Object.keys(firstItem).map(key => {
    const headerTitle = key.includes(' ')
      ? key
      : key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, str => str.toUpperCase());

    return {
      header: headerTitle,
      key: key,
      width: Math.max(headerTitle.length + 5, 20)
    };
  });

  worksheet.columns = columns;

  // Add Data
  worksheet.addRows(data);

  // Style Header Row
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1B5E20' }
  };
  worksheet.getRow(1).height = 24;
  worksheet.getRow(1).alignment = { vertical: 'middle' };

  // Generate File
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`;
  anchor.click();
  window.URL.revokeObjectURL(url);
};

/**
 * Exports JSON data to a CSV file
 * @param {Array<Object>} data Array of objects to export
 * @param {String} fileName Name of the output file (without extension)
 */
export const exportToCSV = (data, fileName = 'Export') => {
  if (!data || data.length === 0) return;

  const headers = Object.keys(data[0]);
  const formattedHeaders = headers.map(key => 
    key.includes(' ') ? key : key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, str => str.toUpperCase())
  );
  
  const csvRows = [];
  csvRows.push(formattedHeaders.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','));

  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header] !== undefined && row[header] !== null ? row[header] : '';
      return `"${String(val).replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  }

  const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${fileName}_${new Date().toISOString().split('T')[0]}.csv`;
  anchor.click();
  window.URL.revokeObjectURL(url);
};

/**
 * Exports JSON data to a formatted PDF
 * @param {Array<Object>} data Array of objects to export
 * @param {String} fileName Name of the output file
 * @param {String} title Title displayed inside the PDF
 */
export const exportToPDF = (data, fileName = 'Export', title = 'Document Report') => {
  if (!data || data.length === 0) return;

  const doc = new jsPDF('landscape');
  
  // Title
  doc.setFontSize(18);
  doc.text(title, 14, 15);
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);

  // Table Data
  const headers = Object.keys(data[0]).map(key => key.replace(/([A-Z])/g, ' $1').toUpperCase());
  const rows = data.map(obj => Object.values(obj).map(val => val !== null && val !== undefined ? val.toString() : ''));

  doc.autoTable({
    startY: 30,
    head: [headers],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [76, 175, 80] },
    styles: { fontSize: 8 },
  });

  doc.save(`${fileName}_${new Date().toISOString().split('T')[0]}.pdf`);
};
