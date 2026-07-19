import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TextDecoder } from "node:util";

const sourceBytes = readFileSync(new URL("../paciente.js", import.meta.url));
const browserDecodedSource = new TextDecoder("utf-8", { fatal: false }).decode(sourceBytes);
const legacyDecodedSource = new TextDecoder("windows-1252", { fatal: false }).decode(sourceBytes);

const tempDir = mkdtempSync(join(tmpdir(), "cognicion-paciente-syntax-"));
const browserDecodedCopy = join(tempDir, "paciente-browser-decoded.js");
writeFileSync(browserDecodedCopy, browserDecodedSource, "utf8");

execFileSync(process.execPath, ["--check", browserDecodedCopy], { stdio: "pipe" });

assert.doesNotMatch(
  legacyDecodedSource,
  /function\s+[A-Za-z_$][\w$]*[^\x00-\x7F][\w$]*/,
  "paciente.js no debe usar caracteres no ASCII en nombres de funcion mientras se sirva como UTF-8"
);

assert.doesNotMatch(
  legacyDecodedSource,
  /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*[^\x00-\x7F][\w$]*/,
  "paciente.js no debe usar caracteres no ASCII en identificadores mientras se sirva como UTF-8"
);

const html = readFileSync(new URL("../../paciente.html", import.meta.url), "utf8");
assert.match(html, /paciente\.js\?v=20260719-patient-access-syntax/);
assert.match(html, /No fue posible cargar el expediente\./);

console.log("pacienteEntrypointSyntax tests passed");
