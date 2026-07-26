export const DEBUG_EVENT_DETECTION = false;
export const DETECTED_EVENTS_DEBUG_LABEL = "[Eventos detectados 1.27]";

export const ESTADOS_DETECCION_EVENTOS = Object.freeze({
  pendiente: "pendiente",
  aceptado: "aceptado",
  descartado: "descartado"
});

const MESES = new Map([
  ["enero", 0],
  ["febrero", 1],
  ["marzo", 2],
  ["abril", 3],
  ["mayo", 4],
  ["junio", 5],
  ["julio", 6],
  ["agosto", 7],
  ["septiembre", 8],
  ["setiembre", 8],
  ["octubre", 9],
  ["noviembre", 10],
  ["diciembre", 11]
]);

const NUMEROS = new Map([
  ["un", 1],
  ["una", 1],
  ["dos", 2],
  ["tres", 3],
  ["cuatro", 4],
  ["cinco", 5],
  ["seis", 6],
  ["siete", 7],
  ["ocho", 8],
  ["nueve", 9],
  ["diez", 10],
  ["once", 11],
  ["doce", 12]
]);

const PATRON_TEMPORAL = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}|(?:principios|mediados|finales)\s+de\s+\d{4}|[a-záéíóúñ]+\s+de\s+\d{4}|(?:en|desde|alrededor de)\s+\d{4}|(?:ayer|anteayer|la semana pasada|el mes pasado|el año pasado|el ano pasado|la próxima semana|la proxima semana|próxima semana|proxima semana)|(?:desde\s+)?(?:aproximadamente\s+)?hace\s+(?:\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s+(?:día|dia|dias|días|semana|semanas|mes|meses|año|años|ano|anos)|(?:a los|desde los)\s+\d{1,2}\s+(?:años|anos)|en la infancia|durante la adolescencia|al inicio de la universidad|desde joven|desde pequeño|desde pequeno|años atrás|anos atras|hace tiempo|recientemente)\b/giu;

const PATRON_RELEVANCIA = /\b(ingres\w*|internad\w*|hospitaliz\w*|alta|urgencia|crisis|intento suicida|suicid\w*|autoles\w*|violencia|diagnostic\w*|tratamiento|medicamento|suspend\w*|inici\w*|resonancia|tomograf\w*|laboratorio|gabinete|estudio|cirug\w*|enfermedad|consumo|alcohol|cocaina|metanfetamina|cannabis|recaid\w*|trauma|fallec\w*|murio|muerte|embarazo|parto|legal|aislamiento|insomnio|ansiedad|depres\w*|crianza|abuso|agresion|convulsion\w*|catatoni\w*|psicosis|consulta)\b/i;
const PATRON_NEGACION_EVENTO = /\b(niega|niegan|sin antecedente(?:s)? de|no ha presentado|no presenta|no refiere|descarta|se descarto)\s+(?:[\wáéíóúñ]+\s+){0,5}(hospitaliz|intento|suicid|convulsion|crisis|consumo|violencia|alucin|ingreso)/i;
const PATRON_FUTURO = /\b(se valorara|se valorará|se considerara|se considerará|si empeora|proxima consulta|próxima consulta|se hospitalizara|se hospitalizará|se programo|se programó|se indicara|se indicará|proxima semana|próxima semana)\b/i;
const PATRON_ADMINISTRATIVO = /\b(documento creado|usuario modific|firma registrada|exportacion|exportación|actualizado en|creado en)\b/i;

export function normalizarTextoDeteccion(texto = "") {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es-MX");
}

export function hashDeteccionEstable(texto = "") {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const entrada = String(texto ?? "");
  for (let i = 0; i < entrada.length; i += 1) {
    const ch = entrada.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}`;
}

export function convertirFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor;
  if (typeof valor?.toDate === "function") {
    const fecha = valor.toDate();
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }
  if (typeof valor?.seconds === "number") {
    const fecha = new Date(valor.seconds * 1000);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }
  if (typeof valor === "string") {
    const isoDia = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDia) return new Date(Number(isoDia[1]), Number(isoDia[2]) - 1, Number(isoDia[3]), 12, 0, 0, 0);
  }
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function fechaISO(fecha) {
  const valor = convertirFecha(fecha);
  if (!valor) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${valor.getFullYear()}-${pad(valor.getMonth() + 1)}-${pad(valor.getDate())}`;
}

export function limpiarHTMLConFechas(texto = "") {
  return String(texto ?? "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|section|article|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textoSeguro(valor) {
  if (typeof valor === "string" || typeof valor === "number") return String(valor).trim();
  if (!valor || typeof valor !== "object") return "";
  return String(valor.texto || valor.nombre || valor.descripcion || valor.valor || valor.label || "").trim();
}

export function extraerTextoClinicoFuente(fuente = {}) {
  const datos = fuente.datos || fuente;
  const campos = [
    ["Título", datos.titulo || datos.tituloNota || datos.tipoNota],
    ["Contenido", datos.contenido || datos.texto || datos.nota || datos.descripcion],
    ["Evolución", datos.evolucion || datos.subjetivo || datos.padecimientoActual],
    ["Objetivo", datos.objetivo || datos.examenMental],
    ["Análisis", datos.analisis || datos.comentario || datos.impresionDiagnostica],
    ["Antecedentes", datos.antecedentes || datos.antecedentesPersonales || datos.antecedentesHeredofamiliares],
    ["Resultado", datos.resultadoResumen || datos.resultado || datos.interpretacion],
    ["Indicaciones", datos.indicaciones || datos.observaciones || datos.motivoSuspension]
  ];
  const secciones = [];
  for (const [etiqueta, valor] of campos) {
    const texto = textoSeguro(valor);
    if (texto) secciones.push(`[${etiqueta}]\n${limpiarHTMLConFechas(texto)}`);
  }
  return secciones.join("\n\n").trim();
}

export function crearFuenteClinicaComun({
  origenId,
  origenTipo,
  origenSubtipo = "",
  fechaDocumento = null,
  tituloDocumento = "",
  updatedAt = null,
  datos = {}
}) {
  const textoAnalizable = extraerTextoClinicoFuente({ ...datos, datos });
  const fechaReferencia = convertirFecha(fechaDocumento || datos.fechaNota || datos.fecha || datos.fechaInicio || datos.fechaCreacion || datos.createdAt || updatedAt);
  return {
    origenId: String(origenId || ""),
    origenTipo: String(origenTipo || ""),
    origenSubtipo: String(origenSubtipo || ""),
    fechaDocumento: fechaReferencia,
    tituloDocumento: textoSeguro(tituloDocumento || datos.titulo || datos.tipoNota || origenSubtipo || origenTipo),
    textoAnalizable,
    updatedAt,
    datos,
    hashFuente: hashDeteccionEstable([
      origenTipo,
      origenId,
      normalizarTextoDeteccion(textoAnalizable),
      fechaISO(fechaReferencia) || ""
    ].join("|"))
  };
}

function oracionesConContexto(texto = "") {
  const limpio = limpiarHTMLConFechas(texto);
  return limpio
    .split(/(?<=[.!?])\s+|\n+/)
    .map((oracion) => oracion.trim())
    .filter(Boolean);
}

export function detectarExpresionesTemporalesLocales(texto = "") {
  return [...String(texto || "").matchAll(PATRON_TEMPORAL)].map((match) => ({
    expresionTemporal: match[0],
    indiceInicio: match.index,
    indiceFin: match.index + match[0].length
  }));
}

export function generarFragmentosTemporales(fuente = {}) {
  const oraciones = oracionesConContexto(fuente.textoAnalizable || "");
  const fragmentos = [];
  oraciones.forEach((oracion, index) => {
    const expresiones = detectarExpresionesTemporalesLocales(oracion);
    expresiones.forEach((expresion) => {
      const textoFragmento = [
        oraciones[index - 1] || "",
        oracion,
        oraciones[index + 1] || ""
      ].filter(Boolean).join(" ").slice(0, 900);
      fragmentos.push({
        ...expresion,
        textoFragmento,
        fechaReferencia: fuente.fechaDocumento,
        origenTipo: fuente.origenTipo,
        origenSubtipo: fuente.origenSubtipo,
        origenId: fuente.origenId,
        origenFechaISO: fechaISO(fuente.fechaDocumento),
        sourceLabel: fuente.tituloDocumento || fuente.origenSubtipo || fuente.origenTipo,
        hashFuente: fuente.hashFuente,
        hashFragmento: hashDeteccionEstable([
          fuente.origenTipo,
          fuente.origenId,
          normalizarTextoDeteccion(oracion),
          normalizarTextoDeteccion(expresion.expresionTemporal)
        ].join("|"))
      });
    });
  });
  return fragmentos;
}

function restar(fechaReferencia, cantidad, unidad) {
  const fecha = new Date(fechaReferencia);
  if (/dia/.test(unidad)) fecha.setDate(fecha.getDate() - cantidad);
  else if (/semana/.test(unidad)) fecha.setDate(fecha.getDate() - cantidad * 7);
  else if (/mes/.test(unidad)) fecha.setMonth(fecha.getMonth() - cantidad);
  else fecha.setFullYear(fecha.getFullYear() - cantidad);
  return fecha;
}

export function resolverFechaTemporal(expresion = "", fechaReferencia = new Date(), fechaNacimiento = null) {
  const referencia = convertirFecha(fechaReferencia) || new Date();
  const texto = normalizarTextoDeteccion(expresion);
  let m = texto.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (m) return { fechaInicioISO: fechaISO(new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12)), precisionTemporal: "dia", requiereRevisionFecha: false, fechaEsAproximada: false };
  m = texto.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return { fechaInicioISO: fechaISO(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)), precisionTemporal: "dia", requiereRevisionFecha: false, fechaEsAproximada: false };
  m = texto.match(/\b(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})\b/);
  if (m && MESES.has(m[2])) return { fechaInicioISO: fechaISO(new Date(Number(m[3]), MESES.get(m[2]), Number(m[1]), 12)), precisionTemporal: "dia", requiereRevisionFecha: false, fechaEsAproximada: false };
  m = texto.match(/\b([a-z]+)\s+de\s+(\d{4})\b/);
  if (m && MESES.has(m[1])) return { fechaInicioISO: fechaISO(new Date(Number(m[2]), MESES.get(m[1]), 1, 12)), precisionTemporal: "mes", requiereRevisionFecha: true, fechaEsAproximada: true };
  m = texto.match(/\b(principios|mediados|finales)\s+de\s+(\d{4})\b/);
  if (m) {
    const mes = m[1] === "principios" ? 0 : m[1] === "mediados" ? 5 : 9;
    return { fechaInicioISO: fechaISO(new Date(Number(m[2]), mes, 1, 12)), precisionTemporal: "aproximada", requiereRevisionFecha: true, fechaEsAproximada: true };
  }
  m = texto.match(/\b(?:en|desde|alrededor de)\s+(\d{4})\b/);
  if (m) return { fechaInicioISO: `${m[1]}-01-01`, precisionTemporal: "anio", requiereRevisionFecha: true, fechaEsAproximada: true };
  if (texto === "ayer") return { fechaInicioISO: fechaISO(restar(referencia, 1, "dia")), precisionTemporal: "dia", requiereRevisionFecha: true, fechaEsAproximada: true };
  if (texto === "anteayer") return { fechaInicioISO: fechaISO(restar(referencia, 2, "dia")), precisionTemporal: "dia", requiereRevisionFecha: true, fechaEsAproximada: true };
  if (texto.includes("semana pasada")) return { fechaInicioISO: fechaISO(restar(referencia, 1, "semana")), precisionTemporal: "semana", requiereRevisionFecha: true, fechaEsAproximada: true };
  if (texto.includes("mes pasado")) return { fechaInicioISO: fechaISO(restar(referencia, 1, "mes")), precisionTemporal: "mes", requiereRevisionFecha: true, fechaEsAproximada: true };
  if (texto.includes("ano pasado")) return { fechaInicioISO: `${referencia.getFullYear() - 1}-01-01`, precisionTemporal: "anio", requiereRevisionFecha: true, fechaEsAproximada: true };
  m = texto.match(/\bhace\s+(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s+(dia|dias|semana|semanas|mes|meses|ano|anos)\b/);
  if (m) {
    const cantidad = Number(m[1]) || NUMEROS.get(m[1]) || 1;
    const fecha = restar(referencia, cantidad, m[2]);
    return { fechaInicioISO: fechaISO(fecha), precisionTemporal: m[2].startsWith("dia") ? "dia" : m[2].startsWith("semana") ? "semana" : m[2].startsWith("mes") ? "mes" : "anio", requiereRevisionFecha: true, fechaEsAproximada: true };
  }
  m = texto.match(/\b(?:a los|desde los)\s+(\d{1,2})\s+anos\b/);
  const nacimiento = convertirFecha(fechaNacimiento);
  if (m && nacimiento) return { fechaInicioISO: `${nacimiento.getFullYear() + Number(m[1])}-01-01`, precisionTemporal: "anio", requiereRevisionFecha: true, fechaEsAproximada: true };
  return { fechaInicioISO: null, precisionTemporal: "indeterminada", requiereRevisionFecha: true, fechaEsAproximada: true };
}

export function clasificarTituloYCategoria(texto = "") {
  const normal = normalizarTextoDeteccion(texto);
  if (/madre|padre|herman|familiar/.test(normal) && /fallec|murio|muerte/.test(normal)) return { tituloSugerido: "Fallecimiento de familiar", categoriaSugerida: "antecedente_familiar" };
  if (/intento suicida|suicid/.test(normal)) return { tituloSugerido: "Intento suicida", categoriaSugerida: "intento_suicida" };
  if (/hospitaliz|internad|ingres/.test(normal)) return { tituloSugerido: "Hospitalizacion o ingreso", categoriaSugerida: "hospitalizacion" };
  if (/diagnostic/.test(normal)) return { tituloSugerido: "Diagnostico referido", categoriaSugerida: "diagnostico" };
  if (/tratamiento|medicamento|suspend|inici/.test(normal)) return { tituloSugerido: "Cambio de tratamiento", categoriaSugerida: "cambio_tratamiento" };
  if (/resonancia|tomograf|laboratorio|gabinete|estudio/.test(normal)) return { tituloSugerido: "Estudio clinico", categoriaSugerida: "estudio_gabinete" };
  if (/consumo|alcohol|cocaina|metanfetamina|cannabis|tabaco/.test(normal)) return { tituloSugerido: "Consumo de sustancias", categoriaSugerida: "consumo_sustancias" };
  return { tituloSugerido: "Evento clinico detectado", categoriaSugerida: null };
}

export function debeDescartarFragmento(fragmento = {}) {
  const texto = normalizarTextoDeteccion(fragmento.textoFragmento || "");
  if (!PATRON_RELEVANCIA.test(texto)) return { descartar: true, motivo: "sin_relevancia_clinica" };
  if (PATRON_ADMINISTRATIVO.test(texto)) return { descartar: true, motivo: "administrativo" };
  if (PATRON_FUTURO.test(texto)) return { descartar: true, motivo: "futuro_hipotetico" };
  if (PATRON_NEGACION_EVENTO.test(texto)) return { descartar: true, motivo: "negado" };
  return { descartar: false, motivo: "" };
}

export function extraerEventosDesdeFragmentos(fragmentos = [], fechaNacimiento = null) {
  const eventos = [];
  const descartados = [];
  for (const fragmento of fragmentos) {
    const descarte = debeDescartarFragmento(fragmento);
    if (descarte.descartar) {
      descartados.push({ motivo: descarte.motivo, hashFragmento: fragmento.hashFragmento });
      continue;
    }
    const fecha = resolverFechaTemporal(fragmento.expresionTemporal, fragmento.fechaReferencia, fechaNacimiento);
    const clasificacion = clasificarTituloYCategoria(fragmento.textoFragmento);
    const descripcion = String(fragmento.textoFragmento || "")
      .replace(fragmento.expresionTemporal || "", "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 360);
    const confianza = fecha.fechaInicioISO ? 0.72 : 0.48;
    eventos.push({
      ...clasificacion,
      descripcionSugerida: descripcion || clasificacion.tituloSugerido,
      ...fecha,
      expresionTemporalOriginal: fragmento.expresionTemporal,
      fragmentoSoporte: fragmento.textoFragmento.slice(0, 500),
      importanciaSugerida: /suicid|hospitaliz|urgencia|violencia|autoles/.test(normalizarTextoDeteccion(fragmento.textoFragmento)) ? "alta" : "media",
      confianza,
      nivelConfianza: confianza >= 0.85 ? "alta" : confianza >= 0.6 ? "media" : "baja",
      sujeto: /\bmadre|padre|herman|familiar\b/.test(normalizarTextoDeteccion(fragmento.textoFragmento)) ? "familiar" : "paciente",
      estadoAfirmacion: "ocurrido",
      relevanciaClinica: PATRON_RELEVANCIA.test(fragmento.textoFragmento) ? "probable" : "baja",
      origenTipo: fragmento.origenTipo,
      origenSubtipo: fragmento.origenSubtipo,
      origenId: fragmento.origenId,
      origenFechaISO: fragmento.origenFechaISO,
      sourceLabel: fragmento.sourceLabel,
      hashFuente: fragmento.hashFuente,
      hashFragmento: fragmento.hashFragmento
    });
  }
  return { eventos, descartados };
}

function etiquetaDiagnostico(dx = {}) {
  const codigo = textoSeguro(dx.codigo || dx.code || dx.id);
  const nombre = textoSeguro(dx.nombre || dx.name || dx.descripcion || dx.texto || dx.textoVisible || dx.diagnostico);
  return [codigo, nombre].filter(Boolean).join(" - ");
}

export function crearEventosEstructuradosDesdeFuente(fuente = {}) {
  const datos = fuente.datos || {};
  const eventos = [];
  if (fuente.origenTipo === "diagnostico") {
    const texto = etiquetaDiagnostico(datos);
    const fecha = fechaISO(datos.fechaDiagnostico || datos.fecha || datos.fechaRegistro || fuente.fechaDocumento);
    if (texto && fecha) eventos.push({
      tituloSugerido: "Diagnostico registrado",
      descripcionSugerida: texto.slice(0, 360),
      fechaInicioISO: fecha,
      precisionTemporal: "dia",
      requiereRevisionFecha: false,
      fechaEsAproximada: false,
      expresionTemporalOriginal: fecha,
      fragmentoSoporte: "",
      categoriaSugerida: "diagnostico",
      importanciaSugerida: "media",
      confianza: 0.9,
      nivelConfianza: "alta",
      sujeto: "paciente",
      estadoAfirmacion: "ocurrido",
      relevanciaClinica: "estructurada",
      origenTipo: fuente.origenTipo,
      origenSubtipo: fuente.origenSubtipo,
      origenId: fuente.origenId,
      origenFechaISO: fechaISO(fuente.fechaDocumento),
      sourceLabel: fuente.tituloDocumento || "Diagnosticos",
      hashFuente: fuente.hashFuente,
      hashFragmento: hashDeteccionEstable(["diagnostico", fuente.origenId, texto, fecha].join("|"))
    });
  }
  if (fuente.origenTipo === "tratamiento") {
    const medicamento = textoSeguro(datos.medicamento || datos.nombreMedicamento || datos.nombre || datos.principioActivo);
    const inicio = fechaISO(datos.fechaInicio || datos.fechaCreacion || fuente.fechaDocumento);
    const suspension = fechaISO(datos.fechaSuspension || datos.fechaSuspendido || datos.fechaFin);
    if (medicamento && inicio) eventos.push({
      tituloSugerido: "Inicio de tratamiento",
      descripcionSugerida: medicamento.slice(0, 360),
      fechaInicioISO: inicio,
      precisionTemporal: "dia",
      requiereRevisionFecha: false,
      fechaEsAproximada: false,
      expresionTemporalOriginal: inicio,
      fragmentoSoporte: "",
      categoriaSugerida: "cambio_tratamiento",
      importanciaSugerida: "media",
      confianza: 0.88,
      nivelConfianza: "alta",
      sujeto: "paciente",
      estadoAfirmacion: "ocurrido",
      relevanciaClinica: "estructurada",
      origenTipo: fuente.origenTipo,
      origenSubtipo: fuente.origenSubtipo,
      origenId: fuente.origenId,
      origenFechaISO: fechaISO(fuente.fechaDocumento),
      sourceLabel: fuente.tituloDocumento || "Tratamiento e indicaciones",
      hashFuente: fuente.hashFuente,
      hashFragmento: hashDeteccionEstable(["tratamiento-inicio", fuente.origenId, medicamento, inicio].join("|"))
    });
    if (medicamento && suspension) eventos.push({
      tituloSugerido: "Suspension de tratamiento",
      descripcionSugerida: medicamento.slice(0, 360),
      fechaInicioISO: suspension,
      precisionTemporal: "dia",
      requiereRevisionFecha: false,
      fechaEsAproximada: false,
      expresionTemporalOriginal: suspension,
      fragmentoSoporte: "",
      categoriaSugerida: "cambio_tratamiento",
      importanciaSugerida: "media",
      confianza: 0.88,
      nivelConfianza: "alta",
      sujeto: "paciente",
      estadoAfirmacion: "ocurrido",
      relevanciaClinica: "estructurada",
      origenTipo: fuente.origenTipo,
      origenSubtipo: "tratamiento_suspendido",
      origenId: fuente.origenId,
      origenFechaISO: fechaISO(fuente.fechaDocumento),
      sourceLabel: fuente.tituloDocumento || "Tratamiento e indicaciones",
      hashFuente: fuente.hashFuente,
      hashFragmento: hashDeteccionEstable(["tratamiento-suspension", fuente.origenId, medicamento, suspension].join("|"))
    });
  }
  if (fuente.origenTipo === "estudio") {
    const nombre = textoSeguro(datos.nombre || datos.tipo || datos.estudio || datos.nombreEstudio);
    const fecha = fechaISO(datos.fechaRealizacion || datos.fechaEstudio || datos.fecha || fuente.fechaDocumento);
    if (nombre && fecha) eventos.push({
      tituloSugerido: "Estudio clinico",
      descripcionSugerida: nombre.slice(0, 360),
      fechaInicioISO: fecha,
      precisionTemporal: "dia",
      requiereRevisionFecha: false,
      fechaEsAproximada: false,
      expresionTemporalOriginal: fecha,
      fragmentoSoporte: "",
      categoriaSugerida: "estudio_gabinete",
      importanciaSugerida: "media",
      confianza: 0.9,
      nivelConfianza: "alta",
      sujeto: "paciente",
      estadoAfirmacion: "ocurrido",
      relevanciaClinica: "estructurada",
      origenTipo: fuente.origenTipo,
      origenSubtipo: fuente.origenSubtipo,
      origenId: fuente.origenId,
      origenFechaISO: fechaISO(fuente.fechaDocumento),
      sourceLabel: fuente.tituloDocumento || "Estudios",
      hashFuente: fuente.hashFuente,
      hashFragmento: hashDeteccionEstable(["estudio", fuente.origenId, nombre, fecha].join("|"))
    });
  }
  return eventos;
}

export function normalizarCandidatoEvento(candidato = {}, pacienteId = "") {
  const titulo = textoSeguro(candidato.tituloSugerido).slice(0, 160) || "Evento clinico detectado";
  const fecha = candidato.fechaInicioISO && /^\d{4}-\d{2}-\d{2}$/.test(candidato.fechaInicioISO)
    ? candidato.fechaInicioISO
    : null;
  const detectedEventId = hashDeteccionEstable([
    pacienteId,
    candidato.hashFragmento || "",
    fecha || "sin-fecha",
    normalizarTextoDeteccion(titulo),
    normalizarTextoDeteccion(candidato.sujeto || "paciente")
  ].join("|"));
  return {
    ...candidato,
    tituloSugerido: titulo,
    descripcionSugerida: textoSeguro(candidato.descripcionSugerida).slice(0, 1200) || titulo,
    fechaInicioISO: fecha,
    fechaFinISO: candidato.fechaFinISO || null,
    detectedEventId,
    hashConceptual: detectedEventId,
    estado: ESTADOS_DETECCION_EVENTOS.pendiente
  };
}

export function detectarEventosEnFuentes({ fuentes = [], fechaNacimiento = null, pacienteId = "" } = {}) {
  const fuentesConTexto = fuentes.filter((fuente) => String(fuente.textoAnalizable || "").trim());
  const fragmentos = fuentesConTexto.flatMap(generarFragmentosTemporales);
  const { eventos, descartados } = extraerEventosDesdeFragmentos(fragmentos, fechaNacimiento);
  const estructurados = fuentes.flatMap(crearEventosEstructuradosDesdeFuente);
  const normalizados = [...eventos, ...estructurados].map((evento) => normalizarCandidatoEvento(evento, pacienteId));
  const unicos = new Map();
  const duplicados = [];
  for (const evento of normalizados) {
    const clave = evento.detectedEventId || evento.hashConceptual;
    if (!clave) continue;
    if (unicos.has(clave)) {
      duplicados.push(clave);
    } else {
      unicos.set(clave, evento);
    }
  }
  const eventosNormalizados = [...unicos.values()].sort((a, b) => {
    const confianza = Number(b.confianza || 0) - Number(a.confianza || 0);
    if (confianza) return confianza;
    return String(b.fechaInicioISO || "").localeCompare(String(a.fechaInicioISO || ""));
  });
  return {
    fuentesEncontradas: fuentes.length,
    fuentesConTexto: fuentesConTexto.length,
    fragmentosGenerados: fragmentos.length,
    fragmentosConExpresionesTemporales: fragmentos.length,
    eventosExtraidos: eventos.length + estructurados.length,
    eventosNormalizados: eventosNormalizados.length,
    eventosDescartados: descartados.length,
    motivosDescarte: descartados.reduce((acc, item) => {
      acc[item.motivo] = (acc[item.motivo] || 0) + 1;
      return acc;
    }, {}),
    duplicadosDetectados: duplicados.length,
    eventos: eventosNormalizados
  };
}
