import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const output = new URL("../.firebase-hosting-public/", import.meta.url);

test("Firebase Hosting usa un artefacto allowlisted y conserva rutas multipágina", async () => {
  const config = JSON.parse(await readFile(new URL("../firebase.json", import.meta.url), "utf8"));
  assert.equal(config.hosting.site, "cognicion-57052");
  assert.equal(config.hosting.public, ".firebase-hosting-public");
  assert.equal(config.hosting.rewrites, undefined);
  assert.equal(config.hosting.cleanUrls, false);
});

test("el build incluye frontend y excluye infraestructura, pruebas y fuentes", async () => {
  await execFileAsync(process.execPath, ["scripts/build-firebase-hosting.mjs"], {
    cwd: new URL("..", import.meta.url)
  });

  for (const path of [
    "index.html",
    "biblioteca.html",
    "diagnostico-red.html",
    "health.json",
    "service-worker.js",
    "assets/favicon-cognicion.png",
    "css/theme.css",
    "js/availability-bootstrap.js"
  ]) {
    await access(new URL(path, output));
  }

  for (const path of [
    "firebase.json",
    "firestore.rules",
    "storage.rules",
    "functions/index.js",
    "tests/firebase-hosting-mirror.test.mjs",
    "fuentes_farmacologicas/stahl_prescribers_guide.pdf",
    "docs/auditoria-disponibilidad-web-2026-09-09.md",
    "AGENTS.md",
    "CNAME",
    "assets/sofia-mascota/README.md",
    "js/data/farmacologiaUnificada.js.bak-20260716",
    "js/modules/clinical-document-engine/README.md",
    "js/tests/cacheStrategy.test.mjs"
  ]) {
    await assert.rejects(access(new URL(path, output)));
  }
});

test("los headers protegen actualización sin aplicar caché agresiva al código", async () => {
  const config = JSON.parse(await readFile(new URL("../firebase.json", import.meta.url), "utf8"));
  const headers = new Map(config.hosting.headers.map((rule) => [rule.source, rule.headers]));
  const cacheControl = (source) => headers.get(source)?.find((header) => header.key === "Cache-Control")?.value;

  assert.equal(cacheControl("/service-worker.js"), "no-cache, no-store, must-revalidate");
  assert.equal(cacheControl("/*.html"), "no-cache, max-age=0, must-revalidate");
  assert.equal(cacheControl("/"), "no-cache, max-age=0, must-revalidate");
  assert.equal(cacheControl("/health.json"), "no-store");
  assert.equal(cacheControl("/js/**"), "no-cache, max-age=0, must-revalidate");
  assert.equal(cacheControl("/respiracion.js"), "no-cache, max-age=0, must-revalidate");
  assert.equal(cacheControl("/data/**"), "no-cache, max-age=0, must-revalidate");
  assert.equal(cacheControl("/css/**"), "no-cache, max-age=0, must-revalidate");
});

test("el Service Worker y manifest son portables al origen web.app", async () => {
  const [worker, manifest] = await Promise.all([
    readFile(new URL("../service-worker.js", import.meta.url), "utf8"),
    readFile(new URL("../manifest.json", import.meta.url), "utf8")
  ]);
  assert.match(worker, /self\.location\.origin/u);
  assert.doesNotMatch(worker, /cognicionlabs\.com/u);
  assert.equal(JSON.parse(manifest).scope, "./");
  assert.equal(JSON.parse(manifest).start_url, "./dashboard.html");
});
