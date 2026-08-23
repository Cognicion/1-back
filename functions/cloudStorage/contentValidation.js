"use strict";

const { TextDecoder } = require("node:util");
const { fail } = require("./errors");

const PDF_HEADER = Buffer.from("%PDF-", "ascii");
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function startsWith(buffer, expected) {
  return buffer.length >= expected.length && buffer.subarray(0, expected.length).equals(expected);
}

function rejectContent(message) {
  fail("failed-precondition", message, { rejectUpload: true, reason: "content-signature" });
}

async function readPrefix(file, maxBytes = 65536) {
  const [buffer] = await file.download({ start: 0, end: Math.max(0, maxBytes - 1) });
  return buffer;
}

async function validateTextStream(file) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const stream = file.createReadStream();
  for await (const chunk of stream) {
    if (chunk.includes(0)) rejectContent("El archivo de texto contiene datos binarios no permitidos.");
    try {
      decoder.decode(chunk, { stream: true });
    } catch (_) {
      rejectContent("El archivo de texto no contiene UTF-8 válido.");
    }
  }
  try {
    decoder.decode();
  } catch (_) {
    rejectContent("El archivo de texto no contiene UTF-8 válido.");
  }
}

function validateImageHeader(extension, prefix) {
  if ((extension === "jpg" || extension === "jpeg") && prefix.length >= 3
    && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) return;
  if (extension === "png" && startsWith(prefix, PNG_HEADER)) return;
  if (extension === "gif") {
    const header = prefix.subarray(0, 6).toString("ascii");
    if (header === "GIF87a" || header === "GIF89a") return;
  }
  if (extension === "webp" && prefix.length >= 12
    && prefix.subarray(0, 4).toString("ascii") === "RIFF"
    && prefix.subarray(8, 12).toString("ascii") === "WEBP") return;
  rejectContent("La firma del archivo de imagen no coincide con su extensión.");
}

async function validateStoredContent(file, descriptor) {
  const extension = String(descriptor?.extension || "").toLowerCase();
  if (extension === "txt" || extension === "md") {
    await validateTextStream(file);
    return { validated: true, validation: "utf8-stream" };
  }

  const prefix = await readPrefix(file);
  if (extension === "pdf") {
    const headerOffset = prefix.indexOf(PDF_HEADER);
    if (headerOffset < 0 || headerOffset > 1024) rejectContent("El archivo no contiene una cabecera PDF válida.");
    return { validated: true, validation: "pdf-header" };
  }

  validateImageHeader(extension, prefix);
  return { validated: true, validation: "image-header" };
}

module.exports = {
  validateStoredContent
};
