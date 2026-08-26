"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  processClinicalAnalyticsWrite,
  processClinicalPatientWrite
} = require("../clinicalAnalytics/handlers");
const { finalizeEmbeddingRemoval } = require("../clinicalAnalytics/embeddingPersistence");

class Snapshot {
  constructor(value, reference = null) {
    this.exists = value !== undefined;
    this.value = value;
    this.ref = reference;
  }

  data() {
    return this.value;
  }
}

class Reference {
  constructor(db, path) {
    this.db = db;
    this.path = path;
  }

  async delete() {
    this.db.deletedPaths.push(this.path);
    this.db.featureProfileExists = false;
  }

  async get() {
    return this.db.read(this.path);
  }

  async set(value, options = {}) {
    this.db.setOperations.push({ path: this.path, value, options });
  }
}

class CollectionReference {
  constructor(db, path) {
    this.db = db;
    this.path = path;
  }

  doc(id) {
    return new Reference(this.db, `${this.path}/${id}`);
  }

  where(_field, _operator, value) {
    if (this.path === "clinicalAnalyticsRuns" && this.db.analysisArtifacts) {
      const reference = new Reference(this.db, `${this.path}/run-late`);
      return {
        get: async () => ({ docs: [new Snapshot({ analyticsPatientId: value }, reference)], size: 1 })
      };
    }
    return {
      get: async () => ({ docs: [], size: 0 })
    };
  }
}

class GuardedFirestore {
  constructor({
    patientId,
    patientStates = [true],
    tombstoneStates = [false],
    analysisArtifacts = true,
    featureProfileExists = true
  }) {
    this.patientId = patientId;
    this.patientStates = patientStates;
    this.tombstoneStates = tombstoneStates;
    this.analysisArtifacts = analysisArtifacts;
    this.featureProfileExists = featureProfileExists;
    this.patientReads = 0;
    this.tombstoneReads = 0;
    this.deletedPaths = [];
    this.recursiveDeletedPaths = [];
    this.setOperations = [];
  }

  collection(path) {
    return new CollectionReference(this, path);
  }

  collectionGroup(path) {
    return {
      where: (_field, _operator, value) => ({
        get: async () => {
          if (!this.analysisArtifacts || path !== "patients") return { docs: [], size: 0 };
          const clinicalReference = new Reference(
            this,
            `clinicalAnalyticsVariables/mood/patients/${value}`
          );
          const unrelatedReference = new Reference(
            this,
            `unrelatedAnalytics/source/patients/${value}`
          );
          return {
            docs: [
              new Snapshot({ analyticsPatientId: value }, clinicalReference),
              new Snapshot({ analyticsPatientId: value }, unrelatedReference)
            ],
            size: 2
          };
        }
      })
    };
  }

  doc(path) {
    return new Reference(this, path);
  }

  read(path) {
    if (path === `usuarios/${this.patientId}`) {
      const state = this.patientStates[Math.min(this.patientReads, this.patientStates.length - 1)];
      this.patientReads += 1;
      const profile = state && typeof state === "object" ? state : (state ? { rol: "paciente", edad: 38 } : undefined);
      return Promise.resolve(new Snapshot(profile));
    }
    if (path === `accountDeletionTombstones/${this.patientId}`) {
      const state = this.tombstoneStates[Math.min(this.tombstoneReads, this.tombstoneStates.length - 1)];
      this.tombstoneReads += 1;
      return Promise.resolve(new Snapshot(state ? { deletionState: "in_progress" } : undefined));
    }
    if (path.startsWith("clinicalAnalyticsPatientProfiles/")) {
      return Promise.resolve(new Snapshot(this.featureProfileExists ? { profileFingerprint: "old" } : undefined));
    }
    return Promise.resolve(new Snapshot(undefined));
  }

  recursiveDelete(reference) {
    this.recursiveDeletedPaths.push(reference.path);
    return Promise.resolve();
  }

  batch() {
    return {
      delete: (reference) => {
        this.deletedPaths.push(reference.path);
      },
      set: (reference, value, options = {}) => {
        this.setOperations.push({ path: reference.path, value, options });
      },
      commit: async () => {}
    };
  }

  runTransaction(callback) {
    return callback({
      delete: (reference) => {
        this.deletedPaths.push(reference.path);
        this.featureProfileExists = false;
      },
      get: (reference) => this.read(reference.path),
      set: (reference, value, options = {}) => {
        this.setOperations.push({ path: reference.path, value, options });
      }
    });
  }
}

function recordWriteEvent(patientId) {
  return {
    params: { patientId, collectionId: "notasMedicas", recordId: "note-late" },
    data: { after: { exists: true, data: () => ({ texto: "registro de prueba" }) } }
  };
}

function patientWriteEvent(patientId, exists = true) {
  return {
    params: { patientId },
    data: { after: { exists, data: () => ({ rol: "paciente", edad: 38 }) } }
  };
}

function assertCleanupOnly(db, patientId) {
  assert.ok(db.deletedPaths.some((path) => path.startsWith("clinicalAnalyticsPatientProfiles/")), "Debe borrar el perfil global derivado");
  assert.ok(db.deletedPaths.includes("clinicalAnalyticsRuns/run-late"), "Debe borrar los runs desidentificados del paciente");
  assert.ok(
    db.deletedPaths.some((path) => path.startsWith("clinicalAnalyticsVariables/mood/patients/")),
    "Debe borrar el valor del paciente dentro de cada variable global"
  );
  assert.ok(!db.deletedPaths.some((path) => path.startsWith("unrelatedAnalytics/")), "No debe borrar subcolecciones patients ajenas");
  assert.ok(db.recursiveDeletedPaths.includes(`usuarios/${patientId}/clinicalPatternProfiles/current`), "Debe borrar el perfil de patrones protegido");
  assert.ok(!db.setOperations.some(({ path }) => path.startsWith(`usuarios/${patientId}/`)), "No debe recrear subcolecciones bajo una raíz eliminada");
  assert.ok(!db.setOperations.some(({ path }) => path.startsWith("clinicalAnalyticsPatientProfiles/")), "No debe recrear el perfil global derivado");
  assert.ok(
    db.setOperations.some(({ path, value }) => path === "clinicalAnalyticsVariables/mood" && value.aggregateState === "stale"),
    "Debe marcar como stale el agregado de la variable afectada"
  );
  assert.ok(
    db.setOperations.some(({ path, value }) => path === "clinicalAnalyticsQueue/aggregateRebuild" && value.rebuildRequired === true),
    "Debe solicitar la reconstrucción de agregados"
  );
}

test("un update clínico tardío se detiene si aparece el tombstone antes de persistir", async () => {
  const patientId = "patient-tombstoned";
  const db = new GuardedFirestore({
    patientId,
    patientStates: [true, true],
    tombstoneStates: [false, true]
  });

  const result = await processClinicalAnalyticsWrite({
    event: recordWriteEvent(patientId),
    db,
    apiKey: "unused",
    OpenAIClass: class {}
  });

  assert.equal(result.skipped, true);
  assert.equal(result.cleanupOnly, true);
  assert.equal(result.reason, "account_deletion");
  assert.equal(db.patientReads, 2, "Debe volver a comprobar la raíz justo antes de persistir");
  assert.equal(db.tombstoneReads, 2, "Debe volver a comprobar el tombstone justo antes de persistir");
  assertCleanupOnly(db, patientId);
});

test("un update de perfil tardío no recrea datos si la raíz desaparece antes de persistir", async () => {
  const patientId = "patient-root-missing";
  const db = new GuardedFirestore({
    patientId,
    patientStates: [true, false],
    tombstoneStates: [false, false]
  });

  const result = await processClinicalPatientWrite({
    event: patientWriteEvent(patientId),
    db,
    apiKey: "unused",
    OpenAIClass: class {}
  });

  assert.equal(result.skipped, true);
  assert.equal(result.cleanupOnly, true);
  assert.equal(result.reason, "patient_missing");
  assert.equal(db.patientReads, 2, "Debe volver a comprobar la raíz justo antes de persistir");
  assertCleanupOnly(db, patientId);
});

test("un expediente origen ya vinculado solo limpia analítica y no la regenera", async () => {
  const patientId = "patient-linked-origin";
  const db = new GuardedFirestore({
    patientId,
    patientStates: [{
      rol: "paciente",
      estado: "vinculado",
      vinculadoA: "patient-destination"
    }],
    tombstoneStates: [false]
  });

  const result = await processClinicalPatientWrite({
    event: patientWriteEvent(patientId),
    db,
    apiKey: "unused",
    OpenAIClass: class {}
  });

  assert.equal(result.skipped, true);
  assert.equal(result.cleanupOnly, true);
  assert.equal(result.reason, "linked_patient_origin");
  assert.equal(result.linkedPatientOrigin, true);
  assertCleanupOnly(db, patientId);
});

test("el evento de borrado de la raíz limpia embeddings y perfiles derivados globales y protegidos", async () => {
  const patientId = "patient-deleted";
  const db = new GuardedFirestore({ patientId });

  const result = await processClinicalPatientWrite({
    event: patientWriteEvent(patientId, false),
    db,
    apiKey: "unused",
    OpenAIClass: class {}
  });

  assert.equal(result.analysis.removedRuns, 1);
  assert.equal(result.analysis.removedPatientVariables, 1);
  assert.equal(result.analysis.aggregatesMarkedStale, true);
  assert.equal(result.embeddings.removedRecords, 0);
  assert.equal(result.featureProfile.removed, true);
  assert.equal(result.patternProfile.removed, true);
  assertCleanupOnly(db, patientId);
});

test("dos limpiezas del mismo manifest descuentan los contadores de embeddings una sola vez", async () => {
  const manifestPath = "clinicalAnalyticsEmbeddingManifests/manifest-one";
  let manifest = {
    status: "ready",
    fragmentCount: 3,
    sourceCollection: "notasMedicas"
  };
  let transactionTail = Promise.resolve();
  const counterSets = [];
  const db = {
    collection(path) {
      return {
        doc(id) {
          return { path: `${path}/${id}` };
        }
      };
    },
    runTransaction(callback) {
      const transactionRun = transactionTail.then(() => callback({
        delete(reference) {
          if (reference.path === manifestPath) manifest = undefined;
        },
        async get(reference) {
          return new Snapshot(reference.path === manifestPath ? manifest : undefined, reference);
        },
        set(reference, value, options = {}) {
          counterSets.push({ path: reference.path, value, options });
        }
      }));
      transactionTail = transactionRun.catch(() => {});
      return transactionRun;
    }
  };
  const reference = { path: manifestPath };

  const results = await Promise.all([
    finalizeEmbeddingRemoval({ db, ref: reference }),
    finalizeEmbeddingRemoval({ db, ref: reference })
  ]);

  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(counterSets.length, 2, "Solo el ganador debe actualizar status y source");
  assert.deepEqual(
    counterSets.map(({ path }) => path).sort(),
    ["clinicalAnalyticsEmbeddingSources/notasMedicas", "clinicalAnalyticsEmbeddingStatus/current"]
  );
});
