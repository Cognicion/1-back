"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { validateStoredContent } = require("../cloudStorage/contentValidation");
const {
  buildStoragePath,
  deriveStableId,
  normalizeNameForIndex,
  parseStoragePath,
  validateFileDescriptor,
  validateRenameForItem
} = require("../cloudStorage/validation");

test("extensión y MIME se validan como pareja exacta", () => {
  const descriptor = validateFileDescriptor({
    mimeType: "application/pdf",
    name: "Artículo.PDF",
    originalName: "Artículo.PDF",
    sizeBytes: 1024
  });
  assert.equal(descriptor.extension, "pdf");
  assert.equal(descriptor.mimeType, "application/pdf");

  assert.throws(() => validateFileDescriptor({
    mimeType: "application/pdf",
    name: "imagen.png",
    originalName: "imagen.png",
    sizeBytes: 20
  }), (error) => error.code === "invalid-argument");

  assert.throws(() => validateFileDescriptor({
    mimeType: "application/javascript",
    name: "script.js",
    originalName: "script.js",
    sizeBytes: 20
  }), (error) => error.code === "invalid-argument");
});

test("los identificadores estables hacen idempotente una reserva sin aceptar IDs de otro usuario", () => {
  const first = deriveStableId("uid_A", "request-1234", "file");
  assert.equal(first, deriveStableId("uid_A", "request-1234", "file"));
  assert.notEqual(first, deriveStableId("uid_B", "request-1234", "file"));
  assert.match(first, /^file_[a-f0-9]{32}$/);
});

test("la ruta canónica se analiza solamente bajo mi-nube/{uid}/files", () => {
  const path = buildStoragePath("uid_A", "file_123", "memoria.pdf");
  assert.deepEqual(parseStoragePath(path), {
    uid: "uid_A",
    fileId: "file_123",
    filename: "memoria.pdf",
    storagePath: path
  });
  assert.equal(parseStoragePath("usuarios/uid_A/memoria.pdf"), null);
  assert.equal(parseStoragePath("mi-nube/uid_B/files/file_123/sub/cosa.pdf"), null);
});

test("renombrar conserva la extensión física aunque la ruta permanezca inmutable", () => {
  const item = { extension: "md", type: "file" };
  assert.equal(validateRenameForItem(item, "Nuevo título.md"), "Nuevo título.md");
  assert.throws(() => validateRenameForItem(item, "Nuevo título.html"), (error) => error.code === "invalid-argument");
});

test("nameNormalized coincide con la normalización estable usada para ordenar", () => {
  assert.equal(normalizeNameForIndex("  ÁRBOL   clínico.PDF  "), "arbol clinico.pdf");
  const serviceSource = readFileSync(join(__dirname, "../cloudStorage/service.js"), "utf8");
  assert.match(serviceSource, /nameNormalized: normalizeNameForIndex\(reservation\.name\)/);
  assert.match(serviceSource, /nameNormalized: normalizeNameForIndex\(name\)/);
  assert.match(serviceSource, /transaction\.update\(reference, \{ name, nameNormalized,/);
});

function fakeFile(buffer) {
  return {
    async download() { return [Buffer.from(buffer)]; },
    createReadStream() { return Readable.from([Buffer.from(buffer)]); }
  };
}

test("la validación de contenido reconoce PDF, imágenes y texto UTF-8", async () => {
  await assert.doesNotReject(validateStoredContent(fakeFile("%PDF-1.7\n"), { extension: "pdf" }));
  await assert.doesNotReject(validateStoredContent(fakeFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), { extension: "jpg" }));
  await assert.doesNotReject(validateStoredContent(fakeFile("# Apunte\ncontenido"), { extension: "md" }));
  await assert.rejects(validateStoredContent(fakeFile("MZ ejecutable"), { extension: "pdf" }), (error) => error.details?.rejectUpload === true);
  await assert.rejects(validateStoredContent(fakeFile(Buffer.from([0x61, 0x00, 0x62])), { extension: "txt" }), (error) => error.details?.rejectUpload === true);
});

test("un fallo transitorio al leer texto se propaga para permitir el retry del trigger", async () => {
  const transientError = Object.assign(new Error("stream interrupted"), { code: "ECONNRESET" });
  const file = {
    createReadStream() {
      return Readable.from((async function* interruptedStream() {
        yield Buffer.from("contenido válido", "utf8");
        throw transientError;
      }()));
    }
  };

  await assert.rejects(validateStoredContent(file, { extension: "txt" }), (error) => error === transientError);
  await assert.rejects(
    validateStoredContent(fakeFile(Buffer.from([0xc3, 0x28])), { extension: "md" }),
    (error) => error.details?.rejectUpload === true && error.details?.reason === "content-signature"
  );
});
