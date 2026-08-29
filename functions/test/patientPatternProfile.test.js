const assert = require("assert");
const { extractClinicalVariables } = require("../clinicalAnalytics/variableExtractor");
const { buildPatientPatternProfile } = require("../clinicalAnalytics/patientPatternProfileBuilder");
const { buildBssObservation } = require("../clinicalAnalytics/suicideIdeationBeckInferenceService");
const { normalizeClinicalTime } = require("../clinicalAnalytics/patientTemporalNormalizer");
const {
  confirmedBssInstrument,
  getPatientPatternProfile,
  reviewPatientPatternResult,
  searchAuthorizedPatternPatients
} = require("../clinicalAnalytics/patientPatternHandlers");
const { assertAuthorizedPatientClinician } = require("../clinicalAnalytics/access");

function bssItems(count = 19) {
  return Array.from({ length: count }, (_value, index) => ({
    numero: index + 1,
    puntuacion: index < 7 ? 2 : 0,
    confianza: 0.9,
    evidencia: `Evidencia del reactivo ${index + 1}`
  }));
}

const completeBss = buildBssObservation({
  id: "bss-complete",
  nombreEscala: "BSS",
  fechaAplicacion: "2026-08-20",
  reactivos: bssItems(19),
  parametros: { deseoMorir: "Presente", plan: "Presente" }
}, "resultadosEscalas");
assert.strictEqual(completeBss.scoreStatus, "complete");
assert.strictEqual(completeBss.rawScore, 14);
assert.strictEqual(completeBss.normalizedScore, 14 / 38);
assert.strictEqual(completeBss.coverage, 1);
assert.deepStrictEqual(completeBss.missingItems, []);
const confirmedBss = confirmedBssInstrument({
  itemResults: [{ itemNumber: 1, value: 1 }, { itemNumber: 2, value: 2, reviewStatus: "corrected", clinicianValue: 2 }],
  audit: { clinicianCorrections: 1 }
}, "doctor-authorized", "2026-08-21T10:00:00.000Z");
assert.strictEqual(confirmedBss.clinicianReviewed, true);
assert.ok(confirmedBss.itemResults.every((item) => item.clinicianReviewed));
assert.strictEqual(confirmedBss.itemResults[1].reviewStatus, "corrected", "Confirmar no debe borrar una corrección previa");
assert.strictEqual(confirmedBss.audit.clinicianCorrections, 1);

const partialBss = buildBssObservation({
  id: "bss-partial",
  nombreEscala: "Escala de Ideación Suicida de Beck",
  fechaAplicacion: "2026-08-19",
  reactivos: bssItems(12),
  puntajeTotal: 9
}, "escalasAplicadas");
assert.strictEqual(partialBss.scoreStatus, "partial");
assert.strictEqual(partialBss.rawScore, null, "Una suma parcial no debe exponerse como BSS final");
assert.strictEqual(partialBss.normalizedScore, null);
assert.strictEqual(partialBss.coveredItems, 12);
assert.deepStrictEqual(partialBss.missingItems, [13, 14, 15, 16, 17, 18, 19]);

const temporal = normalizeClinicalTime("Hace tres días presentó ideación suicida.", "2026-08-20T12:00:00.000Z");
assert.strictEqual(temporal.estimatedClinicalTime.slice(0, 10), "2026-08-17");
assert.strictEqual(temporal.documentDate.slice(0, 10), "2026-08-20");
assert.strictEqual(temporal.temporalPrecision, "day");

const initialContext = {
  patientId: "patient-protected",
  patient: { edad: 32 },
  records: {
    notasMedicas: [{ id: "note-1", _recordType: "notasMedicas", fecha: "2026-08-18", texto: "Refiere que hace tres días presentó ideación suicida con plan." }],
    resultadosEscalas: [{ id: "bss-complete", _recordType: "resultadosEscalas", nombreEscala: "BSS", fechaAplicacion: "2026-08-18", reactivos: bssItems(19) }]
  }
};
const initialVariables = extractClinicalVariables(initialContext);
const initialProfile = buildPatientPatternProfile({ patientId: "patient-protected", context: initialContext, variables: initialVariables });
const initialPattern = initialProfile.patterns.find((item) => item.key === "suicidal_ideation");
assert.ok(initialPattern.observations.some((item) => item.status === "present"));
assert.ok(initialProfile.quantitativeFeatures.some((item) => item.feature === "suicidalIdeationBSS" && item.rawValue === 14));
assert.ok(initialProfile.snapshots.some((snapshot) => snapshot.featureValues.treatmentAbandonment === null), "Desconocido debe conservarse como null");
const repeatedProfile = buildPatientPatternProfile({ patientId: "patient-protected", context: initialContext, variables: initialVariables, existingProfile: initialProfile });
assert.strictEqual(repeatedProfile.patternObservations.length, initialProfile.patternObservations.length, "Procesar dos veces el mismo contenido no debe duplicar observaciones");
assert.strictEqual(repeatedProfile.instruments.length, initialProfile.instruments.length, "Procesar dos veces el mismo instrumento no debe duplicarlo");

const incrementalContext = {
  ...initialContext,
  records: {
    ...initialContext.records,
    tratamientos: [{ id: "treatment-1", _recordType: "tratamientos", fechaSuspension: "2026-08-20", medicamento: "Tratamiento documentado" }]
  }
};
const incrementalProfile = buildPatientPatternProfile({
  patientId: "patient-protected",
  context: incrementalContext,
  variables: extractClinicalVariables(incrementalContext),
  existingProfile: initialProfile,
  affectedPatternKeys: ["treatment_abandonment"]
});
assert.deepStrictEqual(
  incrementalProfile.patterns.find((item) => item.key === "suicidal_ideation").observations.map((item) => item.id),
  initialPattern.observations.map((item) => item.id),
  "Actualizar tratamientos no debe recalcular la serie de ideación suicida"
);
assert.strictEqual(incrementalProfile.patterns.find((item) => item.key === "treatment_abandonment").status, "present");
assert.deepStrictEqual(incrementalProfile.affectedPatternKeys, ["treatment_abandonment"]);

const undatedContext = {
  patientId: "patient-protected",
  patient: {},
  records: {
    notasMedicas: [{ id: "note-without-date", _recordType: "notasMedicas", texto: "Registro sin fecha documental." }]
  }
};
const undatedProfile = buildPatientPatternProfile({ patientId: "patient-protected", context: undatedContext, variables: [] });
assert.strictEqual(undatedProfile.sourceDocuments[0].sourceDate, null, "Una fecha ausente no debe convertirse en 1970");

const emptyProfile = buildPatientPatternProfile({
  patientId: "patient-without-data",
  context: { patientId: "patient-without-data", patient: {}, records: {} },
  variables: []
});
assert.strictEqual(emptyProfile.patternObservations.length, 0);
assert.ok(emptyProfile.patterns.every((pattern) => pattern.status === "insufficient_data"));
assert.ok(emptyProfile.patterns.every((pattern) => pattern.currentState?.value === null));

const nextContext = {
  patientId: "patient-protected",
  patient: { edad: 32 },
  records: {
    notasMedicas: [{ id: "note-2", _recordType: "notasMedicas", fecha: "2026-08-20", texto: "Actualmente niega ideación suicida." }]
  }
};
const nextProfile = buildPatientPatternProfile({
  patientId: "patient-protected",
  context: nextContext,
  variables: extractClinicalVariables(nextContext),
  existingProfile: initialProfile
});
const nextPattern = nextProfile.patterns.find((item) => item.key === "suicidal_ideation");
assert.strictEqual(nextPattern.status, "absent");
assert.ok(nextPattern.observations.some((item) => item.status === "present"), "La observación previa no debe eliminarse");
assert.ok(nextPattern.observations.some((item) => item.status === "absent"), "La negación debe generar una observación negativa");
assert.strictEqual(nextPattern.currentState.value, false);
assert.ok(nextPattern.evidence.every((item) => item.ruleApplied), "Toda evidencia debe conservar la regla aplicada");

const contextualRecords = [
  ["note-historical", "Antecedente de intento suicida en 2024.", "historical"],
  ["note-family", "Madre falleció por suicidio.", "insufficient_data"],
  ["note-possible", "Se debe descartar ideación suicida.", "possible"]
];
contextualRecords.forEach(([id, texto, expectedStatus]) => {
  const context = {
    patientId: "patient-protected",
    patient: {},
    records: { notasMedicas: [{ id, _recordType: "notasMedicas", fecha: "2026-08-21", texto }] }
  };
  const profile = buildPatientPatternProfile({ patientId: "patient-protected", context, variables: extractClinicalVariables(context) });
  const pattern = profile.patterns.find((item) => item.key === "suicidal_ideation");
  if (id === "note-historical") {
    const attempt = profile.clinicalVariables.find((item) => item.variableId === "suicide_attempt");
    assert.strictEqual(attempt.provenance.assertionContext, "HISTORICAL", "El antecedente conserva su contexto temporal");
  } else {
    assert.strictEqual(pattern.status, expectedStatus, "El contexto no debe convertirse en presencia actual");
  }
  assert.ok(profile.evidence.every((item) => item.assertionContext), "La evidencia conserva contexto de aserción");
});

const deletedSourceProfile = buildPatientPatternProfile({
  patientId: "patient-protected",
  context: { patientId: "patient-protected", patient: { edad: 32 }, records: {} },
  variables: [],
  existingProfile: nextProfile
});
const deletedSourcePattern = deletedSourceProfile.patterns.find((item) => item.key === "suicidal_ideation");
assert.strictEqual(deletedSourcePattern.status, "insufficient_data", "Una fuente eliminada no debe seguir definiendo el estado actual");
assert.strictEqual(deletedSourcePattern.currentState.stale, true);
assert.ok(deletedSourcePattern.observations.length >= nextPattern.observations.length, "Eliminar una fuente no debe borrar el historial de observaciones");

async function verifyBackendDenial() {
  const db = {
    doc(path) {
      return {
        async get() {
          if (path === "usuarios/patient-user") return { exists: true, data: () => ({ rol: "paciente" }) };
          return { exists: false, data: () => ({}) };
        }
      };
    }
  };
  await assert.rejects(
    () => getPatientPatternProfile({
      request: { auth: { uid: "patient-user", token: {} }, data: { patientId: "patient-protected" } },
      db
    }),
    (error) => error.code === "permission-denied"
  );
}

async function verifyStrictClinicianAccess() {
  const profiles = {
    "usuarios/doctor-authorized": { rol: "medico" },
    "usuarios/admin-only": { rol: "admin" },
    "usuarios/patient-protected": { rol: "paciente", medicoUid: "doctor-authorized" }
  };
  const db = {
    doc(path) {
      return {
        async get() {
          const value = profiles[path];
          return { exists: Boolean(value), data: () => value || {} };
        }
      };
    }
  };
  const allowed = await assertAuthorizedPatientClinician({ auth: { uid: "doctor-authorized", token: {} } }, db, "patient-protected");
  assert.strictEqual(allowed.patient.medicoUid, "doctor-authorized");
  await assert.rejects(
    () => assertAuthorizedPatientClinician({ auth: { uid: "admin-only", token: { admin: true } } }, db, "patient-protected"),
    (error) => error.code === "permission-denied"
  );
}

function createReviewDb({ authorized = true } = {}) {
  const writes = new Map();
  const originalObservation = {
    id: "observation-1",
    patternKey: "suicidal_ideation",
    status: "present",
    value: true,
    confidence: 0.91,
    evidenceIds: ["evidence-1"]
  };
  const values = new Map([
    ["usuarios/doctor-authorized", { rol: "medico" }],
    ["usuarios/patient-protected", { rol: "paciente", medicoTratanteUid: authorized ? "doctor-authorized" : "doctor-other" }],
    ["usuarios/patient-protected/clinicalPatternProfiles/current/observations/observation-1", originalObservation]
  ]);
  function reference(path) {
    return {
      path,
      async get() {
        const value = values.get(path);
        return { exists: Boolean(value), data: () => value || {} };
      },
      async set(value) {
        writes.set(path, value);
      },
      collection(name) {
        return collection(`${path}/${name}`);
      }
    };
  }
  function collection(path) {
    return {
      doc(id) {
        return reference(`${path}/${id}`);
      }
    };
  }
  return {
    writes,
    doc(path) {
      return reference(path);
    },
    collection(path) {
      return collection(path);
    }
  };
}

async function verifySeparatedReview() {
  const db = createReviewDb();
  const result = await reviewPatientPatternResult({
    request: {
      auth: { uid: "doctor-authorized", token: {} },
      data: {
        patientId: "patient-protected",
        targetType: "pattern_observation",
        targetId: "observation-1",
        action: "correct",
        clinicianValue: false,
        status: "absent"
      }
    },
    db
  });
  assert.strictEqual(result.reviewStoredSeparately, true);
  assert.strictEqual(db.writes.size, 1, "La revisión no debe modificar el perfil computado");
  const [reviewPath, review] = [...db.writes.entries()][0];
  assert.match(reviewPath, /^usuarios\/patient-protected\/clinicalPatternReviews\/review-/);
  assert.strictEqual(review.action, "correct");
  assert.strictEqual(review.status, "absent");
  assert.strictEqual(review.clinicianValue, false);
  assert.strictEqual(review.changedBy, "doctor-authorized");
  assert.ok(Date.parse(review.changedAt));
  assert.deepStrictEqual(review.originalInference, {
    id: "observation-1",
    patternKey: "suicidal_ideation",
    status: "present",
    value: true,
    confidence: 0.91,
    evidenceIds: ["evidence-1"]
  });

  const deniedDb = createReviewDb({ authorized: false });
  await assert.rejects(
    () => reviewPatientPatternResult({
      request: {
        auth: { uid: "doctor-authorized", token: {} },
        data: {
          patientId: "patient-protected",
          targetType: "pattern_observation",
          targetId: "observation-1",
          action: "confirm"
        }
      },
      db: deniedDb
    }),
    (error) => error.code === "permission-denied"
  );
  assert.strictEqual(deniedDb.writes.size, 0);
}

function createSearchDb({ actorRole = "medico" } = {}) {
  const patients = [
    { id: "patient-authorized", data: () => ({ rol: "paciente", nombreCompleto: "Paciente Autorizado", curp: "CURP-NO-EXPONER", medicoTratanteUid: "doctor-authorized" }) },
    { id: "patient-other", data: () => ({ rol: "paciente", nombreCompleto: "Paciente Ajeno", curp: "CURP-AJENO", medicoTratanteUid: "doctor-other" }) }
  ];
  return {
    doc(path) {
      return {
        async get() {
          if (path === "usuarios/doctor-authorized") return { exists: true, data: () => ({ rol: actorRole }) };
          const patient = patients.find((item) => path === `usuarios/${item.id}`);
          return patient ? { exists: true, data: patient.data } : { exists: false, data: () => ({}) };
        }
      };
    },
    collection(path) {
      assert.strictEqual(path, "usuarios");
      return {
        where(field, operator, value) {
          assert.deepStrictEqual([field, operator, value], ["rol", "==", "paciente"]);
          return { async get() { return { docs: patients }; } };
        }
      };
    }
  };
}

async function verifyAuthorizedSearch() {
  const result = await searchAuthorizedPatternPatients({
    request: { auth: { uid: "doctor-authorized", token: {} }, data: { query: "autoriz" } },
    db: createSearchDb()
  });
  assert.strictEqual(result.curpReturned, false);
  assert.deepStrictEqual(result.patients.map((patient) => patient.id), ["patient-authorized"]);
  assert.ok(!JSON.stringify(result).includes("CURP-NO-EXPONER"));
  await assert.rejects(
    () => searchAuthorizedPatternPatients({
      request: { auth: { uid: "doctor-authorized", token: {} }, data: { query: "" } },
      db: createSearchDb({ actorRole: "paciente" })
    }),
    (error) => error.code === "permission-denied"
  );
}

Promise.all([verifyBackendDenial(), verifyStrictClinicianAccess(), verifySeparatedReview(), verifyAuthorizedSearch()])
  .then(() => console.log("patientPatternProfile.test.js: ok"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
