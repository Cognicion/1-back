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
  fuentes.forEach(({ campo, texto }) => extraerNgramas(texto, 1, 20).forEach((ngram) => ngramas.push({ ...ngram, campo, ejemplo: anonimizarTexto(texto) })));
  return { ...meta, firma: JSON.stringify(datos), ngramas };
}

export function construirFrecuencias(notas = []) {
  const mapa = new Map();
  notas.forEach((nota) => nota.ngramas.forEach((item) => {
    const dato = { ...nota, ...item };
    const clave = `${dato.tipo}:${dato.clave}`;
    let actual = mapa.get(clave);
    if (!actual) actual = { clave: dato.clave, tipo: dato.tipo, n: dato.n, frecuencia: 0, notas: new Set(), pacientes: new Set(), medicos: new Set(), ejemplos: [], primeraAparicion: dato.fecha, ultimaAparicion: dato.fecha, campos: new Map(), diagnosticos: new Map(), anios: new Map() };
    actual.frecuencia += 1;
    if (dato.notaId) actual.notas.add(dato.notaId);
    if (dato.pacienteUid) actual.pacientes.add(dato.pacienteUid);
    if (dato.medicoUid) actual.medicos.add(dato.medicoUid);
    if (dato.fecha && (!actual.primeraAparicion || dato.fecha < actual.primeraAparicion)) actual.primeraAparicion = dato.fecha;
    if (dato.fecha > actual.ultimaAparicion) actual.ultimaAparicion = dato.fecha;
    actual.campos.set(dato.campo, (actual.campos.get(dato.campo) || 0) + 1);
    actual.diagnosticos.set(dato.diagnostico || "Sin diagnostico", (actual.diagnosticos.get(dato.diagnostico || "Sin diagnostico") || 0) + 1);
    const anio = dato.fecha ? dato.fecha.slice(0, 4) : "Sin fecha";
    actual.anios.set(anio, (actual.anios.get(anio) || 0) + 1);
    if (actual.ejemplos.length < 3 && dato.ejemplo) actual.ejemplos.push({ texto: dato.ejemplo, contexto: dato.campo });
    mapa.set(clave, actual);
  }));
  return [...mapa.values()].map((item) => ({ ...item, notas: item.notas.size, pacientes: item.pacientes.size, medicos: item.medicos.size, ejemplos: item.ejemplos, porDiagnostico: Object.fromEntries(item.diagnosticos), porAnio: Object.fromEntries(item.anios), porCampo: Object.fromEntries(item.campos) })).sort((a, b) => b.frecuencia - a.frecuencia || a.clave.localeCompare(b.clave));
}
