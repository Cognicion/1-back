const COLUMNAS = ["Frase", "Frase normalizada", "Frecuencia total", "Número de notas", "Número de pacientes", "Número de médicos", "Primera aparición", "Última aparición", "Número de palabras"];
const escCsv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const filasPlanos = (filas = []) => [COLUMNAS, ...filas.map((f) => [f.phrase, f.normalizedPhrase, f.frequency, f.noteCount, f.patientCount, f.physicianCount, f.firstSeenAt || "", f.lastSeenAt || "", f.tokenCount])];

export function exportarPatronesCsv(filas = []) {
  const contenido = "\uFEFF" + filasPlanos(filas).map((fila) => fila.map(escCsv).join(",")).join("\r\n");
  descargar(new Blob([contenido], { type: "text/csv;charset=utf-8" }), "patrones-texto.csv");
}

function xmlEscape(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function u16(value) { return [value & 255, (value >>> 8) & 255]; }
function u32(value) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }
function zipStore(files) {
  const encoder = new TextEncoder(); const chunks = []; const central = []; let offset = 0;
  files.forEach(([name, content]) => { const nameBytes = encoder.encode(name); const data = encoder.encode(content); const crc = crc32(data); const local = new Uint8Array([0x50,0x4b,0x03,0x04,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(nameBytes.length),0,0,...nameBytes,...data]); chunks.push(local); central.push(new Uint8Array([0x50,0x4b,0x01,0x02,20,0,20,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(nameBytes.length),0,0,0,0,0,0,0,0,0,0,...u32(offset),...nameBytes])); offset += local.length; });
  const centralBytes = central.reduce((total, item) => total + item.length, 0); const directory = new Uint8Array(centralBytes); let cursor = 0; central.forEach((item) => { directory.set(item, cursor); cursor += item.length; });
  const end = new Uint8Array([0x50,0x4b,0x05,0x06,0,0,0,0,...u16(files.length),...u16(files.length),...u32(directory.length),...u32(offset),0,0]);
  return new Blob([...chunks, directory, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function xlsxXml(filas) { const rows = filas.map((fila, r) => `<row r="${r + 1}">${fila.map((value, c) => `<c r="${String.fromCharCode(65 + Math.min(c, 25))}${r + 1}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`).join("")}</row>`).join(""); return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`; }
export function exportarPatronesExcel(filas = []) {
  const files = [["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`], ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`], ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Patrones" sheetId="1" r:id="rId1"/></sheets></workbook>`], ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`], ["xl/worksheets/sheet1.xml", xlsxXml(filasPlanos(filas))]];
  descargar(zipStore(files), "patrones-texto.xlsx");
}
function descargar(blob, nombre) { const url = URL.createObjectURL(blob); const enlace = document.createElement("a"); enlace.href = url; enlace.download = nombre; enlace.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
