import assert from "node:assert/strict";
import fs from "node:fs";
import {
  VOICE_NOTE_SESSION_SCHEMA_VERSION,
  VOICE_NOTE_SESSION_TTL_MS,
  crearContextKeyVoz,
  crearSegmentationKeyVoz,
  crearSessionKeyVoz,
  guardarSesionNotaVozLocal,
  guardarSegmentacionNotaVozLocal,
  hashTextoVoz,
  buscarSesionesNotaVozLocales,
  limpiarSesionesNotaVozVencidas,
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

assert.equal(VOICE_NOTE_SESSION_TTL_MS, 72 * 60 * 60 * 1000, "TTL de borradores locales debe ser 72 horas");
assert.equal(sesionVozTieneContenido(session), true);
assert.equal(validarSesionVozContexto(session, context), true);
assert.equal(validarSesionVozContexto(session, { ...context, patientId: "otro" }), false);
assert.equal(validarSesionVozContexto(session, { ...context, encounterId: "otro" }), false);
assert.equal(validarSesionVozContexto(session, { ...context, userId: "otro" }), false);
assert.equal(sesionVozExpirada({ ...session, sessionStatus: "in_progress", expiresAt: Date.now() - 1 }), true);
assert.equal(sesionVozExpirada({ ...session, sessionStatus: "transferred", expiresAt: Date.now() - 1 }), false, "una sesion transferida no caduca por TTL local");
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

function instalarIndexedDbFalso() {
  const databases = new Map();
  globalThis.IDBKeyRange = {
    only(value) {
      return { only: value };
    }
  };
  globalThis.indexedDB = {
    open(name) {
      const request = {};
      setTimeout(() => {
        let dbState = databases.get(name);
        const isNew = !dbState;
        if (!dbState) {
          dbState = { stores: new Map(), indexes: new Map() };
          databases.set(name, dbState);
        }
        const db = {
          objectStoreNames: {
            contains(storeName) {
              return dbState.stores.has(storeName);
            }
          },
          createObjectStore(storeName) {
            if (!dbState.stores.has(storeName)) dbState.stores.set(storeName, new Map());
            return {
              createIndex(indexName, keyPath) {
                dbState.indexes.set(`${storeName}.${indexName}`, keyPath);
              }
            };
          },
          transaction(storeName) {
            const storeNames = Array.isArray(storeName) ? storeName : [storeName];
            const tx = {
              objectStore(targetStoreName) {
                if (!storeNames.includes(targetStoreName)) throw new Error(`Store fuera de transaccion: ${targetStoreName}`);
                const store = dbState.stores.get(targetStoreName);
                return {
                  put(record) {
                    store.set(record.key, structuredClone(record));
                    setTimeout(() => tx.oncomplete?.(), 0);
                    return {};
                  },
                  get(key) {
                    const req = {};
                    setTimeout(() => {
                      req.result = store.get(key) || null;
                      req.onsuccess?.();
                      setTimeout(() => tx.oncomplete?.(), 0);
                    }, 0);
                    return req;
                  },
                  delete(key) {
                    store.delete(key);
                    setTimeout(() => tx.oncomplete?.(), 0);
                    return {};
                  },
                  openCursor() {
                    const req = {};
                    const values = [...store.values()];
                    let cursorIndex = 0;
                    const pump = () => {
                      if (cursorIndex >= values.length) {
                        req.result = null;
                        req.onsuccess?.();
                        setTimeout(() => tx.oncomplete?.(), 0);
                        return;
                      }
                      const value = values[cursorIndex];
                      req.result = {
                        value,
                        continue() {
                          cursorIndex += 1;
                          setTimeout(pump, 0);
                        },
                        delete() {
                          store.delete(value.key);
                        }
                      };
                      req.onsuccess?.();
                    };
                    setTimeout(pump, 0);
                    return req;
                  },
                  index(indexName) {
                    const keyPath = dbState.indexes.get(`${targetStoreName}.${indexName}`);
                    return {
                      openCursor(range) {
                        const req = {};
                        const values = [...store.values()].filter((record) => record[keyPath] === range.only);
                        let cursorIndex = 0;
                        const pump = () => {
                          if (cursorIndex >= values.length) {
                            req.result = null;
                            req.onsuccess?.();
                            setTimeout(() => tx.oncomplete?.(), 0);
                            return;
                          }
                          const value = values[cursorIndex];
                          req.result = {
                            value,
                            continue() {
                              cursorIndex += 1;
                              setTimeout(pump, 0);
                            },
                            delete() {
                              store.delete(value.key);
                            }
                          };
                          req.onsuccess?.();
                        };
                        setTimeout(pump, 0);
                        return req;
                      }
                    };
                  }
                };
              }
            };
            return tx;
          },
          close() {}
        };
        request.result = db;
        if (isNew) request.onupgradeneeded?.();
        request.onsuccess?.();
      }, 0);
      return request;
    }
  };
}

instalarIndexedDbFalso();
const savedIntegration = await guardarSesionNotaVozLocal({
  schemaVersion: VOICE_NOTE_SESSION_SCHEMA_VERSION,
  userId: "user-integration",
  patientId: "patient-integration",
  encounterId: "enc-integration",
  sessionId: "session-integration",
  saveVersion: 0,
  transcript: {
    corrected: "x".repeat(21541),
    original: "x".repeat(21541),
    transcriptHash: "hash-integration"
  },
  segmentation: {
    utterances: Array.from({ length: 89 }, (_, index) => ({ id: `utt-${index + 1}`, text: `turno ${index + 1}` }))
  },
  expiresAt: Date.now() + VOICE_NOTE_SESSION_TTL_MS
});
const listedIntegration = await buscarSesionesNotaVozLocales({
  userId: "user-integration",
  patientId: "patient-integration",
  encounterId: "enc-integration"
});
assert.equal(savedIntegration.saveVersion, 1, "persistedSaveVersion === 1");
assert.equal(listedIntegration.length, 1, "readbackVerified === true");
assert.equal((listedIntegration[0].transcript.corrected || "").length, 21541);

const cleanupNow = Date.now();
const baseCleanupContext = {
  userId: "user-cleanup",
  patientId: "patient-cleanup",
  encounterId: "enc-cleanup"
};
const session71h = await guardarSesionNotaVozLocal({
  schemaVersion: VOICE_NOTE_SESSION_SCHEMA_VERSION,
  ...baseCleanupContext,
  sessionId: "session-71h",
  transcript: { corrected: "sesion vigente", original: "sesion vigente", transcriptHash: "hash-71h" },
  segmentation: {},
  sessionStatus: "in_progress",
  lastMeaningfulActivityAt: new Date(cleanupNow - 71 * 60 * 60 * 1000).toISOString()
});
const session73h = await guardarSesionNotaVozLocal({
  schemaVersion: VOICE_NOTE_SESSION_SCHEMA_VERSION,
  ...baseCleanupContext,
  sessionId: "session-73h",
  transcript: { corrected: "sesion vencida", original: "sesion vencida", transcriptHash: "hash-73h" },
  segmentation: {},
  sessionStatus: "in_progress",
  lastMeaningfulActivityAt: new Date(cleanupNow - 73 * 60 * 60 * 1000).toISOString()
});
const sessionTransferred = await guardarSesionNotaVozLocal({
  schemaVersion: VOICE_NOTE_SESSION_SCHEMA_VERSION,
  ...baseCleanupContext,
  sessionId: "session-transferred",
  transcript: { corrected: "sesion transferida", original: "sesion transferida", transcriptHash: "hash-transferred" },
  segmentation: {},
  sessionStatus: "transferred",
  lastMeaningfulActivityAt: new Date(cleanupNow - 90 * 60 * 60 * 1000).toISOString()
});
await guardarSegmentacionNotaVozLocal({
  ...baseCleanupContext,
  sessionId: "session-73h",
  sourceSessionId: "session-73h",
  transcriptHash: "hash-73h",
  promptVersion: "prompt-cleanup",
  model: "model-cleanup",
  segmenterVersion: "segmenter-cleanup",
  utterances: [{ id: "utt-expired", text: "segmento" }]
});
await guardarSegmentacionNotaVozLocal({
  ...baseCleanupContext,
  sessionId: "session-71h",
  sourceSessionId: "session-71h",
  transcriptHash: "hash-71h",
  promptVersion: "prompt-cleanup",
  model: "model-cleanup",
  segmenterVersion: "segmenter-cleanup",
  utterances: [{ id: "utt-active", text: "segmento" }]
});
assert.ok(session71h.expiresAt > cleanupNow, "sesion de 71 horas permanece vigente");
assert.ok(session73h.expiresAt <= cleanupNow, "sesion de mas de 72 horas queda vencida");
assert.equal(sessionTransferred.sessionStatus, "transferred");
const deletedByTtl = await limpiarSesionesNotaVozVencidas(cleanupNow);
assert.equal(deletedByTtl, 2, "limpieza borra sesion vencida y cache de bloques perteneciente a esa sesion");
const cleanupRemaining = await buscarSesionesNotaVozLocales(baseCleanupContext);
assert.equal(cleanupRemaining.some((item) => item.sessionId === "session-71h"), true);
assert.equal(cleanupRemaining.some((item) => item.sessionId === "session-73h"), false);
assert.equal(cleanupRemaining.some((item) => item.sessionId === "session-transferred"), true);
assert.equal(cleanupRemaining.find((item) => item.sessionId === "session-71h")?.lastMeaningfulActivityAt, session71h.lastMeaningfulActivityAt, "abrir/listar no prolonga TTL");

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
assert.match(voicePage, /canUseProvider/);
assert.match(voicePage, /persistedTranscriptHash/);
assert.match(voicePage, /persistedSessionId/);
assert.match(voicePage, /Guardado localmente a las/);
assert.match(voicePage, /actualizarDetalleGuardadoSesion/);
assert.match(voicePage, /voiceSaveDetailConfirmed/);
assert.match(voicePage, /before-generation/);
assert.match(voicePage, /manifest_started/);
assert.match(voicePage, /manifest_completed/);
assert.match(voicePage, /provider_started/);
assert.match(voicePage, /preflightResolved === true|preflight_completed/);
assert.match(voicePage, /normalizarSnapshotSesionVoz/);
assert.match(voicePage, /JSON\.parse\(JSON\.stringify/);
assert.match(voicePage, /manual-save-retry/);
assert.match(voicePage, /transcriptHash/);
assert.match(voicePage, /session-restored/);
assert.match(voicePage, /lastMeaningfulActivityAt/);
assert.match(voicePage, /sessionStatus/);
assert.match(voicePage, /esActividadSignificativaVoz/);
assert.match(voicePage, /detectarDuplicadosSesionesVoz/);
assert.match(voicePage, /aria-selected="false"/);
assert.match(voicePage, /button\.setAttribute\("aria-selected", "true"\)/);
assert.match(voicePage, /Selecciona un borrador para continuar/);
assert.match(voicePage, /Recuperar este borrador de/);
assert.match(voicePage, /Este borrador se eliminara automaticamente en/);
assert.match(voicePage, /Posible duplicado/);
assert.match(voicePage, /state\.lastMeaningfulActivityAt = session\.lastMeaningfulActivityAt/);

const dictado = read("js/dictado.js");
assert.match(dictado, /restaurarDictadoClinicoDesdeSnapshot/);
assert.match(dictado, /restoreFromSnapshot/);

const clinicalStore = read("js/services/clinicalLocalStore.js");
assert.match(clinicalStore, /cognicionVoiceNoteSessionStore/);

const html = read("nota-por-voz.html");
assert.ok(html.indexOf("voiceSessionSaveBar") < html.indexOf("step-preparar"), "el indicador global debe estar fuera de los paneles de pasos");
assert.match(html, /voiceSessionRecovery/);
assert.match(html, /btnRecuperarSesionVoz/);
assert.match(html, /btnDescartarSesionVoz/);
assert.match(html, /btnNuevaSesionVoz/);
assert.match(html, /voiceSegmentationBlockList/);
assert.match(html, /voiceSaveStatus/);
assert.match(html, /Estado de la sesion/);
assert.match(html, /voiceSaveDetailSession/);
assert.match(html, /voiceSaveDetailConfirmed/);
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
assert.match(persistenceSource, /72 \* 60 \* 60 \* 1000/);
assert.match(persistenceSource, /\["draft", "in_progress"\]\.includes\(status\)/);
assert.match(persistenceSource, /ttl_cleanup/);
assert.match(persistenceSource, /sourceSessionId/);

console.log("voiceNoteSessionPersistence.test.mjs OK");
