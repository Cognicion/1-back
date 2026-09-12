import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Centro de Control expone Organización pero la carga bajo demanda", async () => {
  const [html, admin] = await Promise.all([read("../admin.html"), read("../js/admin.js")]);
  assert.match(html, /data-admin-section="seccionOrganizacionAdmin"/);
  assert.match(html, /id="organizacionAdminApp"/);
  assert.doesNotMatch(html, /<script[^>]+organization\/organization\.js/);
  assert.match(admin, /idSeccion === "seccionOrganizacionAdmin"/);
  assert.match(admin, /import\("\.\/admin\/organization\/organization\.js/);
});

test("reglas de organización son admin-only y separan datos sensibles", async () => {
  const rules = await read("../firestore.rules");
  const organizationBlock = rules.slice(rules.indexOf("match /organizations/{organizationId}"), rules.indexOf("/*\n     * BLOQUEO GENERAL"));
  assert.match(organizationBlock, /allow read, create, update: if isAdmin\(\)/);
  assert.match(organizationBlock, /match \/privateRecords\/\{recordId\}/);
  assert.match(organizationBlock, /canReadSensitiveOrganizationData\(\)/);
  assert.match(organizationBlock, /allow delete: if false/);
});

test("persistencia usa referencias normalizadas y auditoría", async () => {
  const service = await read("../js/admin/organization/services/organization-service.js");
  assert.match(service, /organizations/);
  assert.match(service, /organizationEvents/);
  assert.match(service, /actorUid/);
  assert.doesNotMatch(service, /localStorage/);
});
