import ExcelJS from "exceljs";

self.onmessage = async (e) => {
  try {
    const { fileBuffer } = e.data;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      self.postMessage({ success: true, rows: [] });
      return;
    }
    const headers = worksheet.getRow(1).values.slice(1).map((h) => String(h ?? ""));
    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = row.values.slice(1);
      const parsedRow = {};
      headers.forEach((header, index) => {
        let cellValue = values[index];
        if (cellValue && typeof cellValue === "object") {
          cellValue = cellValue.result ?? cellValue.text ?? "";
        }
        parsedRow[header] = cellValue ?? "";
      });
      rows.push(parsedRow);
    });
    self.postMessage({ success: true, rows });
  } catch (error) {
    self.postMessage({ success: false, error: error.message });
  }
};
