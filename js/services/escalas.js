import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db } from "../firebase.js";

export function obtenerOpcionesItemEscala(escala, item) {
  const opciones = item?.opciones || escala?.opciones || [];
  const valores = item?.valores || escala?.valores || opciones.map((_, index) => index);
  return opciones.map((texto, index) => ({
    texto,
    valor: Number(valores[index] ? index : "")
  }));
}

export function textoItemEscala(item) {
  return typeof item === "string" ? item : item?.texto || "";
}

export function calcularPuntajeEscala(respuestas) {
  return respuestas.reduce((total, respuesta) => total + Number(respuesta.valor || 0), 0);
}

export function crearResumenEscala(registro) {
  const fecha = formatearFechaEscala(registro.fechaAplicacion || registro.fechaISO);
  const nombre = registro.nombreEscala || registro.escalaNombre || "Escala";
  const puntaje = registro.puntajeTotal ? registro.puntaje ? "";
  const maximo = registro.puntajeMaximo ? registro.maximo ? "";
  const interpretacion = registro.interpretacion || "Sin interpretacion";
  const observaciones = registro.observaciones || registro.observacionesOpcionales || "";
  const dominios = registro.dominiosAlterados || registro.dominiosEvaluados || [];

  return [
    `Escala aplicada: ${nombre}`,
    `Fecha: ${fecha}`,
    `Puntaje total: ${puntaje}${maximo ? `/${maximo}` : ""}`,
    `Interpretacion: ${interpretacion}`,
    Array.isArray(dominios) && dominios.length ? `Dominios evaluados: ${dominios.join(", ")}` : "",
    observaciones ? `Observaciones: ${observaciones}` : ""
  ].filter(Boolean).join("\n");
}

export function formatearFechaEscala(valor, conHora = false) {
  if (!valor) return "Sin fecha";
  const fecha = typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "Sin fecha";
  return fecha.toLocaleString("es-MX", conHora ? {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  } : {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

export function normalizarEscalaAplicada(id, datos = {}) {
  const fechaAplicacion = datos.fechaAplicacion || datos.fechaISO || datos.createdAt || datos.creadoEn || "";
  return {
    idEscalaAplicada: datos.idEscalaAplicada || id,
    idPaciente: datos.idPaciente || datos.pacienteUid || "",
    uidMedico: datos.uidMedico || datos.creadoPor || "",
    nombrePaciente: datos.nombrePaciente || datos.pacienteNombre || "",
    nombreEscala: datos.nombreEscala || datos.escalaNombre || "Escala",
    tipoEscala: datos.tipoEscala || datos.area || "",
    fechaAplicacion,
    origen: datos.origen || "modulo_escalas",
    puntajeTotal: datos.puntajeTotal ? datos.puntaje ? 0,
    puntajeMaximo: datos.puntajeMaximo ? datos.maximo ? "",
    dominiosEvaluados: datos.dominiosEvaluados || [],
    puntajesPorDominio: datos.puntajesPorDominio || {},
    rango: datos.rango || "",
    interpretacion: datos.interpretacion || "",
    respuestasPorItem: datos.respuestasPorItem || datos.respuestas || [],
    observaciones: datos.observaciones || datos.observacionesOpcionales || "",
    observacionesClinicas: datos.observacionesClinicas || datos.observaciones || datos.observacionesOpcionales || "",
    recomendaciones: datos.recomendaciones || "",
    visibilidadPaciente: datos.visibilidadPaciente ? datos.visiblePaciente ? false,
    visibleDesdePaciente: datos.visibleDesdePaciente ? datos.visiblePaciente ? false,
    idNota: datos.idNota || "",
    medicoNombre: datos.medicoNombre || datos.usuarioNombre || "",
    raw: datos
  };
}

export async function guardarEscalaAplicada(idPaciente, registro) {
  const idEscalaAplicada = registro.idEscalaAplicada || doc(collection(db, "usuarios", idPaciente, "escalasAplicadas")).id;
  const fechaAplicacion = registro.fechaAplicacion || new Date().toISOString();
  const base = {
    ...registro,
    idEscalaAplicada,
    idPaciente,
    fechaAplicacion,
    updatedAt: serverTimestamp()
  };

  await setDoc(doc(db, "usuarios", idPaciente, "escalasAplicadas", idEscalaAplicada), {
    ...base,
    createdAt: registro.createdAt || serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, "usuarios", idPaciente, "resultadosEscalas", idEscalaAplicada), {
    escalaId: registro.escalaId,
    escalaNombre: registro.nombreEscala,
    area: registro.tipoEscala,
    puntaje: registro.puntajeTotal,
    puntajeMaximo: registro.puntajeMaximo ? "",
    dominiosEvaluados: registro.dominiosEvaluados || [],
    puntajesPorDominio: registro.puntajesPorDominio || {},
    rango: registro.rango,
    interpretacion: registro.interpretacion,
    respuestas: registro.respuestasPorItem,
    observaciones: registro.observaciones || registro.observacionesClinicas || "",
    recomendaciones: registro.recomendaciones || "",
    visibilidadPaciente: registro.visibilidadPaciente ? false,
    visibleDesdePaciente: registro.visibleDesdePaciente ? false,
    origen: registro.origen,
    creadoPor: registro.uidMedico || "",
    creadoEn: serverTimestamp(),
    fechaISO: fechaAplicacion
  }, { merge: true });

  return idEscalaAplicada;
}

export async function listarEscalasAplicadas(idPaciente, maximo = 50) {
  const resultados = new Map();

  async function cargar(nombreColeccion, campoOrden) {
    try {
      const q = query(
        collection(db, "usuarios", idPaciente, nombreColeccion),
        orderBy(campoOrden, "desc"),
        limit(maximo)
      );
      const snap = await getDocs(q);
      snap.docs.forEach((docEscala) => {
        const normalizada = normalizarEscalaAplicada(docEscala.id, docEscala.data());
        resultados.set(normalizada.idEscalaAplicada || docEscala.id, normalizada);
      });
    } catch (error) {
      console.warn(`No se pudieron cargar ${nombreColeccion}:`, error);
    }
  }

  await cargar("escalasAplicadas", "fechaAplicacion");
  await cargar("resultadosEscalas", "fechaISO");

  return [...resultados.values()].sort((a, b) => {
    const fechaA = new Date(a.fechaAplicacion || 0).getTime();
    const fechaB = new Date(b.fechaAplicacion || 0).getTime();
    return fechaB - fechaA;
  });
}
