import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadPersistenceHarness() {
  const adapterUrl = new URL("../js/adhd/services/adhdPersistenceAdapter.js", import.meta.url);
  const adapterSource = await readFile(adapterUrl, "utf8");
  const importlessSource = adapterSource.replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["'];\s*/gu, "");
  const harness = `
    export const __state = {
      now: 1_000,
      readErrorCode: null,
      readHangs: false,
      writeErrorCode: null,
      writeHangs: false,
      draftWriteFails: false,
      reads: 0,
      writes: [],
      remote: new Map(),
      drafts: new Map()
    };
    const db = {};
    const ADHD_PERSISTENCE_SCHEMA_VERSION = "test-schema";
    const ADHD_PROTOCOL_ID = "test-protocol";
    const ADHD_PROTOCOL_VERSION = "test-version";
    const pathKey = (reference) => reference.path.join("/");
    const ref = (...parts) => ({
      path: parts.flatMap((part) => part === db ? [] : (part?.path || [String(part)]))
    });
    const doc = (...parts) => ref(...parts);
    const collection = (...parts) => ref(...parts);
    const where = (field, operator, value) => ({ field, operator, value });
    const query = (reference, ...filters) => ({ ...reference, filters });
    const serverTimestamp = () => ({ toMillis: () => __state.now });
    const arrayUnion = (...values) => values;
    const failure = (code) => Object.assign(new Error(code), { code });
    const getDoc = async (reference) => {
      __state.reads += 1;
      if (__state.readHangs) return new Promise(() => {});
      if (__state.readErrorCode) throw failure(__state.readErrorCode);
      const value = __state.remote.get(pathKey(reference));
      return { exists: () => value !== undefined, data: () => value };
    };
    const getDocs = async (reference) => {
      __state.reads += 1;
      if (__state.readHangs) return new Promise(() => {});
      if (__state.readErrorCode) throw failure(__state.readErrorCode);
      const prefix = pathKey(reference);
      const expectedLength = reference.path.length + 1;
      const docs = [];
      for (const [path, data] of __state.remote.entries()) {
        const parts = path.split("/");
        if (!path.startsWith(prefix + "/") || parts.length !== expectedLength) continue;
        if ((reference.filters || []).some((filter) => data?.[filter.field] !== filter.value)) continue;
        docs.push({ id: parts.at(-1), data: () => data });
      }
      return { docs };
    };
    const applySet = (reference, payload, options = {}) => {
      const path = pathKey(reference);
      const previous = __state.remote.get(path);
      const value = options.merge && previous ? { ...previous, ...payload } : payload;
      __state.remote.set(path, value);
      __state.writes.push({ path, payload, options });
    };
    const setDoc = async (reference, payload, options) => {
      if (__state.writeHangs) return new Promise(() => {});
      if (__state.writeErrorCode) throw failure(__state.writeErrorCode);
      applySet(reference, payload, options);
    };
    const writeBatch = () => {
      const operations = [];
      return {
        set(reference, payload, options) { operations.push({ reference, payload, options }); },
        async commit() {
          if (__state.writeErrorCode) throw failure(__state.writeErrorCode);
          operations.forEach(({ reference, payload, options }) => applySet(reference, payload, options));
        }
      };
    };
    const guardarBorradorClinicoLocal = async (key, payload) => {
      if (__state.draftWriteFails) return null;
      const record = { key, payload, updatedAt: __state.now };
      __state.drafts.set(key, record);
      return record;
    };
    const obtenerBorradorClinicoLocal = async (key) => __state.drafts.get(key)?.payload || null;
    const eliminarBorradorClinicoLocal = async (key) => { __state.drafts.delete(key); };
    const listarBorradoresClinicosLocalesPorPrefijo = async (prefix) =>
      [...__state.drafts.values()].filter((record) => record.key.startsWith(prefix));
    export const __putRemote = (path, value) => __state.remote.set(path, value);
  `;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(`${harness}\n${importlessSource}`).toString("base64")}#${Date.now()}-${Math.random()}`;
  return import(moduleUrl);
}

test("los errores de autorización se propagan y nunca crean pendingSync", async () => {
  for (const code of ["permission-denied", "unauthenticated", "firestore/permission-denied", "auth/user-token-expired"]) {
    const persistence = await loadPersistenceHarness();
    persistence.__state.writeErrorCode = code;
    await assert.rejects(
      persistence.saveProgram({ patientId: "patient-1", programId: "program-1", data: { status: "active" } }),
      (error) => error.code === code
    );
    assert.equal(persistence.__state.drafts.size, 0, `${code} no debe generar borrador`);
  }

  const persistence = await loadPersistenceHarness();
  persistence.__state.readErrorCode = "permission-denied";
  await assert.rejects(
    persistence.loadAdhdProgramBundle({ patientId: "patient-1", programId: "program-1" }),
    (error) => error.code === "permission-denied"
  );

  const retry = await loadPersistenceHarness();
  retry.__state.writeErrorCode = "unavailable";
  await retry.saveProgram({ patientId: "patient-1", programId: "program-1", data: { status: "active" } });
  assert.equal(retry.__state.drafts.size, 1);
  retry.__state.writeErrorCode = "permission-denied";
  await assert.rejects(
    retry.saveProgram({ patientId: "patient-1", programId: "program-1", data: { status: "active" } }),
    (error) => error.code === "permission-denied"
  );
  assert.equal(retry.__state.drafts.size, 0, "un rechazo posterior debe retirar la escritura pendiente previa");
});

test("reconstruye desde el prefijo local programa y todas sus colecciones", async () => {
  const persistence = await loadPersistenceHarness();
  const scope = { patientId: "patient-2", programId: "program-local" };
  const drafts = [
    ["program", "program-local", { programId: "program-local", status: "active" }],
    ["evaluation", "evaluation-1", { id: "evaluation-1", status: "completed" }],
    ["profile", "profile-1", { id: "profile-1", attention: 0.7 }],
    ["plan", "plan-1", { id: "plan-1", weeks: 8 }],
    ["goal", "goal-1", { id: "goal-1", metric: "omissions" }],
    ["session", "session-1", { id: "session-1", status: "planned" }],
    ["challenge", "challenge-1", { id: "challenge-1", status: "assigned" }],
    ["result", "result-1", { summary: {
      id: "result-1",
      idResultado: "result-1",
      resultId: "result-1",
      programId: "program-local",
      protocolId: "test-protocol",
      protocolVersion: "test-version",
      persistenceSchemaVersion: "test-schema",
      taskId: "cpt_x",
      completedAtIso: "2026-08-31T10:00:00.000Z"
    } }],
    ["audit", "audit-1", { id: "audit-1", auditId: "audit-1", eventType: "program_created" }]
  ];
  for (const [kind, id, data] of drafts) {
    await persistence.saveAdhdDraft({ ...scope, kind, id, data });
    persistence.__state.now += 1;
  }
  persistence.__state.readErrorCode = "unavailable";

  const bundle = await persistence.loadAdhdProgramBundle(scope);
  assert.equal(bundle.source, "indexeddb");
  assert.equal(bundle.pendingSync, false, "los borradores manuales no deben anunciarse como escrituras remotas pendientes");
  assert.equal(bundle.pendingRemoteWriteCount, 0);
  assert.equal(bundle.localDraftCount, 9);
  assert.equal(bundle.program.status, "active");
  assert.deepEqual([
    bundle.evaluations.length,
    bundle.profiles.length,
    bundle.plans.length,
    bundle.goals.length,
    bundle.sessions.length,
    bundle.challenges.length,
    bundle.resultRecords.length,
    bundle.audit.length
  ], [1, 1, 1, 1, 1, 1, 1, 1]);
  assert.equal(bundle.profile.id, "profile-1");
  assert.equal(bundle.plan.id, "plan-1");
  assert.equal(bundle.taskResults.cpt_x.resultId, "result-1");
});

test("sincroniza pendientes de red una vez y descarta una escritura frente a remoto más nuevo", async () => {
  const persistence = await loadPersistenceHarness();
  const scope = { patientId: "patient-3", programId: "program-sync" };
  persistence.__state.writeErrorCode = "unavailable";
  const queued = await persistence.saveProgram({ ...scope, data: { status: "active", marker: "local" } });
  assert.equal(queued.pendingSync, true);
  assert.equal(persistence.__state.drafts.size, 1);

  persistence.__state.writeErrorCode = null;
  const first = await persistence.syncPendingAdhdWrites(scope);
  assert.equal(first.synced, 1);
  assert.equal(persistence.__state.drafts.size, 0);
  const second = await persistence.syncPendingAdhdWrites(scope);
  assert.equal(second.total, 0, "el reintento debe ser idempotente");

  persistence.__state.now = 2_000;
  persistence.__state.writeErrorCode = "unavailable";
  await persistence.saveProgram({ ...scope, data: { status: "paused", marker: "stale-local" } });
  persistence.__putRemote(
    "usuarios/patient-3/rehabilitacionProgramas/program-sync",
    { status: "active", marker: "newer-remote", updatedAt: Date.now() + 60_000 }
  );
  persistence.__state.writeErrorCode = null;
  const conflict = await persistence.syncPendingAdhdWrites(scope);
  assert.equal(conflict.skippedRemoteNewer, 1);
  assert.equal(persistence.__state.drafts.size, 0);
  assert.equal(
    persistence.__state.remote.get("usuarios/patient-3/rehabilitacionProgramas/program-sync").marker,
    "newer-remote"
  );
});

test("un rechazo de permiso durante reintento sale de la cola y no se reintenta", async () => {
  const persistence = await loadPersistenceHarness();
  const scope = { patientId: "patient-4", programId: "program-rejected" };
  persistence.__state.writeErrorCode = "unavailable";
  await persistence.saveProgram({ ...scope, data: { status: "active" } });
  assert.equal(persistence.__state.drafts.size, 1);

  persistence.__state.writeErrorCode = null;
  persistence.__state.readErrorCode = "permission-denied";
  await assert.rejects(persistence.syncPendingAdhdWrites(scope), (error) => error.code === "permission-denied");
  assert.equal(persistence.__state.drafts.size, 0);

  persistence.__state.readErrorCode = null;
  const readsBefore = persistence.__state.reads;
  const retry = await persistence.syncPendingAdhdWrites(scope);
  assert.equal(retry.total, 0);
  assert.equal(persistence.__state.reads, readsBefore, "no debe consultar Firestore otra vez sin pendientes");
});

test("no anuncia pendingSync cuando el respaldo IndexedDB no pudo escribirse", async () => {
  const persistence = await loadPersistenceHarness();
  persistence.__state.writeErrorCode = "unavailable";
  persistence.__state.draftWriteFails = true;
  await assert.rejects(
    persistence.saveProgram({ patientId: "patient-5", programId: "program-no-local", data: { status: "active" } }),
    (error) => error.code === "adhd/local-draft-unavailable"
  );
  assert.equal(persistence.__state.drafts.size, 0);
});

test("una escritura remota colgada conserva primero el borrador y libera la interfaz por tiempo límite", async () => {
  const persistence = await loadPersistenceHarness();
  persistence.__state.writeHangs = true;
  const startedAt = Date.now();
  const result = await persistence.saveProgram({
    patientId: "patient-timeout",
    programId: "program-timeout",
    data: { status: "active" },
    remoteTimeoutMs: 250
  });

  assert.equal(result.pendingSync, true);
  assert.equal(result.savedRemotely, false);
  assert.equal(result.errorCode, "deadline-exceeded");
  assert.equal(persistence.__state.drafts.size, 1, "el dato debe existir localmente antes de continuar");
  assert.ok(Date.now() - startedAt < 1_500, "la interfaz no debe esperar indefinidamente a Firestore");
});

test("una carga remota colgada libera el estado ocupado y conserva el estado honesto de indisponibilidad", async () => {
  const persistence = await loadPersistenceHarness();
  persistence.__state.readHangs = true;
  const startedAt = Date.now();
  const bundle = await persistence.loadAdhdProgramBundle({
    patientId: "patient-load-timeout",
    programId: "program-load-timeout",
    remoteTimeoutMs: 250
  });

  assert.equal(bundle.source, "unavailable");
  assert.equal(bundle.loadErrorCode, "deadline-exceeded");
  assert.equal(bundle.program, null);
  assert.ok(Date.now() - startedAt < 1_500, "la selección del paciente no debe quedar ocupada indefinidamente");
});

test("los errores no transitorios se propagan y no quedan en una cola eterna", async () => {
  const persistence = await loadPersistenceHarness();
  persistence.__state.writeErrorCode = "invalid-argument";
  await assert.rejects(
    persistence.saveProgram({ patientId: "patient-6", programId: "program-invalid", data: { status: "active" } }),
    (error) => error.code === "invalid-argument"
  );
  assert.equal(persistence.__state.drafts.size, 0);

  persistence.__state.writeErrorCode = "unavailable";
  await persistence.saveProgram({ patientId: "patient-6", programId: "program-invalid", data: { status: "active" } });
  persistence.__state.writeErrorCode = "invalid-argument";
  const report = await persistence.syncPendingAdhdWrites({ patientId: "patient-6", programId: "program-invalid" });
  assert.equal(report.pendingSync, false);
  assert.equal(report.remainingPending, 0);
  assert.equal(persistence.__state.drafts.size, 0);
});

test("carga solo resultados canónicos del programa y los ordena cronológicamente", async () => {
  const persistence = await loadPersistenceHarness();
  const base = "usuarios/patient-7/rehabilitacionResultados";
  const canonical = (id, completedAtIso) => ({
    id,
    idResultado: id,
    resultId: id,
    programId: "program-results",
    protocolId: "test-protocol",
    protocolVersion: "test-version",
    persistenceSchemaVersion: "test-schema",
    taskId: "cpt_x",
    completedAtIso
  });
  persistence.__putRemote(`${base}/newer`, canonical("newer", "2026-09-02T10:00:00.000Z"));
  persistence.__putRemote(`${base}/older`, canonical("older", "2026-09-01T10:00:00.000Z"));
  persistence.__putRemote(`${base}/forged`, {
    id: "forged",
    idResultado: "forged",
    resultId: "forged",
    programId: "program-results",
    taskId: "cpt_x",
    completedAtIso: "2026-09-03T10:00:00.000Z"
  });

  const bundle = await persistence.loadAdhdProgramBundle({ patientId: "patient-7", programId: "program-results" });
  assert.deepEqual(bundle.resultRecords.map((record) => record.id), ["older", "newer"]);
  assert.equal(bundle.taskResults.cpt_x.id, "newer");
});

test("el almacén local enumera borradores por cursor y rango de prefijo", async () => {
  const source = await readFile(new URL("../js/services/clinicalLocalStore.js", import.meta.url), "utf8");
  const adapterSource = await readFile(new URL("../js/adhd/services/adhdPersistenceAdapter.js", import.meta.url), "utf8");
  assert.match(source, /export async function listarBorradoresClinicosLocalesPorPrefijo/u);
  assert.match(source, /IDBKeyRange\.bound\(safePrefix, upperBound/u);
  assert.match(source, /store\.openCursor\(range\)/u);
  assert.match(source, /startsWith\(safePrefix\)/u);
  assert.match(source, /return request \? registro : null/u);
  assert.match(adapterSource, /addEventListener\("online"/u);
  assert.match(adapterSource, /export function syncPendingAdhdWrites/u);
  assert.match(adapterSource, /remoteTimestamp\s*>\s*record\.intentTimestamp/u);
});
