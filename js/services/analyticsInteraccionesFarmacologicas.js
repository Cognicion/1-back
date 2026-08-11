import { auth, db } from "../firebase.js";
import {
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLECCION_ANALYTICS = "analytics_interacciones_farmacologicas";

export async function registrarUsoConsultaInteracciones({
  eventType,
  selectedMedicationIds = [],
  resultCount = 0,
  highSeverityCount = 0
} = {}) {
  const usuario = auth?.currentUser || null;
  const payload = {
    eventType,
    userId: usuario?.uid || null,
    userName: usuario?.displayName || "INVITADO",
    isAuthenticated: Boolean(usuario),
    timestamp: serverTimestamp(),
    page: "index",
    selectedMedicationCount: selectedMedicationIds.length,
    selectedMedicationIds: [...new Set(selectedMedicationIds)].slice(0, 20),
    resultCount: Number(resultCount || 0),
    highSeverityCount: Number(highSeverityCount || 0),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    source: "public-index-interactions"
  };

  try {
    await addDoc(collection(db, COLECCION_ANALYTICS), payload);
    return true;
  } catch (error) {
    console.warn("No se pudo registrar el uso de interacciones farmacologicas:", error?.code || error?.message || error);
    return false;
  }
}

export { COLECCION_ANALYTICS };
