import { db } from "../firebase.js";

import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLECCION_REPORTES = "reportesUsuarios";

export async function guardarReporteUsuario(datosReporte = {}) {
  return await addDoc(collection(db, COLECCION_REPORTES), {
    tipo: datosReporte.tipo || "sugerencia",
    titulo: datosReporte.titulo || "",
    mensaje: datosReporte.mensaje || "",
    pagina: datosReporte.pagina || "",
    url: datosReporte.url || "",
    estado: datosReporte.estado || "nuevo",
    usuarioUid: datosReporte.usuarioUid || "",
    usuarioEmail: datosReporte.usuarioEmail || "",
    usuarioNombre: datosReporte.usuarioNombre || "",
    userAgent: datosReporte.userAgent || "",
    fechaISO: new Date().toISOString(),
    fechaCreacion: serverTimestamp()
  });
}

export async function listarReportesUsuarios() {
  const qReportes = query(
    collection(db, COLECCION_REPORTES),
    orderBy("fechaCreacion", "desc")
  );

  const snap = await getDocs(qReportes);
  return snap.docs.map((docReporte) => ({
    id: docReporte.id,
    ...docReporte.data()
  }));
}

export async function actualizarEstadoReporteUsuario(reporteId, estado) {
  await updateDoc(doc(db, COLECCION_REPORTES, reporteId), {
    estado,
    fechaActualizacionISO: new Date().toISOString()
  });
}

export async function responderReporteUsuario(reporteId, datosRespuesta = {}) {
  const ahora = new Date().toISOString();
  const respuesta = {
    mensaje: datosRespuesta.mensaje || "",
    adminUid: datosRespuesta.adminUid || "",
    adminEmail: datosRespuesta.adminEmail || "",
    adminNombre: datosRespuesta.adminNombre || "",
    idAviso: datosRespuesta.idAviso || "",
    fechaISO: ahora,
    fechaCreacion: serverTimestamp()
  };

  await addDoc(collection(db, COLECCION_REPORTES, reporteId, "respuestas"), respuesta);

  await updateDoc(doc(db, COLECCION_REPORTES, reporteId), {
    estado: datosRespuesta.estado || "en_revision",
    respuestaAdminUltima: respuesta,
    respondido: true,
    respondidoEn: ahora,
    fechaActualizacionISO: ahora
  });
}
