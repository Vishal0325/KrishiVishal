import ExcelJS from "exceljs";

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
}

export function createWorksheetFromJson(workbook, data, name) {
  const worksheet = workbook.addWorksheet(name);
  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  worksheet.columns = headers.map((header) => ({
    header,
    key: header,
  }));
  if (data.length > 0) {
    worksheet.addRows(data);
  }
  return worksheet;
}

export async function readWorksheetAsJson(file) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers = worksheet.getRow(1).values.slice(1).map((header) => String(header ?? ""));
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values.slice(1);
    const parsedRow = {};
    headers.forEach((header, index) => {
      const cellValue = values[index];
      if (cellValue && typeof cellValue === "object" && "result" in cellValue) {
        parsedRow[header] = cellValue.result ?? "";
      } else if (cellValue && typeof cellValue === "object" && "text" in cellValue) {
        parsedRow[header] = cellValue.text ?? "";
      } else {
        parsedRow[header] = cellValue ?? "";
      }
    });
    rows.push(parsedRow);
  });
  return rows;
}
