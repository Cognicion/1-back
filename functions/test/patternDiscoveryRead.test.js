const assert = require("assert");
const {
  discoverTextPatterns,
  documentLocation,
  scanTextDocuments
} = require("../patternDiscoveryHandler");
const { CLINICAL_RECORD_COLLECTIONS } = require("../clinicalAnalytics/config");

function fakeDocument(path, data = {}) {
  const parts = path.split("/");
  return {
    id: parts[parts.length - 1],
    ref: { path },
    data: () => data
  };
}

class FakeQuery {
  constructor(documents, limitValue = 200, cursor = null) {
    this.documents = documents;
    this.limitValue = limitValue;
    this.cursor = cursor;
  }

  orderBy() {
    return this;
  }

  limit(value) {
    return new FakeQuery(this.documents, value, this.cursor);
  }

  startAfter(document) {
    return new FakeQuery(this.documents, this.limitValue, document?.ref?.path || null);
  }

  async get() {
    const start = this.cursor
      ? Math.max(0, this.documents.findIndex((document) => document.ref.path === this.cursor) + 1)
      : 0;
    const docs = this.documents.slice(start, start + this.limitValue);
    return { docs, size: docs.length };
  }
}

function fakeDb(groups) {
  const calls = [];
  return {
    calls,
    collectionGroup(name) {
      calls.push({ type: "collectionGroup", name });
      return new FakeQuery(groups[name] || []);
    },
    collection(path) {
      calls.push({ type: "collection", path });
      const query = new FakeQuery(groups[path] || []);
      query.add = async () => ({ id: "audit-1" });
      return query;
    }
  };
}

async function run() {
  assert.deepStrictEqual(
    documentLocation({ path: "usuarios/patient-a/notasMedicas/note-1" }, "notasMedicas"),
    { patientUid: "patient-a", noteId: "usuarios:patient-a:notasMedicas:note-1" }
  );
  assert.strictEqual(documentLocation({ path: "otro/patient-a/notasMedicas/note-1" }, "notasMedicas"), null);

  const db = fakeDb({
    notasMedicas: [
      fakeDocument("usuarios/patient-a/notasMedicas/note-1"),
      fakeDocument("usuarios/patient-b/notasMedicas/note-2")
    ],
    historiaClinica: [fakeDocument("usuarios/patient-c/historiaClinica/history-1")],
    documentosImportados: [fakeDocument("usuarios/patient-d/documentosImportados/document-1")]
  });
  const visited = [];
  const result = await scanTextDocuments({
    db,
    filters: {},
    initialBatchOnly: false,
    deadline: Date.now() + 5000,
    onDocument: async (item) => visited.push(item.location.noteId)
  });

  assert.strictEqual(result.readStrategy, "collection_group");
  assert.strictEqual(result.documentsProcessed, 4);
  assert.strictEqual(result.documentsRead, 4);
  assert.strictEqual(result.readOperations, CLINICAL_RECORD_COLLECTIONS.length);
  assert.strictEqual(result.timeBudgetReached, false);
  assert.strictEqual(visited.length, 4);
  assert.strictEqual(db.calls.some((call) => call.type === "collection" && call.path === "usuarios"), false);
  assert.strictEqual(db.calls.filter((call) => call.type === "collectionGroup").length, CLINICAL_RECORD_COLLECTIONS.length);

  const patientDb = fakeDb({
    "usuarios/patient-a/notasMedicas": [fakeDocument("usuarios/patient-a/notasMedicas/note-1")]
  });
  const patientResult = await scanTextDocuments({
    db: patientDb,
    filters: { paciente: "patient-a" },
    initialBatchOnly: false,
    deadline: Date.now() + 5000,
    onDocument: async () => {}
  });
  assert.strictEqual(patientResult.readStrategy, "patient_scoped_subcollections");
  assert.strictEqual(patientResult.documentsProcessed, 1);
  assert.strictEqual(patientDb.calls.some((call) => call.type === "collectionGroup"), false);

  const discoveryDb = fakeDb({
    notasMedicas: [
      fakeDocument("usuarios/patient-a/notasMedicas/note-1", { texto: "Ansiedad persistente con insomnio grave." }),
      fakeDocument("usuarios/patient-b/notasMedicas/note-2", { texto: "Ansiedad persistente con insomnio grave." }),
      fakeDocument("usuarios/patient-c/notasMedicas/note-3", { texto: "Ansiedad persistente con insomnio grave." })
    ]
  });
  const discovery = await discoverTextPatterns({
    db: discoveryDb,
    request: {
      auth: { uid: "admin-test", token: { admin: true } },
      data: { threshold: 2, initialBatchOnly: false, filtros: {} }
    }
  });
  assert.strictEqual(discovery.ok, true);
  assert.strictEqual(discovery.stats.documentsProcessed, 3);
  assert.strictEqual(discovery.stats.readStrategy, "collection_group");
  assert.ok(discovery.patterns.length > 0);
  assert.ok(discovery.patterns.some((pattern) => pattern.phrase.includes("ansiedad persistente")));

  console.log("patternDiscoveryRead.test.js: ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
