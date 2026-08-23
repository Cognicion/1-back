function normalizarMimePreview(valor = "") {
  return String(valor || "").split(";", 1)[0].trim().toLowerCase();
}

function obtenerExtensionPreview(item = {}) {
  const declarada = String(item.extension || "").trim().toLowerCase();
  if (/^\.[a-z0-9]{1,12}$/u.test(declarada)) return declarada;
  const nombre = String(item.originalName || item.name || "").replace(/\\/gu, "/").split("/").pop() || "";
  const posicion = nombre.lastIndexOf(".");
  return posicion > 0 ? nombre.slice(posicion).toLowerCase() : "";
}

export function resolverTipoPreviewCloud(item = {}) {
  const mimeType = normalizarMimePreview(item.mimeType || item.typeMime);
  const extension = obtenerExtensionPreview(item);

  // La identidad PDF tiene prioridad para impedir que metadata antigua
  // text/plain convierta el binario mediante Blob.text().
  if (mimeType === "application/pdf" || extension === ".pdf") return "pdf";
  if (mimeType.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension)) return "image";
  if (["text/plain", "text/markdown"].includes(mimeType) || [".txt", ".md"].includes(extension)) return "text";
  return "";
}

export function prepararBlobParaPreview(blob, kind) {
  if (!blob || typeof blob.slice !== "function") throw new TypeError("Se necesita un Blob para la vista previa.");
  if (kind !== "pdf" || normalizarMimePreview(blob.type) === "application/pdf") return blob;
  return blob.slice(0, blob.size, "application/pdf");
}

export function crearObjectUrlPreview(blob, { createObjectURL = URL.createObjectURL.bind(URL) } = {}) {
  if (!blob || typeof blob.size !== "number") throw new TypeError("Se necesita un Blob para crear la URL privada.");
  if (typeof createObjectURL !== "function") throw new TypeError("Object URL no está disponible en este navegador.");
  return createObjectURL(blob);
}

