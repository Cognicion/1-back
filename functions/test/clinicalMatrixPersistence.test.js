const assert = require("assert");
const { effectiveMatrixStatus, persistPatientFeatureProfile, sortAssociationsForDisplay } = require("../clinicalAnalytics/matrixPersistence");
const { CLINICAL_MATRIX_ENGINE_VERSION } = require("../clinicalAnalytics/config");

assert.deepStrictEqual(effectiveMatrixStatus(null), {
  stale: true,
  staleReason: "not_generated",
  versionOutdated: false,
  currentMatrixEngineVersion: CLINICAL_MATRIX_ENGINE_VERSION
});
const outdatedStatus = effectiveMatrixStatus({ stale: false, matrixEngineVersion: "1.0.0", generatedAt: "2026-08-14T00:00:00.000Z" });
assert.strictEqual(outdatedStatus.stale, true);
assert.strictEqual(outdatedStatus.versionOutdated, true);
assert.strictEqual(outdatedStatus.staleReason, "matrix_engine_version_changed");

const ranked = sortAssociationsForDisplay([
  { associationId: "third", displayRank: 3 },
  { associationId: "first", displayRank: 1 },
  { associationId: "second", displayRank: 2 }
]);
assert.deepStrictEqual(ranked.map((item) => item.associationId), ["first", "second", "third"]);

const legacy = sortAssociationsForDisplay([
  { associationId: "large-unconfirmed", effectSize: 0.9, passesFalseDiscoveryRate: false, sampleSize: 100 },
  { associationId: "candidate", effectSize: 0.3, passesFalseDiscoveryRate: true, sampleSize: 40 },
  { associationId: "small-unconfirmed", effectSize: 0.2, passesFalseDiscoveryRate: false, sampleSize: 100 }
], "mixed_values");
assert.deepStrictEqual(legacy.map((item) => item.associationId), ["candidate", "large-unconfirmed", "small-unconfirmed"]);

function fakeDb() {
  const documents = new Map();
  let writes = 0;
  const reference = (path) => ({
    path,
    collection(name) { return collection(`${path}/${name}`); }
  });
  const collection = (path) => ({
    doc(id) { return reference(`${path}/${id}`); }
  });
  return {
    documents,
    get writes() { return writes; },
    collection,
    async runTransaction(callback) {
      const pending = [];
      const result = await callback({
        async get(ref) {
          return {
            exists: documents.has(ref.path),
            data: () => documents.get(ref.path)
          };
        },
        set(ref, value, options = {}) { pending.push({ ref, value, options }); }
      });
      pending.forEach(({ ref, value, options }) => {
        const previous = options.merge ? documents.get(ref.path) || {} : {};
        documents.set(ref.path, { ...previous, ...value });
        writes += 1;
      });
      return result;
    }
  };
}

(async () => {
  const db = fakeDb();
  const profile = {
    scope: "patient_analytics_profile",
    features: [{ featureId: "age.latest", canonicalName: "edad", domain: "demographics", statisticalType: "continuous", value: 30 }],
    positiveVariableIds: [],
    temporalPairs: [],
    directIdentifiersIncluded: false,
    rawClinicalTextIncluded: false,
    featureProfileVersion: "1.0.0"
  };
  const first = await persistPatientFeatureProfile({ db, patientId: "patient-real", profile });
  const writesAfterFirst = db.writes;
  const second = await persistPatientFeatureProfile({ db, patientId: "patient-real", profile });
  assert.strictEqual(first.updated, true);
  assert.strictEqual(first.duplicate, false);
  assert.strictEqual(second.updated, false);
  assert.strictEqual(second.duplicate, true);
  assert.strictEqual(db.writes, writesAfterFirst, "Reprocesar el mismo perfil no debe duplicar escrituras ni conteos");
  assert.ok(!JSON.stringify([...db.documents.values()]).includes("patient-real"));
  console.log("clinicalMatrixPersistence.test.js: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
