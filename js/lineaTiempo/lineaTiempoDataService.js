import { db } from "../firebase.js";
import { registrarEventoAuditoria } from "../services/auditoria.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { normalizarEvento } from "./lineaTiempoUtils.js";

function referenciaLineaTiempo(pacienteId) {
  if (!pacienteId) throw new Error("PACIENTE_ID_REQUERIDO");
  return collection(db, "pacientes", pacienteId, "lineaTiempo");
}

function fechaFirestore(fecha) {
  const valor = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(valor.getTime())) throw new Error("FECHA_EVENTO_INVALIDA");
  return valor;
}

export async function cargarEventosPaciente(pacienteId) {
  const snapshot = await getDocs(referenciaLineaTiempo(pacienteId));
  return snapshot.docs
    .map((documento) => normalizarEvento(documento.id, documento.data()))
    .filter(Boolean)
    .sort((a, b) => a.fechaEvento - b.fechaEvento);
}

function referenciaCategorias(uid) {
  if (!uid) throw new Error("USUARIO_ID_REQUERIDO");
  return collection(db, "usuarios", uid, "categoriasLineaTiempo");
}

export async function cargarCategoriasLineaTiempo(uid) {
  const snapshot = await getDocs(query(referenciaCategorias(uid), orderBy("nombre", "asc")));
  return snapshot.docs
    .map((documento) => ({ id: documento.id, nombre: String(documento.data().nombre || "").trim() }))
    .filter((categoria) => categoria.nombre);
}

export async function crearCategoriaLineaTiempo(uid, nombre) {
  const normalizada = String(nombre || "").trim().slice(0, 60);
  if (!normalizada) throw new Error("CATEGORIA_REQUERIDA");
  const existentes = await cargarCategoriasLineaTiempo(uid);
  const repetida = existentes.find((categoria) => categoria.nombre.toLocaleLowerCase("es-MX") === normalizada.toLocaleLowerCase("es-MX"));
  if (repetida) return repetida;
  const creada = await addDoc(referenciaCategorias(uid), { nombre: normalizada, creadoPor: uid, creadoEn: serverTimestamp() });
  return { id: creada.id, nombre: normalizada };
}

function datosGuardables(datos, usuarioUid) {
  const titulo = String(datos.titulo || "").trim();
  if (!titulo) throw new Error("El título del evento es obligatorio.");
  if (titulo.length > 160) throw new Error("El título del evento es demasiado largo.");
  const fechaEvento = fechaFirestore(datos.fechaEvento);
  const fechaFin = datos.fechaFin ? fechaFirestore(datos.fechaFin) : null;
  if (fechaFin && fechaFin < fechaEvento) throw new Error("La fecha final debe ser posterior a la fecha inicial.");
  return {
    titulo,
    descripcion: String(datos.descripcion || "").trim().slice(0, 1200),
    fechaEvento,
    fechaFin,
    categoria: String(datos.categoria || "").trim().slice(0, 80),
    importancia: ["baja", "media", "alta"].includes(datos.importancia) ? datos.importancia : "media",
    origen: datos.origen === "automatico" ? "automatico" : "manual",
    referenciaId: datos.referenciaId || null,
    referenciaTipo: datos.referenciaTipo || null,
    creadoPor: usuarioUid,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
    activo: true,
    ...(datos.tipo ? { tipo: datos.tipo } : {})
  };
}

async function auditar(accion, pacienteId, detalles = {}) {
  try {
    await registrarEventoAuditoria({
      accion,
      modulo: "Línea de tiempo del paciente",
      descripcion: `Operación ${accion} en la línea de tiempo.`,
      usuarioUid: detalles.usuarioUid || "",
      pacienteUid: pacienteId,
      detalles: { referenciaTipo: detalles.referenciaTipo || "", referenciaId: detalles.referenciaId || "" }
    });
  } catch (error) {
    console.warn("No se pudo registrar la auditoría de línea de tiempo:", error?.code || error?.message || error);
  }
}

export async function crearEventoPaciente(pacienteId, datos, usuarioUid) {
  const payload = datosGuardables(datos, usuarioUid);
  const creado = await addDoc(referenciaLineaTiempo(pacienteId), payload);
  await auditar("crear_evento_linea_tiempo", pacienteId, { ...payload, usuarioUid });
  return normalizarEvento(creado.id, { ...payload, fechaEvento: payload.fechaEvento });
}

export async function actualizarEventoPaciente(pacienteId, eventoId, datos, usuarioUid) {
  if (!eventoId) throw new Error("EVENTO_ID_REQUERIDO");
  const payload = datosGuardables(datos, usuarioUid);
  delete payload.creadoPor;
  delete payload.creadoEn;
  await updateDoc(doc(db, "pacientes", pacienteId, "lineaTiempo", eventoId), payload);
  await auditar("editar_evento_linea_tiempo", pacienteId, { ...payload, usuarioUid });
  return normalizarEvento(eventoId, { ...payload, fechaEvento: payload.fechaEvento });
}

export async function eliminarEventoPaciente(pacienteId, eventoId, usuarioUid) {
  if (!eventoId) throw new Error("EVENTO_ID_REQUERIDO");
  await deleteDoc(doc(db, "pacientes", pacienteId, "lineaTiempo", eventoId));
  await auditar("eliminar_evento_linea_tiempo", pacienteId, { usuarioUid });
}

export async function crearEventoLineaTiempoDesdeReferencia({
  pacienteId,
  tipo = null,
  referenciaId,
  referenciaTipo,
  titulo,
  descripcion = "",
  fechaEvento,
  usuarioUid
}) {
  if (!referenciaId || !referenciaTipo) throw new Error("REFERENCIA_REQUERIDA");
  const existentes = await cargarEventosPaciente(pacienteId);
  const duplicado = existentes.find((evento) => evento.referenciaId === referenciaId && evento.referenciaTipo === referenciaTipo && evento.activo);
  if (duplicado) return duplicado;
  return crearEventoPaciente(pacienteId, {
    tipo,
    referenciaId,
    referenciaTipo,
    titulo,
    descripcion,
    fechaEvento,
    origen: "automatico"
  }, usuarioUid);
}

export function destruirLineaTiempoDataService() {
  // La implementación actual usa consultas puntuales, por lo que no mantiene suscripciones activas.
}
