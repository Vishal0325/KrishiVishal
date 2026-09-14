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

export function readWorksheetAsJson(file) {
  return new Promise(async (resolve, reject) => {
    try {
      const worker = new Worker(new URL('../workers/excelWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        if (e.data.success) resolve(e.data.rows);
        else reject(new Error(e.data.error));
        worker.terminate();
      };
      worker.onerror = (e) => {
        reject(e);
        worker.terminate();
      };
      const arrayBuffer = await file.arrayBuffer();
      worker.postMessage({ fileBuffer: arrayBuffer }, [arrayBuffer]);
    } catch (err) {
      reject(err);
    }
  });
}
