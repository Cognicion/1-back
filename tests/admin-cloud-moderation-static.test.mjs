import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Centro de Control ofrece Mi nube solo al seleccionar un usuario y carga el componente bajo demanda", () => {
  const admin = read("js/admin.js");
  assert.match(admin, /data-admin-cloud-owner="\$\{escaparHTML\(usuario\.id\)\}"/u);
  assert.match(admin, /import\("\.\/components\/adminCloudExplorer\.js\?v=/u);
  assert.doesNotMatch(read("mi-nube.html"), /AdminModeration|explorador administrativo/u);
});

test("el cliente administrativo usa solamente callables mediadas por backend", () => {
  const service = read("js/services/cloudAdminModerationService.js");
  assert.match(service, /listAdminCloudFiles/u);
  assert.match(service, /requestAdminCloudFileAccess/u);
  assert.doesNotMatch(service, /collection\(|getDocs\(|getDownloadURL\(|ref\(/u);
});

test("preview PDF conserva Blob, Object URL e iframe y revoca al cerrar", () => {
  const component = read("js/components/adminCloudExplorer.js");
  assert.match(component, /prepararBlobParaPreview\(blob, kind\)/u);
  assert.match(component, /crearObjectUrlPreview\(previewBlob\)/u);
  assert.match(component, /document\.createElement\("iframe"\)/u);
  assert.match(component, /URL\.revokeObjectURL\(activeObjectUrl\)/u);
  assert.match(component, /if \(kind === "text"\)[\s\S]*blob\.text\(\)/u);
});

test("Functions públicas nuevas están acotadas a listado y acceso de solo lectura", () => {
  const index = read("functions/index.js");
  const handlers = read("functions/cloudAdminModeration/handlers.js");
  assert.match(index, /exports\.listAdminCloudFiles/u);
  assert.match(index, /exports\.requestAdminCloudFileAccess/u);
  assert.deepEqual([...handlers.matchAll(/const (\w+) = onCall/g)].map((match) => match[1]).sort(), [
    "listAdminCloudFiles",
    "requestAdminCloudFileAccess"
  ]);
  assert.doesNotMatch(handlers, /delete|update|rename|move/iu);
});

test("Rules de cliente conservan aislamiento por UID y no conceden excepción admin a cloudFiles", () => {
  const rules = read("firestore.rules");
  assert.match(rules, /match \/cloudFiles\/\{fileId\} \{\s*allow read: if accountIsActive\(uid\) && isSelf\(uid\);\s*allow create, update, delete: if false;/u);
  const storageRules = read("storage.rules");
  assert.match(storageRules, /request\.auth\.uid == uid/u);
  assert.doesNotMatch(storageRules, /isAdmin|role|rol/u);
});
