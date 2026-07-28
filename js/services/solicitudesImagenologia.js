import { db } from "../firebase.js";
import { collection, doc, getDocs, setDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const limpiar = (valor) => {
  if (valor === undefined || typeof valor === "function") return undefined;
  if (Array.isArray(valor)) return valor.map(limpiar).filter((item) => item !== undefined);
  if (valor && typeof valor === "object" && !(valor instanceof Date) && typeof valor.toDate !== "function") {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, limpiar(v)]).filter(([, v]) => v !== undefined));
  }
  return Number.isNaN(valor) ? null : valor;
};

export function crearSolicitudImagenologiaId() {
  return globalThis.crypto?.randomUUID?.() || `solicitud-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function guardarSolicitudImagenologia(uidPaciente, solicitud, { definitiva = false } = {}) {
  if (!uidPaciente) throw Object.assign(new Error("Paciente no identificado"), { code: "patient-id-missing" });
  const solicitudId = solicitud.id || crearSolicitudImagenologiaId();
  const estado = definitiva ? "solicitado" : "borrador";
  const referencia = doc(db, "usuarios", uidPaciente, "solicitudesEstudios", solicitudId);
  const datosBase = limpiar({
    ...solicitud,
    id: solicitudId,
    pacienteId: uidPaciente,
    formatoId: "FTO-HPFBA-EXPC-IMG-SEI",
    tipo: "solicitud_imagenologia",
    estado,
    auditoria: {
      ...(solicitud.auditoria || {}),
      actualizadoPor: solicitud.actualizadoPor || ""
    }
  });
  const datos = { ...datosBase, auditoria: { ...(datosBase.auditoria || {}), actualizadoEn: serverTimestamp() } };

  if (!definitiva) {
    await setDoc(referencia, datos, { merge: true });
    return { solicitudId, estado };
  }

  const batch = writeBatch(db);
  batch.set(referencia, { ...datos, generadoEn: serverTimestamp() }, { merge: true });
  (solicitud.estudios || []).forEach((estudio) => {
    const estudioId = `${solicitudId}-${String(estudio.id || estudio.catalogoId || "estudio").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const estudioBase = limpiar({
      id: estudioId,
      solicitudId,
      tipo: "imagen",
      estado: "solicitado",
      nombre: estudio.nombre,
      modalidad: estudio.modalidad,
      region: estudio.region,
      prioridad: estudio.tipo,
      criterioUrgencia: estudio.criterioUrgencia || "",
      observaciones: estudio.observaciones || "",
      fecha: solicitud.solicitud?.fecha || new Date().toISOString().slice(0, 10),
      fechaCreacion: serverTimestamp(),
      solicitadoPor: solicitud.medicoSolicitante?.uid || solicitud.actualizadoPor || ""
    });
    batch.set(doc(db, "usuarios", uidPaciente, "estudios", estudioId), { ...estudioBase, fechaCreacion: serverTimestamp() }, { merge: true });
  });
  await batch.commit();
  return { solicitudId, estado };
}

export async function listarSolicitudesImagenologia(uidPaciente) {
  if (!uidPaciente) return [];
  const snap = await getDocs(collection(db, "usuarios", uidPaciente, "solicitudesEstudios"));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}
