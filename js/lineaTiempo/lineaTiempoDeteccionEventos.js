export const DEBUG_EVENT_DETECTION = false;
export const DETECTED_EVENTS_DEBUG_LABEL = "[Eventos detectados 1.29]";

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

const PATRON_TEMPORAL = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}|(?:principios|mediados|finales)\s+de\s+\d{4}|[a-záéíóúñ]+\s+de\s+\d{4}|(?:en|desde|alrededor de)\s+\d{4}|(?:ayer|anteayer|la semana pasada|el mes pasado|el año pasado|el ano pasado|la próxima semana|la proxima semana|próxima semana|proxima semana)|(?:desde\s+)?(?:aproximadamente\s+)?hace\s+(?:\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s+(?:día|dia|dias|días|semana|semanas|mes|meses|año|años|ano|anos)|durante\s+los\s+ultimos\s+(?:\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s+(?:dias|semanas|meses|anos|años)|(?:a los|desde los|a partir de los)\s+\d{1,2}\s+(?:años|anos)|en el internamiento previo|durante la hospitalización anterior|durante la hospitalizacion anterior|en la consulta pasada|en el embarazo|en la infancia|durante la adolescencia|al inicio de la universidad|desde joven|desde pequeño|desde pequeno|años atrás|anos atras|hace tiempo|recientemente)\b/giu;

const PATRON_RELEVANCIA = /\b(ingres\w*|internad\w*|hospitaliz\w*|alta|urgencia|crisis|intento suicida|suicid\w*|autoles\w*|violencia|conductas sexuales de riesgo|riesgo sexual|diagnostic\w*|tratamiento|medicamento|sertralina|clozapina|risperidona|litio|suspend\w*|ajust\w*|aument\w*|disminu\w*|inici\w*|comenz\w*|resonancia|tomograf\w*|laboratorio|gabinete|estudio|cirug\w*|enfermedad|consumo|alcohol|cocaina|metanfetamina|cannabis|recaid\w*|trauma|fallec\w*|murio|muerte|embarazo|parto|legal|aislamiento|insomnio|anhedonia|ansiedad|depres\w*|agitaci\w*|crianza|abuso|agresion|convulsion\w*|catatoni\w*|psicosis|alucin\w*|consulta|padecimiento)\b/i;
const PATRON_NEGACION_EVENTO = /\b(niega|niegan|sin antecedente(?:s)? de|no ha presentado|no presenta|no refiere|descarta|se descarto)\s+(?:[\wáéíóúñ]+\s+){0,5}(hospitaliz|intento|suicid|convulsion|crisis|consumo|violencia|alucin|ingreso)/i;
const PATRON_FUTURO = /\b(se valorara|se valorará|se considerara|se considerará|si empeora|proxima consulta|próxima consulta|se hospitalizara|se hospitalizará|se programo|se programó|se indicara|se indicará|proxima semana|próxima semana)\b/i;
const PATRON_ADMINISTRATIVO = /\b(documento creado|usuario modific|firma registrada|nota firmada|exportacion|exportación|actualizado en|creado en|se agrego diagnostico|se agregó diagnostico|se actualizo tratamiento|se actualizó tratamiento)\b/i;

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
        oracionEvento: oracion,
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

function generarFragmentosNarrativosSinFecha(fuente = {}) {
  const oraciones = oracionesConContexto(fuente.textoAnalizable || "");
  const fragmentos = [];
  oraciones.forEach((oracion) => {
    const normal = normalizarTextoDeteccion(oracion);
    if (detectarExpresionesTemporalesLocales(oracion).length) return;
    if (!/(ideacion suicida|ideas suicidas|conductas sexuales de riesgo|autolesion|intento suicida|crisis de ansiedad|alucinaciones auditivas|escuchaba voces)/.test(normal)) return;
    fragmentos.push({
      expresionTemporal: null,
      indiceInicio: 0,
      indiceFin: 0,
      textoFragmento: oracion,
      oracionEvento: oracion,
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
        "sin-fecha"
      ].join("|"))
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
  m = texto.match(/\b(?:hace|durante los ultimos|durante los últimos)\s+(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s+(dia|dias|semana|semanas|mes|meses|ano|anos)\b/);
  if (m) {
    const cantidad = Number(m[1]) || NUMEROS.get(m[1]) || 1;
    const fecha = restar(referencia, cantidad, m[2]);
    return { fechaInicioISO: fechaISO(fecha), precisionTemporal: m[2].startsWith("dia") ? "dia" : m[2].startsWith("semana") ? "semana" : m[2].startsWith("mes") ? "mes" : "anio", requiereRevisionFecha: true, fechaEsAproximada: true };
  }
  m = texto.match(/\b(?:a los|desde los|a partir de los)\s+(\d{1,2})\s+anos\b/);
  const nacimiento = convertirFecha(fechaNacimiento);
  if (m && nacimiento) return { fechaInicioISO: `${nacimiento.getFullYear() + Number(m[1])}-01-01`, precisionTemporal: "anio", requiereRevisionFecha: true, fechaEsAproximada: true };
  if (/internamiento previo|hospitalizacion anterior|consulta pasada|embarazo|infancia|adolescencia|inicio de la universidad|hace tiempo|recientemente/.test(texto)) {
    return { fechaInicioISO: null, precisionTemporal: "contextual", requiereRevisionFecha: true, fechaEsAproximada: true };
  }
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
  const texto = normalizarTextoDeteccion(fragmento.oracionEvento || fragmento.textoFragmento || "");
  if (PATRON_ADMINISTRATIVO.test(texto)) return { descartar: true, motivo: "administrativo" };
  if (!PATRON_RELEVANCIA.test(texto)) return { descartar: true, motivo: "sin_relevancia_clinica" };
  if (PATRON_FUTURO.test(texto)) return { descartar: true, motivo: "futuro_hipotetico" };
  if (PATRON_NEGACION_EVENTO.test(texto)) return { descartar: true, motivo: "negado" };
  return { descartar: false, motivo: "" };
}

function obtenerContextoEvento(fragmento = {}) {
  const texto = String(fragmento.oracionEvento || fragmento.textoFragmento || "").replace(/\s+/g, " ").trim();
  const expresion = String(fragmento.expresionTemporal || "").trim();
  if (!texto || !expresion) return texto;
  const partes = texto
    .split(/\s*(?:,|;|\sy\s(?=(?:fue|se|suspend|inicio|inició|present|consum|intent|hospitaliz|ingres|egres|tuvo|realiz)))/i)
    .map((parte) => parte.trim())
    .filter(Boolean);
  const seleccionada = partes.find((parte) => parte.includes(expresion));
  if (seleccionada && /\b(inici\w*|comenz\w*|present\w*|suspend\w*|intent\w*|fue|se|tuvo|realiz\w*)\b/i.test(normalizarTextoDeteccion(seleccionada))) {
    return seleccionada;
  }
  return texto;
}

function terminaIncompleto(texto = "") {
  return /\b(el|la|los|las|un|una|con|y|o|as[ií]\s+como|debido\s+a|por|para|del|de)$/i.test(String(texto || "").trim());
}

function completarDescripcion(texto = "") {
  let salida = String(texto || "").replace(/\s+/g, " ").trim();
  salida = salida.replace(/\s+(el|la|los|las|un|una|con|y|o|as[ií]\s+como|debido\s+a|por|para|del|de)$/i, "").trim();
  if (!salida) return "";
  return /[.!?]$/.test(salida) ? salida : `${salida}.`;
}

function capitalizar(texto = "") {
  const valor = String(texto || "").trim();
  return valor ? `${valor.charAt(0).toLocaleUpperCase("es-MX")}${valor.slice(1)}` : "";
}

function detectarMedicamento(texto = "") {
  const m = normalizarTextoDeteccion(texto).match(/\b(sertralina|clozapina|risperidona|olanzapina|quetiapina|litio|valproato|clonazepam|lorazepam|fluoxetina|escitalopram|haloperidol)\b/);
  return m?.[1] || "";
}

function crearAtomo({ titulo, tipoEvento, descripcion, fragmento, categoria, importancia = "media", requiereRevisionClinica = false, motivoRevision = null, confianzaSemantica = 0.78 }) {
  return {
    tituloSugerido: titulo,
    tipoEvento,
    descripcionSugerida: completarDescripcion(descripcion),
    fragmentoSoporte: fragmento,
    categoriaSugerida: categoria || null,
    importanciaSugerida: importancia,
    requiereRevisionClinica,
    motivoRevision,
    confianzaSemantica,
    confianza: confianzaSemantica
  };
}

function crearAtomosClinicos(contexto = "", contextoAmplio = "") {
  const normal = normalizarTextoDeteccion(contexto);
  const normalAmplio = normalizarTextoDeteccion(contextoAmplio || contexto);
  const atomos = [];
  const med = detectarMedicamento(contexto) || detectarMedicamento(contextoAmplio);
  if (/\bideacion suicida\b|\bideas suicidas\b|\bideacion autolitica\b/.test(normal)) {
    atomos.push(crearAtomo({
      titulo: "Ideacion suicida",
      tipoEvento: "ideacion_suicida",
      descripcion: "Se documenta ideacion suicida referida en el periodo descrito, sin evidencia textual suficiente de intento suicida consumado.",
      fragmento: contexto,
      categoria: "riesgo_suicida",
      importancia: "alta",
      confianzaSemantica: 0.88
    }));
  }
  if (/\bplan suicida\b|\bplan autolitico\b/.test(normal)) {
    atomos.push(crearAtomo({ titulo: "Plan suicida", tipoEvento: "plan_suicida", descripcion: "Se documenta plan suicida en el periodo descrito.", fragmento: contexto, categoria: "riesgo_suicida", importancia: "alta", confianzaSemantica: 0.9 }));
  }
  if (/\bintento suicida\b|\bintento suicidarse\b|\bintento quitarse la vida\b|\bintento autolitico\b|\bintento.*ingesta medicamentosa\b/.test(normal)) {
    atomos.push(crearAtomo({ titulo: normal.includes("ingesta medicamentosa") ? "Intento suicida mediante ingesta medicamentosa" : "Intento suicida", tipoEvento: "intento_suicida", descripcion: "Se documenta intento suicida ocurrido en el periodo descrito.", fragmento: contexto, categoria: "intento_suicida", importancia: "alta", confianzaSemantica: 0.92 }));
  }
  if (/\bautolesion\b|\bse corto\b|\bcortes\b/.test(normal) && !/intencion de morir|suicid/.test(normal)) {
    atomos.push(crearAtomo({ titulo: "Autolesion sin intencion suicida documentada", tipoEvento: "autolesion_no_suicida", descripcion: "Se documenta autolesion sin evidencia textual suficiente de intencion suicida.", fragmento: contexto, categoria: "autolesion", importancia: "alta", requiereRevisionClinica: true, motivoRevision: "Confirmar intencionalidad suicida.", confianzaSemantica: 0.72 }));
  }
  if (/conductas sexuales de riesgo|riesgo sexual/.test(normal)) {
    atomos.push(crearAtomo({ titulo: "Conductas sexuales de riesgo", tipoEvento: "conducta_riesgo", descripcion: "Se documentan conductas sexuales de riesgo durante el periodo referido.", fragmento: contexto, categoria: "conducta_riesgo", importancia: "media", confianzaSemantica: 0.82 }));
  }
  if (/inici\w*|comenz\w*/.test(normal) && /padecimiento/.test(normal)) {
    atomos.push(crearAtomo({ titulo: "Inicio del padecimiento actual", tipoEvento: "inicio_padecimiento", descripcion: "Se documenta inicio aproximado del padecimiento actual en el periodo referido.", fragmento: contexto, categoria: "inicio_sintomas", importancia: "media", confianzaSemantica: 0.86 }));
  }
  if (/inici\w*|comenz\w*/.test(normal) && /consumo|alcohol|cannabis|cocaina|metanfetamina/.test(normal)) {
    const sustancia = normal.includes("alcohol") ? "alcohol" : normal.includes("cannabis") ? "cannabis" : normal.includes("cocaina") ? "cocaina" : normal.includes("metanfetamina") ? "metanfetamina" : "sustancias";
    atomos.push(crearAtomo({ titulo: `Inicio de consumo de ${sustancia}`, tipoEvento: "inicio_consumo", descripcion: `Se documenta inicio de consumo de ${sustancia} en el periodo referido.`, fragmento: contexto, categoria: "consumo_sustancias", importancia: "media", confianzaSemantica: 0.86 }));
  }
  if (/(inici\w*|comenz\w*)/.test(normal) && /aislamiento|insomnio|anhedonia/.test(normal)) {
    const sintomas = ["aislamiento", "insomnio", "anhedonia"].filter((s) => normal.includes(s)).join(", ");
    atomos.push(crearAtomo({ titulo: `Inicio de ${sintomas || "sintomas"}`, tipoEvento: "inicio_sintomas", descripcion: `Se documenta inicio de ${sintomas || "sintomas"} en el periodo referido, sin inferir un diagnostico especifico.`, fragmento: contexto, categoria: "inicio_sintomas", importancia: "media", confianzaSemantica: 0.82 }));
  }
  if (/crisis de ansiedad|crisis ansiosa/.test(normal)) {
    atomos.push(crearAtomo({ titulo: "Crisis de ansiedad", tipoEvento: "crisis_ansiedad", descripcion: "Se documenta crisis de ansiedad en el periodo referido.", fragmento: contexto, categoria: "crisis_ansiedad", importancia: "media", confianzaSemantica: 0.84 }));
  }
  if (/hospitaliz\w*|internad\w*|ingres\w*/.test(normal) && !/consider/.test(normal)) {
    atomos.push(crearAtomo({ titulo: "Hospitalizacion psiquiatrica", tipoEvento: "hospitalizacion", descripcion: "Se documenta hospitalizacion o ingreso en el periodo referido.", fragmento: contexto, categoria: "hospitalizacion", importancia: "alta", confianzaSemantica: 0.86 }));
  }
  if (/alta hospitalaria|egres\w*/.test(normal)) {
    atomos.push(crearAtomo({ titulo: "Alta hospitalaria", tipoEvento: "alta_hospitalaria", descripcion: "Se documenta alta o egreso hospitalario en el periodo referido.", fragmento: contexto, categoria: "hospitalizacion", importancia: "media", confianzaSemantica: 0.82 }));
  }
  if (/suspend\w*/.test(normal) && (med || /tratamiento|medicamento/.test(normal) || /tratamiento|medicamento/.test(normalAmplio))) {
    atomos.push(crearAtomo({ titulo: med ? `Suspension de ${med}` : "Suspension de tratamiento", tipoEvento: "suspension_tratamiento", descripcion: med ? `Se documenta suspension de ${med} en el periodo referido.` : "Se documenta suspension de tratamiento en el periodo referido.", fragmento: contexto, categoria: "cambio_tratamiento", importancia: "media", confianzaSemantica: 0.84 }));
  }
  if (/inici\w*/.test(normal) && med) {
    atomos.push(crearAtomo({ titulo: `Inicio de ${med}`, tipoEvento: "inicio_tratamiento", descripcion: `Se documenta inicio de ${med} en el periodo referido.`, fragmento: contexto, categoria: "cambio_tratamiento", importancia: "media", confianzaSemantica: 0.86 }));
  }
  if (/nausea|náusea|vomito|vómito|mareo|somnolencia/.test(normal)) {
    const sintoma = normal.includes("somnolencia") ? "somnolencia" : normal.includes("mareo") ? "mareo" : normal.includes("vomito") ? "vomito" : "nausea";
    atomos.push(crearAtomo({ titulo: `Aparicion de ${sintoma}`, tipoEvento: "efecto_adverso", descripcion: `Se documenta aparicion de ${sintoma} en el periodo referido.`, fragmento: contexto, categoria: "efecto_adverso", importancia: "media", confianzaSemantica: 0.76 }));
  }
  if (/alucinaciones auditivas|escuchaba voces|escucha voces/.test(normal)) {
    atomos.push(crearAtomo({ titulo: "Inicio de alucinaciones auditivas", tipoEvento: "sintoma_psicotico", descripcion: "Se documentan alucinaciones auditivas o escucha de voces en el periodo referido, sin inferir diagnostico especifico.", fragmento: contexto, categoria: "sintoma_psicotico", importancia: "alta", confianzaSemantica: 0.8 }));
  }
  return atomos;
}

function crearAtomoGenericoDesdeContexto(contexto = "", clasificacion = {}) {
  const titulo = clasificacion.tituloSugerido === "Cambio de tratamiento" || clasificacion.tituloSugerido === "Evento clinico detectado"
    ? "Evento clinico por precisar"
    : clasificacion.tituloSugerido;
  return crearAtomo({
    titulo,
    tipoEvento: clasificacion.categoriaSugerida || "evento_clinico",
    descripcion: `Se documenta ${titulo.toLocaleLowerCase("es-MX")} en el periodo referido; requiere revision clinica para precisar el alcance del suceso.`,
    fragmento: contexto,
    categoria: clasificacion.categoriaSugerida,
    importancia: /suicid|hospitaliz|urgencia|violencia|autoles/.test(normalizarTextoDeteccion(contexto)) ? "alta" : "media",
    requiereRevisionClinica: true,
    motivoRevision: "El detector local no pudo precisar completamente el nucleo clinico.",
    confianzaSemantica: 0.58
  });
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
    const contextoEvento = obtenerContextoEvento(fragmento);
    const fecha = fragmento.expresionTemporal
      ? resolverFechaTemporal(fragmento.expresionTemporal, fragmento.fechaReferencia, fechaNacimiento)
      : { fechaInicioISO: null, precisionTemporal: "indeterminada", requiereRevisionFecha: true, fechaEsAproximada: true };
    const clasificacion = clasificarTituloYCategoria(contextoEvento);
    const atomos = crearAtomosClinicos(contextoEvento, fragmento.oracionEvento || fragmento.textoFragmento || contextoEvento);
    const candidatos = atomos.length ? atomos : [crearAtomoGenericoDesdeContexto(contextoEvento, clasificacion)];
    candidatos.forEach((atomo, indiceAtomo) => {
      const confianza = Math.min(0.98, Number(atomo.confianzaSemantica || atomo.confianza || 0.6));
      eventos.push({
        ...clasificacion,
        ...atomo,
        descripcionSugerida: completarDescripcion(atomo.descripcionSugerida || atomo.descripcion || atomo.tituloSugerido),
        ...fecha,
        expresionTemporalOriginal: fragmento.expresionTemporal,
        fragmentoSoporte: atomo.fragmentoSoporte || contextoEvento.slice(0, 500),
        confianza,
        nivelConfianza: confianza >= 0.85 ? "alta" : confianza >= 0.6 ? "media" : "baja",
        sujeto: /\bmadre|padre|herman|familiar\b/.test(normalizarTextoDeteccion(contextoEvento)) ? "familiar" : "paciente",
        estadoAfirmacion: "ocurrido",
        relevanciaClinica: PATRON_RELEVANCIA.test(contextoEvento) ? "probable" : "baja",
        origenDeteccion: "narrativo",
        origenTipo: fragmento.origenTipo,
        origenSubtipo: fragmento.origenSubtipo,
        origenId: fragmento.origenId,
        origenFechaISO: fragmento.origenFechaISO,
        sourceLabel: fragmento.sourceLabel,
        hashFuente: fragmento.hashFuente,
        hashFragmento: hashDeteccionEstable([fragmento.hashFragmento, atomo.tipoEvento || atomo.tituloSugerido, indiceAtomo].join("|"))
      });
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
    const fecha = fechaISO(datos.fechaDiagnostico || datos.fechaClinicaDiagnostico || datos.fechaInicioDiagnostico);
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
      origenDeteccion: "estructurado-clinico",
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
    const inicio = fechaISO(datos.fechaInicioTratamiento || datos.fechaInicioClinica || datos.fechaInicioMedicamento || datos.fechaInicio);
    const suspension = fechaISO(datos.fechaSuspensionTratamiento || datos.fechaSuspensionClinica || datos.fechaSuspendido || datos.fechaFinTratamiento || datos.fechaFin);
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
      origenDeteccion: "estructurado-clinico",
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
      origenDeteccion: "estructurado-clinico",
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
    const fecha = fechaISO(datos.fechaRealizacion || datos.fechaEstudio || datos.fechaToma || datos.fechaClinicaEstudio);
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
      origenDeteccion: "estructurado-clinico",
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
    descripcionSugerida: completarDescripcion(textoSeguro(candidato.descripcionSugerida).slice(0, 1200) || titulo),
    fechaInicioISO: fecha,
    fechaFinISO: candidato.fechaFinISO || null,
    precisionTemporal: ["hora", "dia", "semana", "mes", "anio", "contextual", "aproximada", "indeterminada"].includes(candidato.precisionTemporal) ? candidato.precisionTemporal : "indeterminada",
    fechaEsAproximada: candidato.fechaEsAproximada !== false,
    fragmentoSoporte: textoSeguro(candidato.fragmentoSoporte).slice(0, 700),
    tipoEvento: textoSeguro(candidato.tipoEvento) || "evento_clinico",
    sujeto: ["paciente", "familiar", "otro"].includes(candidato.sujeto) ? candidato.sujeto : "paciente",
    estadoAfirmacion: ["ocurrido", "negado", "posible", "futuro", "condicional"].includes(candidato.estadoAfirmacion) ? candidato.estadoAfirmacion : "ocurrido",
    confianzaSemantica: Math.max(0, Math.min(1, Number(candidato.confianzaSemantica ?? candidato.confianza ?? 0.6))),
    requiereRevisionClinica: candidato.requiereRevisionClinica === true || terminaIncompleto(candidato.descripcionSugerida || "") || titulo === "Evento clinico por precisar",
    motivoRevision: candidato.motivoRevision || (terminaIncompleto(candidato.descripcionSugerida || "") ? "Descripcion incompleta antes de normalizacion." : null),
    detectedEventId,
    hashConceptual: detectedEventId,
    estado: ESTADOS_DETECCION_EVENTOS.pendiente
  };
}

export function detectarEventosEnFuentes({ fuentes = [], fechaNacimiento = null, pacienteId = "", incluirEstructurados = false } = {}) {
  const fuentesConTexto = fuentes.filter((fuente) => String(fuente.textoAnalizable || "").trim());
  const fragmentosTemporales = fuentesConTexto.flatMap(generarFragmentosTemporales);
  const fragmentosSinFecha = fuentesConTexto.flatMap(generarFragmentosNarrativosSinFecha);
  const fragmentos = [...fragmentosTemporales, ...fragmentosSinFecha];
  const { eventos, descartados } = extraerEventosDesdeFragmentos(fragmentos, fechaNacimiento);
  const estructurados = incluirEstructurados ? fuentes.flatMap(crearEventosEstructuradosDesdeFuente) : [];
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
    fragmentosConExpresionesTemporales: fragmentosTemporales.length,
    eventosExtraidos: eventos.length + estructurados.length,
    eventosNormalizados: eventosNormalizados.length,
    eventosDescartados: descartados.length,
    motivosDescarte: descartados.reduce((acc, item) => {
      acc[item.motivo] = (acc[item.motivo] || 0) + 1;
      return acc;
    }, {}),
    candidatosNarrativos: eventos.length,
    candidatosEstructurados: estructurados.length,
    administrativosDescartados: descartados.filter((item) => item.motivo === "administrativo").length,
    candidatosTotales: normalizados.length,
    candidatosClaros: eventosNormalizados.filter((evento) => evento.requiereRevisionClinica !== true).length,
    candidatosReparados: eventosNormalizados.filter((evento) => evento.motivoRevision === "Descripcion incompleta antes de normalizacion.").length,
    candidatosDivididos: Math.max(0, eventos.length - fragmentos.length),
    candidatosAmbiguos: eventosNormalizados.filter((evento) => evento.requiereRevisionClinica === true).length,
    candidatosDescartadosPorIncoherencia: descartados.filter((item) => item.motivo === "incoherencia_semantica").length,
    duplicadosDetectados: duplicados.length,
    eventos: eventosNormalizados
  };
}
