import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

// El flujo visible vigente es patient-transfer; no debe depender del detector eliminado del importador anterior.
const repository = read("js/modules/patient-transfer/patientTransferRepository.js");
assert.match(repository, /export async function findDuplicateImport/, "el repositorio vigente expone la detección de duplicados");
assert.match(repository, /doc\(db, "usuarios", userUid, DOCX_IMPORT_CONFIG\.duplicateUserSubcollection, hash\)/, "la lectura exacta está acotada al usuario");
assert.match(repository, /operation: "getDoc"/, "la verificación exacta usa lectura puntual");
assert.match(repository, /collection\(db, "usuarios", userUid, DOCX_IMPORT_CONFIG\.duplicateUserSubcollection\)/, "la consulta por texto permanece en la subcolección del usuario");
assert.match(repository, /where\("ownerUid", "==", userUid\)/, "la consulta por texto valida propietario");
assert.doesNotMatch(repository, /getDocs\(collection\(db, "usuarios"\)\)/, "no escanea todos los usuarios");
assert.match(repository, /ownerUid: user\.uid/, "los registros persistidos conservan propietario");
assert.match(repository, /sourceFileHash: document\.hash/, "el registro de importación conserva el hash de origen");

const controller = read("js/modules/patient-transfer/patientTransferController.js");
assert.match(controller, /findDuplicateImport\(\{ hash, textHash, userUid: user\.uid \}\)/, "el controlador usa el repositorio vigente");
assert.match(controller, /data-transfer-retry/, "el flujo permite reintentar tras un error");

console.log("docx-import-permissions.test.mjs OK");
