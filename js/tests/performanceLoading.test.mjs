import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function assertNoStaticReportes(htmlPath) {
  const html = read(htmlPath);
  assert.equal(
    /<script[^>]+type=["']module["'][^>]+src=["']\.?\/?js\/reportes\.js["']/i.test(html),
    false,
    `${htmlPath} no debe cargar reportes.js como script inicial`
  );
}

for (const htmlPath of ["login.html", "medico.html", "nota.html", "historia.html"]) {
  assertNoStaticReportes(htmlPath);
}

for (const jsPath of ["js/dashboard.js", "js/medico.js", "js/nota.js", "js/paciente.js", "js/historia.js", "js/reportes.js"]) {
  const source = read(jsPath);
  assert.equal(
    source.includes("onAuthStateChanged"),
    false,
    `${jsPath} debe usar authContextService en lugar de abrir listeners Auth propios`
  );
}

const firebaseBridge = read("js/firebase.js");
assert.match(firebaseBridge, /from "\.\/services\/firebaseAppService\.js"/);

console.log("OK: carga diferida y Auth compartido verificados.");
