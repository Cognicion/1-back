import { DOCX_IMPORT_CONFIG } from "../../importacionDocx/docxImportConfig.js";

const ZIP_SIGNATURE = "504b0304";

function extensionOf(fileName = "") {
  const name = String(fileName || "");
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

async function readSignature(file) {
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function validateTransferDocxFile(file, config = DOCX_IMPORT_CONFIG) {
  const errors = [];
  if (!file) return { valid: false, errors: ["Selecciona un archivo DOCX."] };

  if (!config.allowedExtensions.includes(extensionOf(file.name))) {
    errors.push("Formato no permitido. Solo se aceptan archivos .docx.");
  }

  if (!config.allowedMimeTypes.includes(file.type || "")) {
    errors.push("El MIME del archivo no corresponde a DOCX.");
  }

  if (file.size <= 0) errors.push("El archivo esta vacio.");
  if (file.size > config.maxFileSizeBytes) {
    errors.push(`El archivo supera el tamano maximo de ${Math.round(config.maxFileSizeBytes / 1024 / 1024)} MB.`);
  }

  if (!errors.length) {
    const signature = await readSignature(file);
    if (signature !== ZIP_SIGNATURE) errors.push("La firma real del archivo no corresponde a un DOCX valido.");
  }

  return { valid: errors.length === 0, errors };
}
