import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { crearDocumentoWordFray, nombreSeguroNotaWord } from "../services/frayDocx.js";

function entradasZipSinCompresion(bytes) {
  const decoder = new TextDecoder();
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entradas = new Map();
  let offset = 0;
  while (offset + 30 <= bytes.length && vista.getUint32(offset, true) === 0x04034b50) {
    const longitudNombre = vista.getUint16(offset + 26, true);
    const longitudExtra = vista.getUint16(offset + 28, true);
    const longitudContenido = vista.getUint32(offset + 18, true);
    const inicioNombre = offset + 30;
    const inicioContenido = inicioNombre + longitudNombre + longitudExtra;
    const nombre = decoder.decode(bytes.slice(inicioNombre, inicioNombre + longitudNombre));
    entradas.set(nombre, bytes.slice(inicioContenido, inicioContenido + longitudContenido));
    offset = inicioContenido + longitudContenido;
  }
  return entradas;
}

const datosBase = {
  titulo: "NOTA DE EVOLUCIÓN AL SERVICIO DE OBSERVACIÓN",
  servicio: "Observación",
  fechaHora: "16/07/2026 12:30",
  estadoNota: "borrador",
  paciente: {
    nombre: "María José García Ñúñez",
    expediente: "EXP-1",
    fechaNacimiento: "01/02/1990",
    edad: 36,
    sexo: "Femenino",
    cama: "12"
  },
  medico: { nombre: "Dra. Ana Pérez", cedula: "123456" },
  diagnosticos: [{ codigo: "F32.1", diagnostico: "Episodio depresivo moderado" }],
  firmas: [{ nombre: "Dra. Ana Pérez", cargo: "Médica adscrita", cedula: "123456" }]
};
const logos = await Promise.all([
  readFile(new URL("../../assets/fray-observacion-salud-conasama-stack.png", import.meta.url)),
  readFile(new URL("../../assets/fray-observacion-image2.png", import.meta.url))
]).then((archivos) => archivos.map((bytes) => ({ bytes: new Uint8Array(bytes), extension: "png" })));

// Nota corta, caracteres especiales y OOXML nativo (sin HTML/altChunk).
const corta = crearDocumentoWordFray({
  ...datosBase,
  secciones: [{ titulo: "ANÁLISIS", contenido: "Paciente con evolución estable: ½ tableta, SpO₂ 98%, comillas “clínicas” y ñ." }]
});
assert.equal(corta.type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
const cortaEntradas = entradasZipSinCompresion(new Uint8Array(await corta.arrayBuffer()));
if (process.env.DOCX_TEST_OUTPUT_SHORT) {
  await writeFile(process.env.DOCX_TEST_OUTPUT_SHORT, new Uint8Array(await corta.arrayBuffer()));
}
assert.ok(cortaEntradas.has("[Content_Types].xml"));
assert.ok(cortaEntradas.has("word/document.xml"));
assert.ok(cortaEntradas.has("word/styles.xml"));
assert.ok(cortaEntradas.has("word/footer1.xml"));
const documentXml = new TextDecoder().decode(cortaEntradas.get("word/document.xml"));
assert.match(documentXml, /María José García Ñúñez/);
assert.match(documentXml, /½ tableta, SpO₂ 98%/);
assert.equal(documentXml.includes("altChunk"), false);
assert.equal(documentXml.includes("<html"), false);

// Nota extensa: todo el contenido queda en flujo Word, sin saltos de página manuales.
const parrafosExtensos = Array.from({ length: 180 }, (_, i) => `Párrafo clínico ${i + 1}: evolución y seguimiento con Ñ, ½, SpO₂ y ± sin pérdida de información.`).join("\n\n");
const extensa = crearDocumentoWordFray({ ...datosBase, estadoNota: "definitiva", secciones: [{ titulo: "PADECIMIENTO ACTUAL", contenido: parrafosExtensos }] }, logos);
const extensaEntradas = entradasZipSinCompresion(new Uint8Array(await extensa.arrayBuffer()));
const extensaXml = new TextDecoder().decode(extensaEntradas.get("word/document.xml"));
assert.match(extensaXml, /Párrafo clínico 1:/);
assert.match(extensaXml, /Párrafo clínico 180:/);
assert.match(extensaXml, /w:pgSz w:w="12240" w:h="15840"/);
assert.ok(extensaEntradas.has("word/media/logo1.png"));
assert.ok(extensaEntradas.has("word/media/logo2.png"));
if (process.env.DOCX_TEST_OUTPUT) {
  await writeFile(process.env.DOCX_TEST_OUTPUT, new Uint8Array(await extensa.arrayBuffer()));
}

// Estados y contenido dinámico/listas se generan sin alterar el estado original.
for (const estadoNota of ["Sin guardar", "borrador", "definitiva"]) {
  const blob = crearDocumentoWordFray({
    ...datosBase,
    estadoNota,
    secciones: [
      { titulo: "PLAN", contenido: "- Vigilancia\n- Seguimiento" },
      { titulo: "TRATAMIENTO E INDICACIONES", contenido: "Continuar manejo indicado." },
      { titulo: "PRONÓSTICO", contenido: "Reservado a evolución." }
    ]
  });
  const xmlEstado = new TextDecoder().decode(entradasZipSinCompresion(new Uint8Array(await blob.arrayBuffer())).get("word/document.xml"));
  assert.match(xmlEstado, new RegExp(estadoNota));
  assert.match(xmlEstado, /w:numId w:val="1"/);
  assert.match(xmlEstado, /TRATAMIENTO E INDICACIONES/);
}

assert.equal(
  nombreSeguroNotaWord({ tipoNota: "Evolución/Ingreso", apellidoPaciente: 'García:*?"', fecha: "2026-07-16" }),
  "Nota_Evolucion_Ingreso_Garcia_2026-07-16.docx"
);

console.log("frayDocx: ok");
