import { getPrivateCloudBlob } from "./cloudFilesService.js";

export const CLOUD_PREVIEW_LIMITS = Object.freeze({
  image: 32 * 1024 * 1024,
  pdf: 64 * 1024 * 1024,
  text: 2 * 1024 * 1024
});

const activeObjectUrls = new Set();

export function revokeCloudPreviewUrl(objectUrl = "") {
  if (objectUrl) {
    if (activeObjectUrls.delete(objectUrl)) URL.revokeObjectURL(objectUrl);
    return;
  }
  activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  activeObjectUrls.clear();
}

export async function loadCloudPreview(item) {
  const mimeType = String(item?.mimeType || "").toLowerCase();
  const kind = mimeType.startsWith("text/") ? "text" : mimeType.startsWith("image/") ? "image" : mimeType === "application/pdf" ? "pdf" : "";
  if (!kind) throw new Error("Este tipo de archivo no tiene vista previa disponible.");
  const maxBytes = CLOUD_PREVIEW_LIMITS[kind];
  if (Number(item?.sizeBytes) > maxBytes) {
    const error = new Error("El archivo es demasiado grande para previsualizarlo de forma segura. Puedes descargarlo.");
    error.code = "cloud-preview/file-too-large";
    error.details = { maxBytes };
    throw error;
  }
  const blob = await getPrivateCloudBlob(item.storagePath, maxBytes);
  const resolvedMimeType = mimeType || blob.type || "application/octet-stream";
  if (resolvedMimeType.startsWith("text/")) {
    return { kind: resolvedMimeType === "text/markdown" ? "markdown" : "text", text: await blob.text(), mimeType: resolvedMimeType };
  }
  const objectUrl = URL.createObjectURL(blob);
  activeObjectUrls.add(objectUrl);
  if (resolvedMimeType.startsWith("image/")) return { kind: "image", url: objectUrl, mimeType: resolvedMimeType };
  if (resolvedMimeType === "application/pdf") return { kind: "pdf", url: objectUrl, mimeType: resolvedMimeType };
  revokeCloudPreviewUrl(objectUrl);
  throw new Error("Este tipo de archivo no tiene vista previa disponible.");
}
