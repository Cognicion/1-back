import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const detector = read("js/modules/importacionDocx/duplicateDetector.js");
assert.match(detector, /usuarios", usuarioUid, DOCX_IMPORT_CONFIG\.duplicateUserSubcollection, hash/, "la verificacion de duplicados usa ruta acotada al usuario");
assert.match(detector, /operation: "getDoc"/, "la verificacion usa lectura puntual, no query global");
assert.doesNotMatch(detector, /getDocs\(query\(\s*collection\(db,\s*DOCX_IMPORT_CONFIG\.duplicateCollection\)/, "no consulta la coleccion raiz de importaciones");
assert.match(detector, /permission-denied/, "traduce errores de permisos");
assert.match(detector, /\[DOCX IMPORT\]/, "mantiene trazas temporales seguras");

const persistence = read("js/modules/importacionDocx/docxImportPersistence.js");
assert.match(persistence, /doc\(db, "usuarios", usuario\.uid, DOCX_IMPORT_CONFIG\.duplicateUserSubcollection, hash\)/, "el registro de duplicados se guarda bajo el usuario propietario");
assert.match(persistence, /ownerUid: usuario\.uid/, "el registro incluye ownerUid");
assert.match(persistence, /sourceFileHash: hash/, "el registro incluye sourceFileHash indexable");
assert.doesNotMatch(persistence, /getDocs\(collection\(db, "usuarios"\)\)/, "no escanea todos los usuarios para generar expediente");

const controller = read("js/modules/importacionDocx/docxImportController.js");
assert.match(controller, /Error durante la verificacion de duplicados/, "la UI marca la etapa exacta del error");
assert.match(controller, /data-docx-reintentar/, "la UI permite reintentar despues del error");
assert.match(controller, /isAdministrator/, "los detalles tecnicos se limitan por rol o debug");

console.log("docx-import-permissions.test.mjs OK");
