import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, modulo, servicio] = await Promise.all([
  readFile(new URL("../../nota.html", import.meta.url), "utf8"),
  readFile(new URL("../nota.js", import.meta.url), "utf8"),
  readFile(new URL("../services/notas.js", import.meta.url), "utf8")
]);

for (const id of ["btnGuardarBorradorNota", "btnGuardarNotaDefinitiva", "btnDescargarNota"]) {
  assert.equal((html.match(new RegExp(`id=["']${id}["']`, "g")) || []).length, 1, `${id} debe ser unico`);
  assert.match(html, new RegExp(`<button[^>]*id=["']${id}["'][^>]*type=["']button["']`));
}

assert.equal(/\bplantillaSuger\b(?!ida)/.test(modulo), false, "no debe reaparecer la variable inexistente plantillaSuger");
assert.match(modulo, /function collectNoteData\(\)/);
assert.match(modulo, /guardarBorradorNotaClinica\(uidPaciente, notaEditandoId, notaPayload\)/);
assert.match(modulo, /finalizarNotaClinica\(uidPaciente, notaEditandoId, notaPayload/);
assert.match(modulo, /window\.confirm\("¿Confirma que desea cerrar esta nota como definitiva\?/);
assert.match(modulo, /crearDocumentoWordFray\(/);
assert.match(modulo, /Usar como borrador \(nueva nota\)/);
assert.match(modulo, /Continuar borrador/);
assert.match(modulo, /Editar esta nota/);
assert.match(modulo, /window\.cargarNotaComoBorrador[\s\S]*?notaEditandoId = null;/);
assert.match(modulo, /edicionVersionadaActiva = true/);
assert.match(modulo, /actualizarNota\(uidPaciente, notaEditandoId/);
assert.match(html, /<option value="cognicion">PDF Cognicion<\/option>/);
assert.match(modulo, /window\.descargarNotaSeleccionada\s*=\s*async function\(\)\s*\{\s*if \(!esFormatoFray\(\)\) \{\s*return window\.generarPDFNota\(\);/);
assert.equal(/window\.descargarNotaSeleccionada[\s\S]{0,800}window\.print\(\)/.test(modulo), false);

assert.match(servicio, /const COLECCION_NOTAS = "notasMedicas"/);
assert.match(servicio, /runTransaction\(db/);
assert.match(servicio, /estadoNota: "borrador"/);
assert.match(servicio, /estadoNota: "definitiva"/);
assert.match(servicio, /bloqueada: true/);
assert.match(servicio, /getDoc\(referencia\)/);
assert.match(servicio, /no puede volver a borrador/i);
assert.match(servicio, /ediciones: arrayUnion\(nuevaVersion\)/);
assert.match(servicio, /versionAnterior: versionActual/);
assert.match(servicio, /Firebase respondio, pero no confirmo la nueva version/);

console.log("notaClinicaFlow: ok");
