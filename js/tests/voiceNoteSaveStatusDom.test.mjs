import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

const html = read("nota-por-voz.html");
const js = read("js/nota-por-voz.js");
const css = read("css/nota-por-voz.css");

const saveBarIndex = html.indexOf('id="voiceSessionSaveBar"');
const stepTranscriptionIndex = html.indexOf('id="step-transcripcion"');
assert.ok(saveBarIndex > -1, "debe existir barra global de guardado");
assert.ok(saveBarIndex < stepTranscriptionIndex, "la barra debe estar fuera y antes del paso 3");
assert.doesNotMatch(html.slice(saveBarIndex, saveBarIndex + 220), /hidden/, "la barra global no debe estar oculta");
assert.match(html, /Estado de la sesion/);
assert.match(html, /id="voiceSaveStatus"/);
assert.match(html, /id="voiceSaveDetailConfirmed"/);
assert.match(html, /id="btnRetryVoiceSave"/);
assert.match(html, /id="btnExportVoiceTranscriptTemp"/);

assert.match(css, /\.voice-save-bar/);
assert.match(css, /position:\s*sticky/);
assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.voice-save-bar/);

assert.match(js, /function canUseProvider\(\)/);
assert.match(js, /state\.saveStatus === "saved"/);
assert.match(js, /state\.persistedTranscriptHash === obtenerHashTranscripcionActual\(\)/);
assert.match(js, /segmentButton\.disabled = !allowed/);
assert.match(js, /generateButton\.disabled = !allowed/);
assert.match(js, /Guardando\.\.\./);
assert.match(js, /Guardado localmente a las/);
assert.match(js, /Error al guardar/);
assert.match(js, /before-generation/);

console.log("voiceNoteSaveStatusDom.test.mjs OK");
