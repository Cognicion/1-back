import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const firebaseConfig = JSON.parse(read("firebase.json"));
const indexes = JSON.parse(read("firestore.indexes.json"));
const indexSource = read("functions/index.js");
const handlers = read("functions/clinicalAnalytics/handlers.js");
const persistence = read("functions/clinicalAnalytics/embeddingPersistence.js");
const builder = read("functions/clinicalAnalytics/semanticDocumentBuilder.js");
const adminHtml = read("admin.html");
const adminJs = read("js/admin.js");
const controller = read("js/admin/clinicalKnowledge/clinicalKnowledgeController.js");

assert.equal(firebaseConfig.firestore.indexes, "firestore.indexes.json");
assert.ok(indexes.indexes.some((index) => (
  index.collectionGroup === "clinicalAnalyticsEmbeddings"
  && index.fields.some((field) => field.fieldPath === "embedding" && field.vectorConfig?.dimension === 512)
)));

assert.match(indexSource, /exports\.rebuildClinicalEmbeddingIndexAdmin\s*=\s*onCall/);
assert.match(indexSource, /exports\.clinicalAnalyticsOnRecordWrite\s*=\s*onDocumentWritten/);
assert.match(indexSource, /exports\.clinicalAnalyticsOnPatientWrite\s*=\s*onDocumentWritten/);
assert.match(indexSource, /clinicalAnalyticsOnRecordWrite[\s\S]*?secrets:\s*\[OPENAI_API_KEY\]/);
assert.match(handlers, /CLINICAL_RECORD_COLLECTIONS\.includes\(collectionId\)/);
assert.match(handlers, /indexClinicalRecordEmbeddings/);
assert.match(handlers, /async function rebuildClinicalEmbeddingIndexAdmin[\s\S]*?await assertAdmin\(request, db\)/);

assert.match(builder, /directIdentifiersIncluded:\s*false/);
assert.match(builder, /rawClinicalTextPersisted:\s*false/);
assert.match(persistence, /FieldValue\.vector/);
assert.match(persistence, /vectorsExposedToClient:\s*false/);
assert.match(persistence, /rawClinicalTextPersisted:\s*false/);
assert.doesNotMatch(persistence, /console\.(?:debug|log|info|warn|error)\([^\n]*(?:patientId|sourceRecordHash|analyticsPatientId)/);

assert.match(adminHtml, /css\/admin\.css\?v=20260831-sofia-admin-density-v2/);
assert.match(adminHtml, /js\/admin\.js\?v=20260831-sofia-admin-density-v1/);
assert.match(adminJs, /clinicalKnowledgeController\.js\?v=20260831-sofia-admin-density-v1/);
assert.match(controller, /Construir índice semántico/);
assert.match(controller, /Relaciones semánticas entre archivos/);
assert.match(controller, /Vectores expuestos al navegador<\/strong>No/);
assert.match(controller, /no implica causalidad/);

console.log("sofia-embeddings-static.test.mjs: ok");
