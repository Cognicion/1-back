"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

test("el frontend conserva las cuatro firmas públicas y ya no escribe Firestore", () => {
  const source = readFileSync(join(__dirname, "../../js/services/vinculacion.js"), "utf8");
  assert.match(source, /export async function crearCodigoExpedienteParaPaciente\(pacienteId, medicoUid\)/u);
  assert.match(source, /export async function crearCodigoPacienteParaMedico\(pacienteUid\)/u);
  assert.match(source, /export async function vincularCuentaConCodigoMedico\(codigo, cuentaPacienteUid\)/u);
  assert.match(source, /export async function vincularExpedienteConCodigoPaciente\(codigo, expedienteProvisionalId, medicoUid\)/u);
  assert.match(source, /httpsCallable\(functions, FUNCTION_NAME\)/u);
  assert.match(source, /const FUNCTION_NAME = "manageAccountLinking"/u);
  assert.doesNotMatch(source, /firebase-firestore\.js|\bsetDoc\b|\bupdateDoc\b|\bgetDoc\b/u);
});

test("el handler callable está encapsulado y sus errores internos no registran payload ni PHI", () => {
  process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: "cognicion-57052" });
  const handlers = require("../accountLinking/handlers");
  assert.equal(typeof handlers.manageAccountLinking, "function");

  const source = readFileSync(join(__dirname, "../accountLinking/handlers.js"), "utf8");
  assert.match(source, /const manageAccountLinking = onCall/u);
  assert.doesNotMatch(source, /logger\.(?:error|warn|info)\([^)]*(?:request\.data|codigo|pacienteNombre|email)/su);
});

test("la copia conserva las rutas y subcolecciones legadas sin usar IDs nuevos", () => {
  const config = require("../accountLinking/config");
  assert.deepEqual(config.LEGACY_PATIENT_SUBCOLLECTIONS, ["registrosDiarios"]);
  assert.deepEqual(config.LEGACY_PATIENT_DOCUMENTS, [["miSalud", "metas"], ["miSalud", "agenda"]]);
  assert.deepEqual(config.USER_SUBCOLLECTIONS, [
    "notas",
    "tratamientos",
    "estudios",
    "notasRapidas",
    "resultadosEscalas",
    "metasTerapeuticas",
    "permisosMedicos",
    "historiaClinica",
    "escalasAsignadas",
    "tareasMiSalud",
    "diarioPersonal",
    "apuntesMedico",
    "carpetasApuntes",
    "borradoresMedico"
  ]);

  const source = readFileSync(join(__dirname, "../accountLinking/service.js"), "utf8");
  assert.equal(source.includes("${destinationRoot}/${collectionName}/${sourceDocument.id}"), true);
  assert.doesNotMatch(source, /\.add\(/u);
});
