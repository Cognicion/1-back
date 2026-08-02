import { extraerTextosClinicos, anonimizarTexto } from "./textTokenizer.js";
import { extraerNgramas } from "./phraseExtractor.js";

function fechaDe(valor) {
  if (valor && typeof valor.toDate === "function") return valor.toDate().toISOString();
  if (valor && typeof valor.seconds === "number") return new Date(valor.seconds * 1000).toISOString();
  const fecha = new Date(valor || 0);
  return Number.isNaN(fecha.getTime()) ? "" : fecha.toISOString();
}

function metaNota(datos, referencia = {}) {
  const fecha = fechaDe(datos.fechaUltimaModificacion || datos.fechaEdicion || datos.fecha || datos.fechaCreacion || datos.createdAt);
  return { notaId: referencia.id || datos.notaId || "", fecha, pacienteUid: datos.uidPaciente || datos.pacienteUid || datos.idPaciente || referencia.pacienteUid || "", medicoUid: datos.uidMedico || datos.medicoUid || datos.usuarioId || referencia.medicoUid || "", institucion: datos.institucion || datos.institucionNombre || datos.unidad || "", servicio: datos.servicio || datos.tipoAtencion || "", diagnostico: Array.isArray(datos.diagnosticos) ? datos.diagnosticos.map((d) => typeof d === "string" ? d : d?.nombre || d?.descripcion || "").join(", ") : String(datos.diagnostico || "") };
}

export function indexarNota(datos = {}, referencia = {}) {
  const meta = metaNota(datos, referencia);
  const fuentes = extraerTextosClinicos(datos);
  const ngramas = [];
  fuentes.forEach(({ campo, texto }) => extraerNgramas(texto, 1, 20).forEach((ngram) => ngramas.push({ ...ngram, campo, ejemplo: anonimizarTexto(texto), ...meta }));
  return { ...meta, firma: JSON.stringify(datos), ngramas };
}

export function construirFrecuencias(notas = []) {
  const mapa = new Map();
  notas.forEach((nota) => nota.ngramas.forEach((item) => {
    const clave = `${item.tipo}:${item.clave}`;
    let actual = mapa.get(clave);
    if (!actual) actual = { clave: item.clave, tipo: item.tipo, n: item.n, frecuencia: 0, notas: new Set(), pacientes: new Set(), medicos: new Set(), ejemplos: [], primeraAparicion: item.fecha, ultimaAparicion: item.fecha, campos: new Map(), diagnosticos: new Map(), anios: new Map() };
    actual.frecuencia += 1;
    if (item.notaId) actual.notas.add(item.notaId);
    if (item.pacienteUid) actual.pacientes.add(item.pacienteUid);
    if (item.medicoUid) actual.medicos.add(item.medicoUid);
    if (item.fecha && (!actual.primeraAparicion || item.fecha < actual.primeraAparicion)) actual.primeraAparicion = item.fecha;
    if (item.fecha > actual.ultimaAparicion) actual.ultimaAparicion = item.fecha;
    actual.campos.set(item.campo, (actual.campos.get(item.campo) || 0) + 1);
    actual.diagnosticos.set(item.diagnostico || "Sin diagnóstico", (actual.diagnosticos.get(item.diagnostico || "Sin diagnóstico") || 0) + 1);
    const anio = item.fecha ? item.fecha.slice(0, 4) : "Sin fecha";
    actual.anios.set(anio, (actual.anios.get(anio) || 0) + 1);
    if (actual.ejemplos.length < 3 && item.ejemplo) actual.ejemplos.push({ texto: item.ejemplo, contexto: item.campo });
    mapa.set(clave, actual);
  }));
  return [...mapa.values()].map((item) => ({ ...item, notas: item.notas.size, pacientes: item.pacientes.size, medicos: item.medicos.size, ejemplos: item.ejemplos, porDiagnostico: Object.fromEntries(item.diagnosticos), porAnio: Object.fromEntries(item.anios), porCampo: Object.fromEntries(item.campos) })).sort((a, b) => b.frecuencia - a.frecuencia || a.clave.localeCompare(b.clave));
}
