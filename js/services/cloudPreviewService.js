import { getPrivateCloudBlob } from "./cloudFilesService.js";
import {
  crearObjectUrlPreview,
  prepararBlobParaPreview,
  resolverTipoPreviewCloud
} from "../cloud-preview-core.js?v=20260822-mi-nube-v2-090";

export const CLOUD_PREVIEW_LIMITS = Object.freeze({
  image: 32 * 1024 * 1024,
  pdf: 64 * 1024 * 1024,
  text: 2 * 1024 * 1024
});

const activeObjectUrls = new Map();

function tracePdf(event, { mimeType = "application/pdf", sizeBytes = 0 } = {}) {
  console.info("[MiNube][PreviewPDF]", event, {
    mimeType: String(mimeType || "application/pdf"),
    sizeBytes: Number(sizeBytes) || 0
  });
}

export function revokeCloudPreviewUrl(objectUrl = "") {
  if (objectUrl) {
    const metadata = activeObjectUrls.get(objectUrl);
    if (activeObjectUrls.delete(objectUrl)) {
      URL.revokeObjectURL(objectUrl);
      if (metadata?.kind === "pdf") tracePdf("Object URL revocada", metadata);
    }
    return;
  }
  [...activeObjectUrls.keys()].forEach((url) => revokeCloudPreviewUrl(url));
}

export async function loadCloudPreview(item) {
  const mimeType = String(item?.mimeType || "").toLowerCase();
  const kind = resolverTipoPreviewCloud(item);
  if (!kind) throw new Error("Este tipo de archivo no tiene vista previa disponible.");
  const maxBytes = CLOUD_PREVIEW_LIMITS[kind];
  if (Number(item?.sizeBytes) > maxBytes) {
    const error = new Error("El archivo es demasiado grande para previsualizarlo de forma segura. Puedes descargarlo.");
    error.code = "cloud-preview/file-too-large";
    error.details = { maxBytes };
    throw error;
  }
  if (kind === "pdf") {
    tracePdf("Solicitando Blob privado", {
      mimeType: mimeType || "application/pdf",
      sizeBytes: item?.sizeBytes
    });
  }
  const blob = await getPrivateCloudBlob(item.storagePath, maxBytes);
  if (kind === "text") {
    const resolvedMimeType = mimeType || blob.type || "text/plain";
    return { kind: resolvedMimeType === "text/markdown" ? "markdown" : "text", text: await blob.text(), mimeType: resolvedMimeType };
  }

  const previewBlob = prepararBlobParaPreview(blob, kind);
  const resolvedMimeType = kind === "pdf" ? "application/pdf" : (mimeType || previewBlob.type || "application/octet-stream");
  const objectUrl = crearObjectUrlPreview(previewBlob);
  activeObjectUrls.set(objectUrl, {
    kind,
    mimeType: resolvedMimeType,
    sizeBytes: previewBlob.size
  });
  if (kind === "pdf") {
    tracePdf("Object URL creada", { mimeType: resolvedMimeType, sizeBytes: previewBlob.size });
    return { kind: "pdf", url: objectUrl, mimeType: resolvedMimeType, sizeBytes: previewBlob.size };
  }
  if (kind === "image") return { kind: "image", url: objectUrl, mimeType: resolvedMimeType, sizeBytes: previewBlob.size };
  revokeCloudPreviewUrl(objectUrl);
  throw new Error("Este tipo de archivo no tiene vista previa disponible.");
}
