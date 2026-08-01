import { db } from "../firebase.js";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { LEGAL_VERSION } from "./legalDocuments.js";

function crearDatosConsentimientos({ communications = false } = {}) {
  return { legalConsents: { privacyNotice: { accepted: true, version: LEGAL_VERSION, acceptedAt: serverTimestamp(), source: "signup", documentType: "privacy_notice" }, betaConsent: { accepted: true, version: LEGAL_VERSION, acceptedAt: serverTimestamp(), source: "signup", documentType: "beta_consent" }, communications: { accepted: Boolean(communications), version: LEGAL_VERSION, acceptedAt: serverTimestamp(), source: "signup", documentType: "communications" } }, legalConsentVersion: LEGAL_VERSION, legalConsentUpdatedAt: serverTimestamp() };
}

async function guardarConsentimientosLegales(uid, preferences, { reintentos = 1 } = {}) {
  let ultimoError;
  for (let intento = 0; intento <= reintentos; intento += 1) { try { await setDoc(doc(db, "usuarios", uid), crearDatosConsentimientos(preferences), { merge: true }); return; } catch (error) { ultimoError = error; console.error("[LEGAL][SIGNUP] Error de persistencia", { intento: intento + 1, code: error?.code || "unknown" }); } }
  throw ultimoError;
}

async function obtenerEstadoConsentimientoLegal(usuario) {
  const datos = usuario?.uid ? (await getDoc(doc(db, "usuarios", usuario.uid))).data() || {} : usuario || {};
  const privacy = datos.legalConsents?.privacyNotice || {};
  const beta = datos.legalConsents?.betaConsent || {};
  return { privacyAccepted: privacy.accepted === true, privacyVersion: privacy.version || datos.versionAvisoPrivacidad || null, privacyAcceptedAt: privacy.acceptedAt || datos.fechaAceptacionAviso || null, betaAccepted: beta.accepted === true, betaVersion: beta.version || null, betaAcceptedAt: beta.acceptedAt || null, communicationsAccepted: datos.legalConsents?.communications?.accepted === true, communicationsAcceptedAt: datos.legalConsents?.communications?.acceptedAt || null, requiresUpdate: privacy.version !== LEGAL_VERSION || beta.version !== LEGAL_VERSION || privacy.accepted !== true || beta.accepted !== true };
}

async function actualizarPreferenciaComunicaciones(uid, accepted) {
  await updateDoc(doc(db, "usuarios", uid), { "legalConsents.communications": { accepted: Boolean(accepted), version: LEGAL_VERSION, acceptedAt: serverTimestamp(), source: "settings", documentType: "communications" } });
}

export { crearDatosConsentimientos, guardarConsentimientosLegales, obtenerEstadoConsentimientoLegal, actualizarPreferenciaComunicaciones };
