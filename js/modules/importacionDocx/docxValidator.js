import { DOCX_IMPORT_CONFIG } from "./docxImportConfig.js";

export function validarArchivoDocx(file, config = DOCX_IMPORT_CONFIG) {
  if (!file) {
    return { valido: false, errores: ["Selecciona un archivo DOCX."] };
  }

  const nombre = String(file.name || "");
  const extension = nombre.slice(nombre.lastIndexOf(".")).toLowerCase();
  const errores = [];

  if (!config.allowedExtensions.includes(extension)) {
    errores.push("Solo se permiten archivos .docx.");
  }

  if (!config.allowedMimeTypes.includes(file.type || "")) {
    errores.push("El tipo de archivo no corresponde a un documento DOCX.");
  }

  if (file.size > config.maxFileSizeBytes) {
    errores.push(`El archivo supera el tamano maximo permitido de ${Math.round(config.maxFileSizeBytes / 1024 / 1024)} MB.`);
  }

  if (file.size <= 0) {
    errores.push("El archivo esta vacio.");
  }

  return { valido: errores.length === 0, errores };
}

export async function calcularHashArchivo(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
