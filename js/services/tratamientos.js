import { db } from "../firebase.js";
import { normalizarTratamientoFrecuencia } from "../utils/frecuencias.js";

import {
  collection,
  addDoc,
  doc,
  getDocs,
  query,
  orderBy,
  updateDoc,
  deleteDoc,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const coleccionTratamientos = (uidPaciente) =>
  collection(db, "usuarios", uidPaciente, "tratamientos");

function fechaActualISO() {
  return new Date().toISOString();
}

function separarAuditoriaTratamiento(datos = {}, accion = "actualizar") {
  const { _auditoria, ...datosTratamiento } = datos;
  const fecha = fechaActualISO();
  const auditoria = {
    accion,
    usuarioUid: _auditoria?.usuarioUid || datos.creadoPor || "",
    usuarioNombre: _auditoria?.usuarioNombre || "",
    usuarioRol: _auditoria?.usuarioRol || "",
    fecha,
    hora: fecha
  };

  return { datosTratamiento, auditoria, fecha };
}

export async function crearTratamiento(uidPaciente, datos) {
  const { datosTratamiento, auditoria, fecha } = separarAuditoriaTratamiento(datos, "crear");
  return await addDoc(coleccionTratamientos(uidPaciente), {
    ...normalizarTratamientoFrecuencia(datosTratamiento),
    creadoPorRol: auditoria.usuarioRol,
    creadoPorNombre: auditoria.usuarioNombre,
    modificadoPor: auditoria.usuarioUid,
    modificadoPorRol: auditoria.usuarioRol,
    modificadoPorNombre: auditoria.usuarioNombre,
    historialCambios: [auditoria],
    fechaCreacion: fecha,
    fechaActualizacion: fecha
  });
}

export async function listarTratamientos(uidPaciente) {
  const q = query(coleccionTratamientos(uidPaciente), orderBy("fechaInicio", "desc"));
  const snap = await getDocs(q);

  return snap.docs.map((docTratamiento) => ({
    id: docTratamiento.id,
    ...normalizarTratamientoFrecuencia(docTratamiento.data())
  }));
}

export async function actualizarTratamiento(uidPaciente, tratamientoId, datos) {
  const { datosTratamiento, auditoria, fecha } = separarAuditoriaTratamiento(datos, "actualizar");
  await updateDoc(
    doc(db, "usuarios", uidPaciente, "tratamientos", tratamientoId),
    {
      ...normalizarTratamientoFrecuencia(datosTratamiento),
      modificadoPor: auditoria.usuarioUid,
      modificadoPorRol: auditoria.usuarioRol,
      modificadoPorNombre: auditoria.usuarioNombre,
      historialCambios: arrayUnion(auditoria),
      fechaActualizacion: fecha
    }
  );
}

export async function eliminarTratamiento(uidPaciente, tratamientoId) {
  await deleteDoc(doc(db, "usuarios", uidPaciente, "tratamientos", tratamientoId));
}
