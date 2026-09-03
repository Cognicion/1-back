export const PATIENT_OWNER_FIELDS = [
  "creadoPor",
  "ownerUid",
  "createdByUid",
  "medicoUid",
  "uidMedico",
  "medicoTratanteUid",
  "medicoTratanteUID",
  "medicoTratanteId",
  "idMedico",
  "professionalUid"
];

export const PATIENT_AUTHORIZED_ARRAY_FIELDS = [
  "medicosAutorizados",
  "medicosAutorizadosUid",
  "profesionalesAutorizados",
  "profesionalesAutorizadosIds",
  "equipoClinico",
  "equipoClinicoIds",
  "clinicosAutorizados"
];

export function patientAllowsProfessionalAccess(patient = {}, actorUserId = "") {
  if (!patient || !actorUserId) return false;
  if (patient.rol && patient.rol !== "paciente") return false;
  if (patient.estado === "vinculado" && patient.vinculadoA) return false;

  const ownerMatch = PATIENT_OWNER_FIELDS.some((field) => patient[field] === actorUserId);
  if (ownerMatch) return true;

  const arrayMatch = PATIENT_AUTHORIZED_ARRAY_FIELDS.some((field) => {
    const value = patient[field];
    return Array.isArray(value) && value.includes(actorUserId);
  });
  if (arrayMatch) return true;

  return patient.permisosMedicos?.[actorUserId]?.lectura === true;
}

export function createAuthorizedPatientQueryDescriptors(actorUserId = "") {
  if (!actorUserId) return [];
  return [
    ...PATIENT_OWNER_FIELDS.map((field) => ({ field, operator: "==", value: actorUserId })),
    ...PATIENT_AUTHORIZED_ARRAY_FIELDS.map((field) => ({
      field,
      operator: "array-contains",
      value: actorUserId
    }))
  ];
}

export function patientListCacheKey(actorUserId = "") {
  if (!actorUserId) {
    throw new Error("missing_actor_user_id");
  }
  return `authorized-patients:${actorUserId}`;
}

export function isMissingAuthorizedPatientDirectoryError(error = {}) {
  const code = String(error?.code || "").trim().toLowerCase();
  return code === "functions/not-found";
}

export function normalizeAuthorizedPatientIds(patientIds = []) {
  if (!Array.isArray(patientIds)) return [];
  return [...new Set(patientIds
    .filter((patientId) => typeof patientId === "string")
    .map((patientId) => patientId.trim())
    .filter((patientId) => patientId && !patientId.includes("/")))];
}

export async function resolveAuthorizedPatientDirectory({
  administrator = false,
  loadPrimary
} = {}) {
  if (typeof loadPrimary !== "function") {
    throw new TypeError("loadPrimary must be a function");
  }

  try {
    const result = await loadPrimary();
    return {
      mode: "ids",
      patientIds: normalizeAuthorizedPatientIds(result?.patientIds),
      source: "primary"
    };
  } catch (error) {
    if (!isMissingAuthorizedPatientDirectoryError(error)) throw error;
    if (administrator) {
      return { mode: "admin-query", patientIds: [], source: "admin-compatibility" };
    }
    throw error;
  }
}
