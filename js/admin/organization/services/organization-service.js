import { db } from "../../../firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const ORGANIZATION_COLLECTIONS = Object.freeze([
  "members", "areas", "roles", "assignments", "projects", "opportunities",
  "talentNeeds", "risks", "objectives", "decisions", "alliances", "capabilities",
  "businessLines", "products", "hypotheses", "organizationEvents"
]);

const PRIVATE_COLLECTION = "privateRecords";
const MAX_TEXT_LENGTH = 5000;

function cleanValue(value) {
  if (typeof value === "string") return value.trim().slice(0, MAX_TEXT_LENGTH);
  if (Array.isArray(value)) return value.slice(0, 250).map(cleanValue).filter((item) => item !== "");
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !["id", "createdAt", "updatedAt", "createdBy", "updatedBy"].includes(key)).map(([key, item]) => [key, cleanValue(item)]));
  }
  return value ?? null;
}

function organizationRef(organizationId) {
  return doc(db, "organizations", organizationId);
}

function entityCollection(organizationId, type) {
  if (!ORGANIZATION_COLLECTIONS.includes(type) && type !== PRIVATE_COLLECTION) throw new Error("ORGANIZATION_ENTITY_NOT_ALLOWED");
  return collection(organizationRef(organizationId), type);
}

export async function loadOrganization(organizationId) {
  const [organizationSnapshot, ...collections] = await Promise.all([
    getDoc(organizationRef(organizationId)),
    ...ORGANIZATION_COLLECTIONS.map((type) => getDocs(entityCollection(organizationId, type)))
  ]);
  const data = { organization: organizationSnapshot.exists() ? { id: organizationSnapshot.id, ...organizationSnapshot.data() } : { id: organizationId, name: "COGNICIÓN Labs" } };
  ORGANIZATION_COLLECTIONS.forEach((type, index) => {
    data[type] = collections[index].docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
  });
  return data;
}

export async function saveOrganizationMetadata(organizationId, payload, actorUid) {
  await setDoc(organizationRef(organizationId), {
    ...cleanValue(payload),
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
    schemaVersion: 1
  }, { merge: true });
}

export async function saveEntity({ organizationId, type, id, payload, actorUid }) {
  const reference = id ? doc(entityCollection(organizationId, type), id) : doc(entityCollection(organizationId, type));
  const existing = id ? await getDoc(reference) : null;
  const now = serverTimestamp();
  const value = cleanValue(payload);
  await setDoc(reference, {
    ...value,
    updatedAt: now,
    updatedBy: actorUid,
    ...(existing?.exists() ? {} : { createdAt: now, createdBy: actorUid }),
    schemaVersion: 1
  }, { merge: true });
  await appendAuditEvent({
    organizationId,
    actorUid,
    action: existing?.exists() ? `${type}_updated` : `${type}_created`,
    entityType: type,
    entityId: reference.id,
    summary: String(value.name || value.title || value.profile || "Registro organizacional").slice(0, 180)
  });
  return reference.id;
}

export async function archiveEntity({ organizationId, type, id, actorUid }) {
  if (!id) throw new Error("ORGANIZATION_ENTITY_ID_REQUIRED");
  await setDoc(doc(entityCollection(organizationId, type), id), {
    archived: true,
    archivedAt: serverTimestamp(),
    archivedBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid
  }, { merge: true });
  await appendAuditEvent({ organizationId, actorUid, action: `${type}_archived`, entityType: type, entityId: id, summary: "Registro archivado" });
}

export async function appendAuditEvent({ organizationId, actorUid, action, entityType, entityId, summary }) {
  const reference = doc(entityCollection(organizationId, "organizationEvents"));
  await setDoc(reference, {
    actorUid,
    action,
    entityType,
    entityId,
    summary: String(summary || "").slice(0, 300),
    timestamp: serverTimestamp(),
    schemaVersion: 1
  });
}

export async function createInitialStructure({ organizationId, actorUid, areas }) {
  const organizationSnapshot = await getDoc(organizationRef(organizationId));
  const areasSnapshot = await getDocs(entityCollection(organizationId, "areas"));
  if (organizationSnapshot.exists() || !areasSnapshot.empty) throw new Error("ORGANIZATION_ALREADY_INITIALIZED");
  const batch = writeBatch(db);
  batch.set(organizationRef(organizationId), { name: "COGNICIÓN Labs", schemaVersion: 1, createdAt: serverTimestamp(), createdBy: actorUid });
  areas.forEach((name) => batch.set(doc(entityCollection(organizationId, "areas")), { name, status: "Planeada", coverage: "Descubierta", schemaVersion: 1, createdAt: serverTimestamp(), createdBy: actorUid }));
  await batch.commit();
  await appendAuditEvent({ organizationId, actorUid, action: "organization_initialized", entityType: "organization", entityId: organizationId, summary: "Estructura inicial creada con áreas sugeridas" });
}

export function exportOrganizationJson(data) {
  const safe = Object.fromEntries(Object.entries(data).filter(([key]) => key !== PRIVATE_COLLECTION));
  return JSON.stringify({ exportedAt: new Date().toISOString(), schemaVersion: 1, ...safe }, null, 2);
}

export function exportCollectionCsv(items = []) {
  const keys = [...new Set(items.flatMap((item) => Object.keys(item).filter((key) => !["createdAt", "updatedAt"].includes(key))))];
  const encode = (value) => `"${String(typeof value === "object" && value !== null ? JSON.stringify(value) : value ?? "").replaceAll('"', '""')}"`;
  return [keys.map(encode).join(","), ...items.map((item) => keys.map((key) => encode(item[key])).join(","))].join("\n");
}
