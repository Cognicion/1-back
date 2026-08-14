import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIELD_RULES } from "../js/modules/importacionDocx/docxImportConfig.js";
import {
  normalizarAliasPaciente,
  obtenerAliasPaciente,
  textoBusquedaPaciente
} from "../js/utils/nombresPacientes.js";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

assert.equal(normalizarAliasPaciente("  Nombre social: MATEO  "), "MATEO");
assert.equal(normalizarAliasPaciente(""), "");
assert.equal(obtenerAliasPaciente({ datosInstitucionales: { alias: "MATEO" } }), "MATEO");
assert.match(textoBusquedaPaciente({
  nombres: "CARMEN ELENA",
  apellidoPaterno: "RIVERA",
  apellidoMaterno: "SOTO",
  alias: "MATEO"
}), /mateo/);

const aliasRule = FIELD_RULES.find((rule) => rule.key === "alias");
assert.ok(aliasRule, "el modelo de revision incluye Alias");
assert.equal(aliasRule.label, "Alias (opcional)");
assert.ok(aliasRule.aliases.includes("nombre social"));

const newPatientHtml = read("nuevo-paciente.html");
const newPatientController = read("js/nuevoPaciente.js");
const transferAdapter = read("js/modules/patient-transfer/integration/patientCreationAdapter.js");
const patientView = read("js/paciente.js");

assert.match(newPatientHtml, /id="aliasPaciente"/);
assert.match(newPatientHtml, /autocomplete="nickname"/);
assert.match(newPatientController, /normalizarAliasPaciente\(document\.getElementById\("aliasPaciente"\)/);
assert.match(newPatientController, /\n\s+alias,\n\s+nombreEstructurado:/);
assert.match(newPatientController, /datosInstitucionales:\s*\{[\s\S]*?\n\s+alias,/);
assert.match(transferAdapter, /const alias = normalizarAliasPaciente\(fields\.alias\)/);
assert.match(transferAdapter, /datosInstitucionales:\s*\{[\s\S]*?\n\s+alias,/);
assert.match(patientView, /\["alias", "Alias", "text"/);
assert.match(patientView, /<b>Alias:<\/b>/);

console.log("patient-transfer-patient-alias.test.mjs OK");
