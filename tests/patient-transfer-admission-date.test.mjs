import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { FIELD_RULES } from "../js/modules/importacionDocx/docxImportConfig.js";
import { normalizeImportedAdmissionDate } from "../js/modules/patient-transfer/parsing/patientAdmissionDate.js";
import { parsePatientFields } from "../js/modules/patient-transfer/parsing/patientFieldParser.js";
import { parseNoteMetadata } from "../js/modules/patient-transfer/parsing/noteMetadataParser.js";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

test("la revisión nombra Fecha como Fecha de ingreso sin perder la fecha clínica", () => {
  const dateRule = FIELD_RULES.find((rule) => rule.key === "fecha");
  assert.equal(dateRule?.label, "Fecha de ingreso");
  assert.ok(dateRule?.aliases.includes("fecha de ingreso"));

  const parsed = parsePatientFields([{
    type: "paragraph",
    text: "Fecha de ingreso: 17/08/2026 Hora: 23:50",
    source: { blockIndex: 1, origin: "header" }
  }], "fixture-admission");
  assert.equal(parsed.fields.fecha.value, "17/08/2026");
  assert.equal(parsed.fields.hora.value, "23:50");
  assert.equal(parseNoteMetadata({ fields: parsed.fields }).documentDate, "17/08/2026");
});

test("normaliza fecha y hora de ingreso al contrato del expediente", () => {
  assert.equal(normalizeImportedAdmissionDate("17/08/2026", "23:50"), "2026-08-17T23:50");
  assert.equal(normalizeImportedAdmissionDate("2026-08-17", "08:05"), "2026-08-17T08:05");
  assert.equal(normalizeImportedAdmissionDate("17/08/2026 14:30", "08:05"), "2026-08-17T14:30");
  assert.equal(normalizeImportedAdmissionDate("31/02/2026", "10:00"), "");
  assert.equal(normalizeImportedAdmissionDate("17/08/2026", "25:00"), "");
});

test("creación y asociación escriben fechaIngreso raíz e institucional", () => {
  const adapter = read("js/modules/patient-transfer/integration/patientCreationAdapter.js");
  assert.match(adapter, /normalizeImportedAdmissionDate\(fields\.fechaIngreso \|\| fields\.fecha, fields\.hora\)/);
  assert.match(adapter, /fechaIngreso,\s*\n\s*curp:/);
  assert.match(adapter, /datosInstitucionales:[\s\S]*fechaIngreso,[\s\S]*curp:/);
  assert.match(adapter, /currentAdmissionDate[\s\S]*admissionDateToComplete = currentAdmissionDate \? "" : imported\.fechaIngreso/);
  assert.match(adapter, /importedInstitutional = nonEmptyEntries\([\s\S]*fechaIngreso: admissionDateToComplete/);
  assert.match(adapter, /const patch = nonEmptyEntries\([\s\S]*fechaIngreso: admissionDateToComplete/);
});

test("Panel y expediente calculan la estancia desde fechaIngreso", () => {
  const medico = read("js/medico.js");
  const paciente = read("js/paciente.js");
  assert.match(medico, /const fechaIngresoRaw = obtenerFechaIngreso\(paciente\);[\s\S]*calcularDiasEstancia\(fechaIngresoRaw\)/);
  assert.match(paciente, /const fechaIngreso = obtenerFechaIngreso\(datos\);[\s\S]*calcularDiasEstancia\(fechaIngreso\)/);
  assert.match(paciente, /datos\.fechaIngreso \|\|[\s\S]*institucional\.fechaIngreso/);
});
