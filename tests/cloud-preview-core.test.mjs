import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  crearObjectUrlPreview,
  prepararBlobParaPreview,
  resolverTipoPreviewCloud
} from "../js/cloud-preview-core.js";

test("un PDF conserva prioridad sobre un MIME textual incorrecto", () => {
  assert.equal(resolverTipoPreviewCloud({
    name: "informe.pdf",
    extension: ".pdf",
    mimeType: "text/plain"
  }), "pdf");
  assert.equal(resolverTipoPreviewCloud({
    name: "informe",
    mimeType: "application/pdf; charset=binary"
  }), "pdf");
});

test("el preview PDF usa Object URL con Blob application/pdf y nunca necesita texto", () => {
  const binario = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], {
    type: "text/plain"
  });
  const pdf = prepararBlobParaPreview(binario, "pdf");
  let recibido = null;
  const url = crearObjectUrlPreview(pdf, {
    createObjectURL(blob) {
      recibido = blob;
      return "blob:pdf-privado";
    }
  });

  assert.equal(url, "blob:pdf-privado");
  assert.equal(recibido, pdf);
  assert.equal(pdf.type, "application/pdf");
  assert.equal(pdf.size, 5);
});

test("los tipos de texto e imagen conservan su clasificación", () => {
  assert.equal(resolverTipoPreviewCloud({ name: "foto.webp", mimeType: "image/webp" }), "image");
  assert.equal(resolverTipoPreviewCloud({ name: "nota.md", mimeType: "text/markdown" }), "text");
  assert.equal(resolverTipoPreviewCloud({ name: "otro.bin", mimeType: "application/octet-stream" }), "");
});

test("el controlador revoca al cambiar o cerrar y conserva descarga y fallback", () => {
  const servicio = readFileSync(new URL("../js/services/cloudPreviewService.js", import.meta.url), "utf8");
  const controlador = readFileSync(new URL("../js/mi-nube.js", import.meta.url), "utf8");

  assert.match(servicio, /if \(kind === "text"\)[\s\S]*await blob\.text\(\)/);
  assert.match(servicio, /if \(kind === "pdf"\)[\s\S]*crearObjectUrlPreview\(previewBlob\)/);
  assert.match(controlador, /async function previewItem\(item\)[\s\S]*revokeCloudPreviewUrl\(\)/);
  assert.match(controlador, /cloudPreviewDialog\?\.addEventListener\("close"[\s\S]*revokeCloudPreviewUrl\(\)/);
  assert.match(controlador, /document\.createElement\("iframe"\)/);
  assert.match(controlador, /No fue posible previsualizar este PDF\./);
  assert.match(controlador, /download\.textContent = "Descargar archivo"/);
  assert.match(controlador, /downloadPrivateCloudFile\(item\)/);
});
