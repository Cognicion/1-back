import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paciente = await readFile(new URL("../js/paciente.js", import.meta.url), "utf8");
const usuarios = await readFile(new URL("../js/services/usuarios.js", import.meta.url), "utf8");
const nuevoPaciente = await readFile(new URL("../js/nuevoPaciente.js", import.meta.url), "utf8");
const traspaso = await readFile(
  new URL("../js/modules/patient-transfer/integration/patientCreationAdapter.js", import.meta.url),
  "utf8"
);

test("el historial agrupa aplicaciones y registros previos por escala", () => {
  assert.match(paciente, /function agruparEscalasRegistradas\(escalas = \[\]\)/);
  assert.match(paciente, /grupo\.previas : grupo\.aplicadas/);
  assert.match(paciente, /renderizarGrupoEscalaRegistrada/);
  assert.match(paciente, /Registradas previamente/);
});

test("las altas normales y por traspaso reciben el expediente desde el backend", () => {
  assert.doesNotMatch(nuevoPaciente, /function generarExpedienteCognicion/);
  assert.match(nuevoPaciente, /crearPacienteProvisional\([\s\S]*payloadFirestore,[\s\S]*obtenerOperacionAltaPacienteId\(\)/);
  assert.match(traspaso, /crearPacienteProvisional\([\s\S]*buildPatientPayload\(fields, user\),[\s\S]*fields\.transferOperationId/);
  assert.match(usuarios, /completarDatosConExpedienteCognicion\(payload, expedienteCognicion\)/);
});

test("el cliente no escanea usuarios ni repara folios legados", () => {
  assert.doesNotMatch(usuarios, /obtenerSiguienteExpedienteCognicion|asegurarExpedienteCognicionPaciente|asegurarExpedientesCognicionEnDocumentos/);
  assert.doesNotMatch(usuarios, /getDocs\(collection\(db,\s*["']usuarios["']\)\)/);
  assert.doesNotMatch(paciente, /asegurarExpedienteCognicionPaciente/);
  assert.match(paciente, /Folio pendiente de asignación/);
});
