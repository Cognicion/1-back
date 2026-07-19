import assert from "node:assert/strict";
import fs from "node:fs";
import {
  VOICE_NOTE_SESSION_SCHEMA_VERSION,
  VOICE_NOTE_SESSION_TTL_MS,
  crearContextKeyVoz,
  crearSegmentationKeyVoz,
  crearSessionKeyVoz,
  hashTextoVoz,
  sesionVozExpirada,
  sesionVozTieneContenido,
  validarSesionVozContexto
} from "../services/voiceNoteSessionPersistence.js";

const root = new URL("../../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

const context = {
  userId: "user-a",
  patientId: "patient-a",
  encounterId: "enc-a",
  sessionId: "session-a"
};

assert.equal(crearContextKeyVoz(context), "user-a.patient-a.enc-a");
assert.match(crearSessionKeyVoz(context), /user-a\.patient-a\.enc-a\.session-a$/);
assert.match(crearSegmentationKeyVoz({ ...context, transcriptHash: "abc", promptVersion: "p1", model: "m1", segmenterVersion: "s1" }), /abc\.p1\.m1\.s1$/);
assert.equal(hashTextoVoz(" Hola   MUNDO "), hashTextoVoz("hola mundo"));
assert.notEqual(hashTextoVoz("hola mundo"), hashTextoVoz("hola mundo cambiado"));

const session = {
  schemaVersion: VOICE_NOTE_SESSION_SCHEMA_VERSION,
  ...context,
  transcript: {
    corrected: "Paciente refiere mejoria.",
    original: "Paciente refiere mejoria."
  },
  segmentation: {
    provider: "hybrid",
    mode: "hybrid",
    utterances: Array.from({ length: 97 }, (_, index) => ({ id: `utt-${index + 1}`, text: `turno ${index + 1}` })),
    completedBlocks: 6,
    totalBlocks: 6
  },
  expiresAt: Date.now() + VOICE_NOTE_SESSION_TTL_MS
};

assert.equal(sesionVozTieneContenido(session), true);
assert.equal(validarSesionVozContexto(session, context), true);
assert.equal(validarSesionVozContexto(session, { ...context, patientId: "otro" }), false);
assert.equal(validarSesionVozContexto(session, { ...context, encounterId: "otro" }), false);
assert.equal(validarSesionVozContexto(session, { ...context, userId: "otro" }), false);
assert.equal(sesionVozExpirada({ ...session, expiresAt: Date.now() - 1 }), true);
assert.equal(sesionVozTieneContenido({ schemaVersion: VOICE_NOTE_SESSION_SCHEMA_VERSION, ...context }), false);

const voicePage = read("js/nota-por-voz.js");
assert.match(voicePage, /isHydratingSession/);
assert.match(voicePage, /buscarSesionRecuperableVoz/);
assert.match(voicePage, /voiceSessionRecovery/);
assert.match(voicePage, /guardarSesionNotaVozLocal/);
assert.match(voicePage, /guardarSegmentacionNotaVozLocal/);
assert.match(voicePage, /obtenerSegmentacionNotaVozLocal/);
assert.match(voicePage, /limpiarSesionesNotaVozVencidas/);
assert.match(voicePage, /pagehide/);
assert.match(voicePage, /visibilitychange/);
assert.match(voicePage, /persistent_cache_hit/);
assert.match(voicePage, /transcriptHash/);
assert.match(voicePage, /session-restored/);

const dictado = read("js/dictado.js");
assert.match(dictado, /restaurarDictadoClinicoDesdeSnapshot/);
assert.match(dictado, /restoreFromSnapshot/);

const clinicalStore = read("js/services/clinicalLocalStore.js");
assert.match(clinicalStore, /cognicionVoiceNoteSessionStore/);

const html = read("nota-por-voz.html");
assert.match(html, /voiceSessionRecovery/);
assert.match(html, /btnRecuperarSesionVoz/);
assert.match(html, /btnDescartarSesionVoz/);
assert.match(html, /btnNuevaSesionVoz/);

console.log("voiceNoteSessionPersistence.test.mjs OK");
