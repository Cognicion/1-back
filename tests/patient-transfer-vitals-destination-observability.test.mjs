import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const repository = read("js/modules/patient-transfer/patientTransferRepository.js");
const patientView = read("js/paciente.js");

[
  "patient-transfer:firebase-runtime",
  "patient-transfer:target-runtime",
  "patient-transfer:vitals-write-destination",
  "patient-transfer:vitals-write-result",
  "patient-transfer:vitals-read-after-write"
].forEach((eventName) => assert.match(repository, new RegExp(eventName), `${eventName} queda instrumentado`));

[
  "patient:vitals-firebase-runtime",
  "patient:vitals-reader-target",
  "patient:vitals-read"
].forEach((eventName) => assert.match(patientView, new RegExp(eventName), `${eventName} queda instrumentado`));

assert.match(repository, /targetFingerprint: technicalFingerprint\(patientId\)/, "la escritura identifica al destino sin exponer su ID");
assert.match(repository, /await getDocFromServer\(patientRef\)/, "la auditoria relee el mismo documento desde Firestore tras escribir");
assert.match(repository, /projectId: String\(db\?\.app\?\.options\?\.projectId \|\| ""\)/, "la auditoria obtiene el projectId de la instancia Firestore activa");
assert.match(patientView, /targetFingerprint: technicalFingerprint\(uidPaciente\)/, "el lector del expediente identifica el mismo destino sin exponer su ID");
assert.match(patientView, /documentExists: true/, "el lector reporta si el documento destino existe");

console.log("patient-transfer-vitals-destination-observability.test.mjs OK");
