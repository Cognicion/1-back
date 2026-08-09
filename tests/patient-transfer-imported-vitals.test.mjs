import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractVitalSignsCandidates, vitalSignsToNotePayload } from "../js/modules/patient-transfer/parsing/vitalSignsParser.js";
import { construirActualizacionSignosVitalesDesdeNota } from "../js/services/signosVitalesNotas.js";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const fields = ["presionArterial", "frecuenciaCardiaca", "frecuenciaRespiratoria", "temperatura", "saturacionO2"];

const table = {
  type: "table",
  rows: [
    ["Presion arterial", "Temperatura", "Frecuencia cardiaca", "Frecuencia respiratoria", "SatO2"],
    ["120/80 mmHg", "36.5 C", "72 lpm", "16 rpm", "98 %"]
  ],
  source: { blockIndex: 2, tableIndex: 0 }
};

const [candidate] = extractVitalSignsCandidates([table]);
const payload = vitalSignsToNotePayload(candidate, { fecha: "04/08/2026", hora: "21:45" });
assert.deepEqual(Object.fromEntries(fields.map((field) => [field, payload[field]])), {
  presionArterial: "120/80",
  frecuenciaCardiaca: 72,
  frecuenciaRespiratoria: 16,
  temperatura: 36.5,
  saturacionO2: 98
});

const buildUpdate = (patient = {}, sourceNoteId = "target-note:vital:0", date = "04/08/2026") => construirActualizacionSignosVitalesDesdeNota({
  paciente: patient,
  nota: {
    fechaNota: date,
    horaNota: "21:45",
    observacionFray: payload,
    signosVitales: payload
  },
  sourceNoteId,
  createdBy: "test-user"
});

const first = buildUpdate();
assert.ok(first, "construye la actualizacion de signos vitales para el paciente destino");
fields.forEach((field) => {
  assert.equal(String(first[field]), String(payload[field]), `escribe ${field} en el contrato actual del expediente`);
  assert.equal(String(first.signosVitales[field]), String(payload[field]), `escribe ${field} anidado`);
  assert.equal(first.historialSignosVitales[field].length, 1, `crea historial para ${field}`);
  assert.ok(first.signosVitalesMeta[field]?.fecha, `conserva metadata clinica para ${field}`);
});
assert.equal(
  first.historialSignosVitales.presionArterial[0].takenAt,
  new Date("2026-08-04T21:45").toISOString(),
  "normaliza DD/MM/AAAA sin sustituir la fecha clinica por la fecha tecnica de importacion"
);
assert.equal(first.historialSignosVitales.presionArterial[0].fechaToma, first.historialSignosVitales.presionArterial[0].takenAt);
assert.equal(first.historialSignosVitales.presionArterial[0].esPrevio, false);
assert.equal(first.historialSignosVitales.presionArterial[0].nota, "");

const second = buildUpdate(first);
fields.forEach((field) => assert.equal(second.historialSignosVitales[field].length, 1, `no duplica ${field} al reintentar la misma nota`));

const third = buildUpdate(second, "target-note:vital:1", "05/08/2026");
fields.forEach((field) => assert.equal(third.historialSignosVitales[field].length, 2, `conserva una segunda fecha clinica para ${field}`));

const newestPatient = {
  presionArterial: "118/76",
  frecuenciaCardiaca: 70,
  frecuenciaRespiratoria: 15,
  temperatura: 36.2,
  saturacionO2: 97,
  signosVitales: { presionArterial: "118/76" },
  signosVitalesMeta: Object.fromEntries(fields.map((field) => [field, { fecha: new Date("2026-08-08T10:00").toISOString() }])),
  historialSignosVitales: {
    ...Object.fromEntries(fields.map((field) => [field, [{ sourceNoteId: "existing", valor: "current", fecha: new Date("2026-08-08T10:00").toISOString() }]]))
  }
};
const oldAudit = {};
const oldImport = buildUpdate(newestPatient, "target-note:old", "01/08/2026");
const oldImportWithAudit = construirActualizacionSignosVitalesDesdeNota({
  paciente: newestPatient,
  nota: { fechaNota: "01/08/2026", horaNota: "14:30", observacionFray: { ...payload, fechaNota: "01/08/2026", horaNota: "14:30" }, signosVitales: { ...payload, fechaToma: "01/08/2026", horaToma: "14:30" } },
  sourceNoteId: "target-note:old",
  createdBy: "test-user",
  audit: oldAudit
});
assert.equal(oldImport.presionArterial, "118/76", "una nota antigua no reemplaza el valor actual");
assert.equal(oldImport.signosVitales.presionArterial, "118/76", "una nota antigua no reemplaza el valor actual anidado");
assert.equal(oldImportWithAudit.historialSignosVitales.presionArterial.length, 2, "una nota antigua sí entra al historial");
assert.equal(oldAudit.becameCurrent, false, "una nota antigua no se vuelve actual");

const newAudit = {};
const newImport = construirActualizacionSignosVitalesDesdeNota({
  paciente: newestPatient,
  nota: { fechaNota: "09/08/2026", horaNota: "14:30", observacionFray: { ...payload, fechaNota: "09/08/2026", horaNota: "14:30" }, signosVitales: { ...payload, fechaToma: "09/08/2026", horaToma: "14:30" } },
  sourceNoteId: "target-note:new",
  createdBy: "test-user",
  audit: newAudit
});
assert.equal(newImport.presionArterial, "120/80", "una nota nueva actualiza el valor actual");
assert.equal(newImport.signosVitales.presionArterial, "120/80", "una nota nueva actualiza el valor actual anidado");
assert.equal(newAudit.becameCurrent, true, "una nota nueva se vuelve actual");

const repository = read("js/modules/patient-transfer/patientTransferRepository.js");
const patientView = read("js/paciente.js");
const transferView = read("js/modules/patient-transfer/ui/patientTransferView.js");
fields.forEach((field) => {
  assert.match(patientView, new RegExp(`rutas: \\["${field}"`), `paciente.html consume ${field}`);
  assert.match(repository, new RegExp(`"${field}"`), `el repositorio conserva ${field}`);
});
assert.match(repository, /const patientRef = doc\(db, "usuarios", patientId\)/, "la referencia de SV usa el patientId destino resuelto");
assert.match(repository, /await setDoc\(patientRef, next, \{ merge: true \}\)/, "la escritura de SV usa la referencia del paciente destino");
assert.match(transferView, /includeControl \? includeControl\.checked : candidate\.include !== false/, "la sincronizacion conserva la seleccion si el control ya no esta en el DOM");

console.log("patient-transfer-imported-vitals.test.mjs OK");
