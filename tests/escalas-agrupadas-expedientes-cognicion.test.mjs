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

test("las altas normales y por traspaso comparten la asignacion de expediente", () => {
  assert.doesNotMatch(nuevoPaciente, /function generarExpedienteCognicion/);
  assert.match(nuevoPaciente, /crearPacienteProvisional\(payloadFirestore\)/);
  assert.match(traspaso, /crearPacienteProvisional\(buildPatientPayload\(fields, user\)\)/);
  assert.match(usuarios, /completarDatosConExpedienteCognicion\(payload, expedienteCognicion\)/);
});

test("el listado repara en lote los expedientes faltantes", () => {
  assert.match(usuarios, /asegurarExpedientesCognicionEnDocumentos\(Array\.from\(pacientes\.values\(\)\)\)/);
  assert.match(usuarios, /if \(operaciones >= 400\) await confirmarLote\(\)/);
  assert.match(usuarios, /expedienteCognicion: datosCompletos\.datosInstitucionales\.expedienteCognicion|datosInstitucionales: datosCompletos\.datosInstitucionales/);
});
