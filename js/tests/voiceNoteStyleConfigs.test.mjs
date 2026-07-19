import assert from "node:assert/strict";
import fs from "node:fs";
import {
  crearConfiguracionSeguraExamenMental,
  normalizarConfiguracionEstilo
} from "../services/voiceNoteStyleConfigService.js";

const root = new URL("../../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

const safe = crearConfiguracionSeguraExamenMental("user-1");
assert.equal(safe.id, "safe_default");
assert.equal(safe.quotePreferences.quoteMode, "omit");
assert.equal(safe.containsClinicalDefaults, false);

const normalized = normalizarConfiguracionEstilo({
  id: "cfg-1",
  userId: "otro",
  name: "<b>Observacion institucional habitual</b>",
  componentStates: {
    gait: { state: "include", value: "normal", saveClinicalValue: false },
    psychomotricity: { state: "hidden", value: "agitation", saveClinicalValue: true }
  },
  patientId: "paciente-no-debe-guardarse",
  encounterId: "enc-no-debe-guardarse",
  transcript: "texto clinico",
  generatedNote: "nota",
  quotePreferences: { quoteMode: "auto", maxPatientQuotes: 2 }
}, "user-1");

assert.equal(normalized.userId, "user-1");
assert.equal(normalized.name, "Observacion institucional habitual");
assert.equal(normalized.componentStates.gait.value, "");
assert.equal(normalized.componentStates.psychomotricity.value, "agitation");
assert.equal(normalized.containsClinicalDefaults, true);
assert.equal("patientId" in normalized, false);
assert.equal("encounterId" in normalized, false);
assert.equal("transcript" in normalized, false);
assert.equal("generatedNote" in normalized, false);

const editorHtml = read("editor-estilo-nota.html");
const editorJs = read("js/editor-estilo-nota.js");
assert.match(editorHtml, /Crear estilo de nota/);
assert.match(editorHtml, /Vista previa/);
assert.match(editorJs, /internalKey/);
assert.match(editorJs, /destinationField/);
assert.match(editorJs, /Vista previa — datos ficticios/);
assert.doesNotMatch(editorJs, /patientId:\s*params/);
assert.doesNotMatch(editorJs, /transcripcion|transcription/i);

console.log("voiceNoteStyleConfigs.test.mjs OK");
