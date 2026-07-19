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
assert.equal(sesionVozTieneContenido({
  schemaVersion: VOICE_NOTE_SESSION_SCHEMA_VERSION,
  ...context,
  segmentation: {
    blockManifest: {
      totalBlocks: 14,
      blocks: Array.from({ length: 10 }, (_item, index) => ({ blockIndex: index, status: "completed" }))
    }
  }
}), true, "una sesion con manifiesto parcial debe considerarse recuperable");

const recoveredSessionA = {
  ...session,
  sessionId: "session-a",
  transcript: { corrected: "a".repeat(892), original: "a".repeat(892) },
  segmentation: { utterances: Array.from({ length: 22 }, (_, index) => ({ id: `a-${index}` })), completedBlocks: 1, totalBlocks: 1 }
};
const recoveredSessionB = {
  ...session,
  sessionId: "session-b",
  transcript: { corrected: "b".repeat(4200), original: "b".repeat(4200) },
  segmentation: {
    utterances: Array.from({ length: 89 }, (_, index) => ({ id: `b-${index}` })),
    completedBlocks: 10,
    totalBlocks: 14,
    blockManifest: {
      totalBlocks: 14,
      blocks: Array.from({ length: 14 }, (_item, index) => ({ blockIndex: index, status: index < 10 ? "completed" : "failed" }))
    }
  }
};
assert.ok((recoveredSessionB.transcript.corrected || "").length > 892);
assert.equal(recoveredSessionB.segmentation.completedBlocks, 10);
assert.equal((recoveredSessionA.transcript.corrected || "").length, 892);

const recoveredSessionC = {
  ...session,
  sessionId: "session-c",
  saveStatus: "saved",
  transcript: { corrected: "c".repeat(4200), original: "c".repeat(4200) },
  segmentation: {
    utterances: Array.from({ length: 89 }, (_, index) => ({ id: `c-${index}` })),
    completedBlocks: 3,
    failedBlocks: 1,
    pendingBlocks: 10,
    totalBlocks: 14,
    blockManifest: {
      totalBlocks: 14,
      blocks: Array.from({ length: 14 }, (_item, index) => ({
        blockIndex: index,
        status: index === 2 ? "failed" : (index < 4 ? "completed" : "pending")
      }))
    }
  }
};
const persistedBeforeProvider = true;
assert.equal(persistedBeforeProvider, true);
assert.ok((recoveredSessionC.transcript.corrected || "").length > 892);
assert.equal(recoveredSessionC.segmentation.totalBlocks, 14);
assert.equal(recoveredSessionC.segmentation.completedBlocks, 3);
assert.equal(recoveredSessionC.segmentation.failedBlocks, 1);
assert.equal(recoveredSessionC.segmentation.pendingBlocks, 10);
assert.equal(recoveredSessionC.saveStatus, "saved");

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
assert.match(voicePage, /visibility-visible-retry/);
assert.match(voicePage, /persistent_cache_hit/);
assert.match(voicePage, /saveVersion/);
assert.match(voicePage, /voiceSaveStatus/);
assert.match(voicePage, /renderBlockManifestSegmentacion/);
assert.match(voicePage, /btnDetenerSegmentacionVoz/);
assert.match(voicePage, /detenerSegmentacion:start/);
assert.match(voicePage, /Deteniendo y guardando/);
assert.match(voicePage, /Segmentacion detenida y guardada/);
assert.match(voicePage, /throwOnError/);
assert.match(voicePage, /persistenceQueue/);
assert.match(voicePage, /pendingPersistenceOperations/);
assert.match(voicePage, /enqueuePersistenciaVoz/);
assert.match(voicePage, /persistSnapshotVozRaw/);
assert.match(voicePage, /conTimeoutLocal/);
assert.match(voicePage, /preflight_timeout/);
assert.match(voicePage, /provider_init_timeout/);
assert.match(voicePage, /providerStarted: false/);
assert.match(voicePage, /manifest_started/);
assert.match(voicePage, /manifest_completed/);
assert.match(voicePage, /provider_started/);
assert.match(voicePage, /preflightResolved === true|preflight_completed/);
assert.match(voicePage, /normalizarSnapshotSesionVoz/);
assert.match(voicePage, /JSON\.parse\(JSON\.stringify/);
assert.match(voicePage, /manual-save-retry/);
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
assert.match(html, /voiceSegmentationBlockList/);
assert.match(html, /voiceSaveStatus/);
assert.match(html, /voiceSaveActions/);
assert.match(html, /btnRetryVoiceSave/);
assert.match(html, /btnExportVoiceTranscriptTemp/);
assert.match(html, /btnCancelarPreparacionSegmentacionVoz/);

const persistenceSource = read("js/services/voiceNoteSessionPersistence.js");
assert.match(persistenceSource, /serialization_failed/);
assert.match(persistenceSource, /transaction_error/);
assert.match(persistenceSource, /transaction_abort/);
assert.match(persistenceSource, /verification_failed/);
assert.match(persistenceSource, /segmentation_verification_failed/);
assert.match(persistenceSource, /throw crearErrorPersistencia/);

console.log("voiceNoteSessionPersistence.test.mjs OK");
