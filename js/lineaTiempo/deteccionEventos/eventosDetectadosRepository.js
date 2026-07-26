import { db } from "../../firebase.js";
import { registrarEventoAuditoria } from "../../services/auditoria.js";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { crearEventoPaciente } from "../lineaTiempoDataService.js";
import { ESTADOS_EVENTO_DETECTADO, crearHuellaConceptual, fechaLocalDesdeISO } from "./eventosDetectadosUtils.js";

function refEventosDetectados(pacienteId) {
  if (!pacienteId) throw new Error("PACIENTE_ID_REQUERIDO");
  return collection(db, "pacientes", pacienteId, "eventosDetectados");
}

function normalizarSugerencia(id, datos = {}) {
  return {
    id,
    tituloSugerido: String(datos.tituloSugerido || "").trim(),
    descripcionSugerida: String(datos.descripcionSugerida || "").trim(),
    fechaInicioISO: datos.fechaInicioISO || null,
    fechaFinISO: datos.fechaFinISO || null,
    precisionTemporal: datos.precisionTemporal || "indeterminada",
    expresionTemporalOriginal: datos.expresionTemporalOriginal || "",
    origenTipo: datos.origenTipo || "",
    origenSubtipo: datos.origenSubtipo || "",
    origenId: datos.origenId || "",
    origenFechaISO: datos.origenFechaISO || "",
    hashFuente: datos.hashFuente || "",
    hashFragmento: datos.hashFragmento || "",
    hashConceptual: datos.hashConceptual || "",
    fragmentoOriginal: datos.fragmentoOriginal || datos.fragmentoSoporte || "",
    fragmentoSoporte: datos.fragmentoSoporte || datos.fragmentoOriginal || "",
    confianza: Number(datos.confianza) || 0,
    importanciaSugerida: ["baja", "media", "alta"].includes(datos.importanciaSugerida) ? datos.importanciaSugerida : "media",
    categoriaSugerida: datos.categoriaSugerida || null,
    sujeto: datos.sujeto || "paciente",
    requiereRevisionFecha: datos.requiereRevisionFecha !== false,
    estado: Object.values(ESTADOS_EVENTO_DETECTADO).includes(datos.estado) ? datos.estado : ESTADOS_EVENTO_DETECTADO.pendiente,
    posibleDuplicadoEventoId: datos.posibleDuplicadoEventoId || null,
    referenciasOrigen: Array.isArray(datos.referenciasOrigen) ? datos.referenciasOrigen : [],
    eventoCreadoId: datos.eventoCreadoId || null
  };
}

export async function cargarSugerenciasEventosDetectados(pacienteId) {
  const snap = await getDocs(refEventosDetectados(pacienteId));
  return snap.docs.map((item) => normalizarSugerencia(item.id, item.data()));
}

export async function guardarSugerenciasDetectadas({ pacienteId, sugerencias = [], usuarioUid = "", eventosExistentes = [] }) {
  const existentes = await cargarSugerenciasEventosDetectados(pacienteId);
  const porConcepto = new Map(existentes.map((item) => [item.hashConceptual || item.hashFragmento, item]));
  const creadas = [];
  for (const sugerencia of sugerencias) {
    const hashConceptual = sugerencia.hashConceptual || crearHuellaConceptual({ pacienteId, ...sugerencia });
    const existente = porConcepto.get(hashConceptual);
    if (existente && existente.estado !== ESTADOS_EVENTO_DETECTADO.obsoleto) continue;
    const posibleDuplicado = eventosExistentes.find((evento) => {
      const fechaEventoISO = evento.fechaEvento ? evento.fechaEvento.toISOString?.().slice(0, 10) : "";
      return fechaEventoISO === sugerencia.fechaInicioISO
        && String(evento.titulo || "").toLocaleLowerCase("es-MX").slice(0, 18) === String(sugerencia.tituloSugerido || "").toLocaleLowerCase("es-MX").slice(0, 18);
    });
    const payload = {
      ...sugerencia,
      hashConceptual,
      fragmentoOriginal: sugerencia.fragmentoSoporte || "",
      referenciasOrigen: [{
        tipo: sugerencia.origenTipo || "",
        subtipo: sugerencia.origenSubtipo || "",
        id: sugerencia.origenId || "",
        fecha: sugerencia.origenFechaISO || ""
      }],
      estado: ESTADOS_EVENTO_DETECTADO.pendiente,
      detectadoPor: usuarioUid,
      detectadoEn: serverTimestamp(),
      revisadoPor: null,
      revisadoEn: null,
      eventoCreadoId: null,
      posibleDuplicadoEventoId: posibleDuplicado?.id || null
    };
    const docRef = await addDoc(refEventosDetectados(pacienteId), payload);
    creadas.push(normalizarSugerencia(docRef.id, payload));
  }
  await auditar("detectar_eventos_linea_tiempo", pacienteId, usuarioUid, { totalSugerencias: creadas.length });
  return cargarSugerenciasEventosDetectados(pacienteId);
}

export async function aceptarSugerenciaEvento({ pacienteId, sugerencia, datosEditados = {}, usuarioUid = "" }) {
  const fechaEvento = fechaLocalDesdeISO(datosEditados.fechaInicioISO || sugerencia.fechaInicioISO);
  if (!fechaEvento) throw new Error("Selecciona una fecha antes de añadir el evento.");
  const fechaFin = fechaLocalDesdeISO(datosEditados.fechaFinISO || sugerencia.fechaFinISO || "");
  const evento = await crearEventoPaciente(pacienteId, {
    titulo: datosEditados.titulo || sugerencia.tituloSugerido,
    descripcion: datosEditados.descripcion || sugerencia.descripcionSugerida,
    fechaEvento,
    fechaFin,
    categoriaId: datosEditados.categoriaId || null,
    categoriaNombre: datosEditados.categoriaNombre || "",
    categoria: datosEditados.categoriaNombre || "",
    importancia: datosEditados.importancia || sugerencia.importanciaSugerida || "media",
    origen: "detectado",
    referenciaTipo: sugerencia.origenSubtipo || sugerencia.origenTipo || null,
    referenciaId: sugerencia.origenId || null,
    deteccionId: sugerencia.id,
    fechaEsAproximada: sugerencia.requiereRevisionFecha === true,
    precisionTemporal: sugerencia.precisionTemporal || "indeterminada"
  }, usuarioUid);
  await updateDoc(doc(db, "pacientes", pacienteId, "eventosDetectados", sugerencia.id), {
    estado: ESTADOS_EVENTO_DETECTADO.aceptado,
    revisadoPor: usuarioUid,
    revisadoEn: serverTimestamp(),
    eventoCreadoId: evento.id
  });
  await auditar("aceptar_evento_detectado", pacienteId, usuarioUid, { referenciaTipo: sugerencia.origenSubtipo, referenciaId: sugerencia.origenId });
  return evento;
}

export async function descartarSugerenciaEvento({ pacienteId, sugerenciaId, usuarioUid = "", motivo = "" }) {
  await updateDoc(doc(db, "pacientes", pacienteId, "eventosDetectados", sugerenciaId), {
    estado: ESTADOS_EVENTO_DETECTADO.descartado,
    motivoDescarte: motivo || "",
    revisadoPor: usuarioUid,
    revisadoEn: serverTimestamp()
  });
  await auditar("descartar_evento_detectado", pacienteId, usuarioUid);
}

export async function restaurarSugerenciaEvento({ pacienteId, sugerenciaId, usuarioUid = "" }) {
  await updateDoc(doc(db, "pacientes", pacienteId, "eventosDetectados", sugerenciaId), {
    estado: ESTADOS_EVENTO_DETECTADO.pendiente,
    motivoDescarte: "",
    revisadoPor: usuarioUid,
    revisadoEn: serverTimestamp()
  });
  await auditar("restaurar_evento_detectado", pacienteId, usuarioUid);
}

async function auditar(accion, pacienteId, usuarioUid = "", detalles = {}) {
  try {
    await registrarEventoAuditoria({
      accion,
      modulo: "Linea de tiempo del paciente",
      descripcion: `Operacion ${accion} en eventos detectados.`,
      usuarioUid,
      pacienteUid: pacienteId,
      detalles
    });
  } catch (error) {
    console.warn("[Eventos detectados] Auditoria no registrada", error?.code || error?.message || error);
  }
}
