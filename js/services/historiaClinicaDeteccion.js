const EXTRACTOR_VERSION = "historia-detected-data-v1";

function definirCampo({
  clave,
  etiqueta,
  seccionId,
  seccionEtiqueta,
  campoId = null,
  tipoDestino = "campo",
  incluirEtiqueta = false,
  aliases = []
}) {
  return Object.freeze({
    clave,
    etiqueta,
    seccionId,
    seccionEtiqueta,
    campoId,
    tipoDestino,
    incluirEtiqueta,
    aliases: Object.freeze([clave, campoId, etiqueta, ...aliases].filter(Boolean))
  });
}

export const HISTORIA_CAMPOS_DETECTABLES = Object.freeze([
  definirCampo({ clave: "escolaridad", etiqueta: "Escolaridad", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "escolaridad", aliases: ["nivel escolar", "nivelEscolar"] }),
  definirCampo({ clave: "ocupacion", etiqueta: "Ocupación", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "ocupacion", aliases: ["actividad laboral", "empleo actual"] }),
  definirCampo({ clave: "estadoCivil", etiqueta: "Estado civil", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "estadoCivil", aliases: ["estado civil"] }),
  definirCampo({ clave: "religion", etiqueta: "Religión", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "religion" }),
  definirCampo({ clave: "institucionPaciente", etiqueta: "Institución", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "institucionPaciente", aliases: ["institucion", "hospital"] }),
  definirCampo({ clave: "servicioInstitucional", etiqueta: "Servicio", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "servicioInstitucional", aliases: ["servicio"] }),
  definirCampo({ clave: "expediente", etiqueta: "Expediente institucional", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "expediente", aliases: ["numeroExpediente", "número de expediente", "expediente institucional"] }),
  definirCampo({ clave: "cama", etiqueta: "Cama", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "cama" }),
  definirCampo({ clave: "sexo", etiqueta: "Sexo", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "sexo", aliases: ["sexo registrado"] }),
  definirCampo({ clave: "genero", etiqueta: "Género", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "genero", aliases: ["identidadGenero", "identidad de género"] }),
  definirCampo({ clave: "alergias", etiqueta: "Alergias", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "alergias", aliases: ["alergias conocidas"] }),
  definirCampo({ clave: "tipoSangre", etiqueta: "Tipo de sangre", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "tipoSangre", aliases: ["grupo sanguineo", "grupo sanguíneo"] }),
  definirCampo({ clave: "peso", etiqueta: "Peso", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "peso", aliases: ["peso actual"] }),
  definirCampo({ clave: "talla", etiqueta: "Talla", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "talla", aliases: ["estatura"] }),
  definirCampo({ clave: "imc", etiqueta: "IMC", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "imc", tipoDestino: "readonly", aliases: ["indice de masa corporal", "índice de masa corporal"] }),
  definirCampo({ clave: "perimetroAbdominal", etiqueta: "Perímetro abdominal", seccionId: "ficha", seccionEtiqueta: "Ficha de identificación", campoId: "perimetroAbdominal", aliases: ["perimetro abdominal", "circunferencia abdominal"] }),

  definirCampo({ clave: "ahf", etiqueta: "Antecedentes heredofamiliares", seccionId: "antecedentes", seccionEtiqueta: "Antecedentes", campoId: "ahf", aliases: ["antecedentes familiares", "antecedentesHeredofamiliares"] }),
  definirCampo({ clave: "antecedentesPerinatales", etiqueta: "Antecedentes perinatales", seccionId: "antecedentes", seccionEtiqueta: "Antecedentes", campoId: "antecedentesPerinatales", aliases: ["embarazo y parto", "periodo neonatal"] }),
  definirCampo({ clave: "app", etiqueta: "Antecedentes personales patológicos", seccionId: "antecedentes", seccionEtiqueta: "Antecedentes", campoId: "app", aliases: ["antecedentes personales patologicos", "antecedentesPersonalesPatologicos"] }),
  definirCampo({ clave: "apnp", etiqueta: "Antecedentes personales no patológicos", seccionId: "antecedentes", seccionEtiqueta: "Antecedentes", campoId: "apnp", aliases: ["antecedentes personales no patologicos", "antecedentesPersonalesNoPatologicos"] }),
  definirCampo({ clave: "antecedentesGinecoobstetricos", etiqueta: "Antecedentes ginecoobstétricos", seccionId: "antecedentes", seccionEtiqueta: "Antecedentes", campoId: "antecedentesGinecoobstetricos", aliases: ["antecedentes ginecoobstetricos", "ginecoobstetricos"] }),
  definirCampo({ clave: "historiaSocial", etiqueta: "Historia social", seccionId: "antecedentes", seccionEtiqueta: "Antecedentes", campoId: "apnp", incluirEtiqueta: true, aliases: ["antecedentes sociales"] }),

  definirCampo({ clave: "hitosDesarrollo", etiqueta: "Hitos del desarrollo", seccionId: "desarrollo", seccionEtiqueta: "Hitos del desarrollo", tipoDestino: "hitos", aliases: ["antecedentes del desarrollo", "desarrollo psicomotor"] }),
  definirCampo({ clave: "historiaFamiliar", etiqueta: "Historia familiar", seccionId: "familiar", seccionEtiqueta: "Historia familiar", campoId: "historiaFamiliar", aliases: ["dinamica familiar", "dinámica familiar", "red de apoyo"] }),
  definirCampo({ clave: "historiaAcademica", etiqueta: "Historia académica", seccionId: "academica", seccionEtiqueta: "Historia académica", campoId: "historiaAcademica", aliases: ["antecedentes escolares", "historia academica"] }),
  definirCampo({ clave: "historiaLaboral", etiqueta: "Historia laboral", seccionId: "laboral", seccionEtiqueta: "Historia laboral", campoId: "historiaLaboral", aliases: ["antecedentes laborales"] }),

  definirCampo({ clave: "diagnosticosPrevios", etiqueta: "Diagnósticos previos", seccionId: "psiquiatria", seccionEtiqueta: "Psiquiatría", campoId: "diagnosticosPrevios", aliases: ["antecedentes psiquiatricos", "antecedentes psiquiátricos", "diagnosticos psiquiatricos previos"] }),
  definirCampo({ clave: "tratamientosPrevios", etiqueta: "Tratamientos previos", seccionId: "psiquiatria", seccionEtiqueta: "Psiquiatría", campoId: "tratamientosPrevios", aliases: ["tratamientos psiquiatricos previos", "psicofarmacos previos", "psicofármacos previos"] }),
  definirCampo({ clave: "hospitalizaciones", etiqueta: "Hospitalizaciones previas", seccionId: "psiquiatria", seccionEtiqueta: "Psiquiatría", campoId: "hospitalizaciones", aliases: ["hospitalizaciones previas", "internamientos previos"] }),
  definirCampo({ clave: "riesgoPrevio", etiqueta: "Intentos suicidas o autolesiones", seccionId: "psiquiatria", seccionEtiqueta: "Psiquiatría", campoId: "riesgoPrevio", aliases: ["intentos suicidas", "autolesiones", "conducta suicida previa"] }),

  definirCampo({ clave: "sustancias", etiqueta: "Consumo de sustancias", seccionId: "sustancias", seccionEtiqueta: "Consumo de sustancias", tipoDestino: "sustancias", aliases: ["toxicomanias", "toxicomanías", "habitos toxicos", "hábitos tóxicos", "consumoSustancias"] }),
  definirCampo({ clave: "tabaco", etiqueta: "Tabaco", seccionId: "sustancias", seccionEtiqueta: "Consumo de sustancias", campoId: "tabaco", aliases: ["tabaquismo"] }),
  definirCampo({ clave: "alcohol", etiqueta: "Alcohol", seccionId: "sustancias", seccionEtiqueta: "Consumo de sustancias", campoId: "alcohol", aliases: ["consumo de alcohol"] }),
  definirCampo({ clave: "otrasSustancias", etiqueta: "Otras sustancias", seccionId: "sustancias", seccionEtiqueta: "Consumo de sustancias", campoId: "otrasSustancias", aliases: ["otras drogas", "otras sustancias"] }),

  definirCampo({ clave: "motivo", etiqueta: "Motivo de consulta o ingreso", seccionId: "padecimiento", seccionEtiqueta: "Padecimiento actual", campoId: "padecimientoActual", incluirEtiqueta: true, aliases: ["motivo de consulta", "motivo de ingreso", "motivoConsulta", "motivoIngreso"] }),
  definirCampo({ clave: "padecimientoActual", etiqueta: "Padecimiento actual", seccionId: "padecimiento", seccionEtiqueta: "Padecimiento actual", campoId: "padecimientoActual", aliases: ["enfermedad actual"] }),

  definirCampo({ clave: "exploracionMental", etiqueta: "Exploración mental", seccionId: "mental", seccionEtiqueta: "Exploración mental", campoId: "exploracionMental", aliases: ["examen mental", "exploracion mental"] }),
  definirCampo({ clave: "apariencia", etiqueta: "Apariencia y conducta", seccionId: "mental", seccionEtiqueta: "Exploración mental", campoId: "exploracionMental", incluirEtiqueta: true, aliases: ["apariencia y conducta"] }),
  definirCampo({ clave: "lenguaje", etiqueta: "Lenguaje", seccionId: "mental", seccionEtiqueta: "Exploración mental", campoId: "exploracionMental", incluirEtiqueta: true }),
  definirCampo({ clave: "afecto", etiqueta: "Estado de ánimo y afecto", seccionId: "mental", seccionEtiqueta: "Exploración mental", campoId: "exploracionMental", incluirEtiqueta: true, aliases: ["estado de animo", "estado de ánimo"] }),
  definirCampo({ clave: "pensamiento", etiqueta: "Pensamiento", seccionId: "mental", seccionEtiqueta: "Exploración mental", campoId: "exploracionMental", incluirEtiqueta: true }),
  definirCampo({ clave: "sensopercepcion", etiqueta: "Sensopercepción", seccionId: "mental", seccionEtiqueta: "Exploración mental", campoId: "exploracionMental", incluirEtiqueta: true, aliases: ["percepcion", "percepción"] }),
  definirCampo({ clave: "cognicion", etiqueta: "Funciones cognitivas", seccionId: "mental", seccionEtiqueta: "Exploración mental", campoId: "exploracionMental", incluirEtiqueta: true, aliases: ["cognición", "funciones cognitivas"] }),
  definirCampo({ clave: "juicio", etiqueta: "Juicio e insight", seccionId: "mental", seccionEtiqueta: "Exploración mental", campoId: "exploracionMental", incluirEtiqueta: true, aliases: ["juicio e insight", "insight"] }),

  definirCampo({ clave: "diagnosticoClinico", etiqueta: "Diagnóstico clínico", seccionId: "diagnostico", seccionEtiqueta: "Diagnóstico", campoId: "diagnosticoClinico", aliases: ["diagnostico", "diagnóstico", "diagnosticos", "diagnósticos", "impresion diagnostica", "impresión diagnóstica"] }),
  definirCampo({ clave: "codigoDiagnostico", etiqueta: "Código diagnóstico", seccionId: "diagnostico", seccionEtiqueta: "Diagnóstico", campoId: "codigoDiagnostico", aliases: ["cie10", "cie-10", "cie11", "cie-11", "dsm5", "dsm-5", "codigo diagnostico"] }),

  definirCampo({ clave: "tratamientoFarmacologico", etiqueta: "Tratamiento farmacológico", seccionId: "plan", seccionEtiqueta: "Plan terapéutico", campoId: "tratamientoFarmacologico", aliases: ["tratamiento", "manejo farmacologico", "manejo farmacológico"] }),
  definirCampo({ clave: "psicoterapia", etiqueta: "Psicoterapia o rehabilitación", seccionId: "plan", seccionEtiqueta: "Plan terapéutico", campoId: "psicoterapia", aliases: ["rehabilitacion", "rehabilitación"] }),
  definirCampo({ clave: "seguimiento", etiqueta: "Plan de seguimiento", seccionId: "plan", seccionEtiqueta: "Plan terapéutico", campoId: "seguimiento", aliases: ["plan de seguimiento"] }),
  definirCampo({ clave: "indicaciones", etiqueta: "Indicaciones", seccionId: "plan", seccionEtiqueta: "Plan terapéutico", campoId: "seguimiento", incluirEtiqueta: true, aliases: ["indicaciones medicas", "indicaciones médicas"] }),
  definirCampo({ clave: "plan", etiqueta: "Plan terapéutico", seccionId: "plan", seccionEtiqueta: "Plan terapéutico", campoId: "seguimiento", incluirEtiqueta: true, aliases: ["plan terapeutico", "plan terapéutico"] }),
  definirCampo({ clave: "pronostico", etiqueta: "Pronóstico", seccionId: "plan", seccionEtiqueta: "Plan terapéutico", campoId: "seguimiento", incluirEtiqueta: true, aliases: ["pronóstico"] }),

  definirCampo({ clave: "exploracionFisica", etiqueta: "Exploración física", seccionId: null, seccionEtiqueta: "Sin apartado compatible", tipoDestino: "manual", aliases: ["exploracion fisica", "exploración física"] }),
  definirCampo({ clave: "exploracionNeurologica", etiqueta: "Exploración neurológica", seccionId: null, seccionEtiqueta: "Sin apartado compatible", tipoDestino: "manual", aliases: ["exploracion neurologica", "exploración neurológica"] }),
  definirCampo({ clave: "observaciones", etiqueta: "Observaciones clínicas", seccionId: null, seccionEtiqueta: "Sin apartado compatible", tipoDestino: "manual", aliases: ["comentario clinico", "comentario clínico"] })
]);

const texto = (valor) => String(valor ?? "").replace(/\s+/g, " ").trim();
const normalizar = (valor) => texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const normalizarClave = (valor) => normalizar(valor).replace(/[^a-z0-9]+/g, "");
const limpiarValor = (valor) => String(valor ?? "")
  .replace(/\r\n?/g, "\n")
  .split("\n")
  .map((linea) => linea.replace(/[\t ]+/g, " ").trim())
  .filter(Boolean)
  .join("\n")
  .trim();
const escaparRegExp = (valor) => String(valor).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hash = (valor) => {
  let salida = 2166136261;
  for (const caracter of String(valor)) {
    salida ^= caracter.charCodeAt(0);
    salida = Math.imul(salida, 16777619);
  }
  return (salida >>> 0).toString(36);
};

const definicionesPorAlias = new Map();
HISTORIA_CAMPOS_DETECTABLES.forEach((definicion) => {
  definicion.aliases.forEach((alias) => definicionesPorAlias.set(normalizarClave(alias), definicion));
});

const aliasesEncabezado = [...definicionesPorAlias.entries()]
  .filter(([alias]) => alias.length > 1)
  .map(([, definicion]) => definicion.aliases)
  .flat()
  .filter((alias, indice, lista) => lista.findIndex((item) => normalizar(item) === normalizar(alias)) === indice)
  .sort((a, b) => b.length - a.length);

function separarBloques(textoFuente = "") {
  if (!texto(textoFuente)) return [];
  const encabezados = aliasesEncabezado.map(escaparRegExp).join("|");
  const expresion = new RegExp(`(?:^|\\n)\\s*(${encabezados})\\s*[:\\-]?\\s*`, "giu");
  const encontrados = [];
  let coincidencia;
  while ((coincidencia = expresion.exec(String(textoFuente)))) {
    encontrados.push({ alias: coincidencia[1], indice: coincidencia.index, inicio: coincidencia.index + coincidencia[0].length });
  }
  return encontrados
    .map((actual, indice) => ({
      definicion: definicionesPorAlias.get(normalizarClave(actual.alias)),
      valor: String(textoFuente).slice(actual.inicio, encontrados[indice + 1]?.indice || String(textoFuente).length).trim()
    }))
    .filter((bloque) => bloque.definicion && texto(bloque.valor));
}

function definicionDesdeRuta(ruta = "") {
  const partes = String(ruta).split(".").filter(Boolean);
  if (!partes.length || partes.length > 2) return null;
  return definicionesPorAlias.get(normalizarClave(partes.at(-1))) || null;
}

function fuenteSegura(fuente = {}) {
  return {
    tipo: texto(fuente.tipo) || "otro",
    id: texto(fuente.id),
    fecha: texto(fuente.fecha)
  };
}

export function crearDeteccionHistoria({ definicion, valor, fuentes = [], metodo = "structured_field", confianza = 1 } = {}) {
  const valorSeguro = limpiarValor(valor).slice(0, 12000);
  if (!definicion || !valorSeguro) return null;
  const fuentesSeguras = fuentes.map(fuenteSegura).filter((fuente) => fuente.tipo || fuente.id || fuente.fecha);
  return {
    id: `historia-detectado-${hash(`${definicion.clave}|${normalizar(valorSeguro)}`)}`,
    clave: definicion.clave,
    etiqueta: definicion.etiqueta,
    valor: valorSeguro,
    confianzaExtraccion: Math.max(0, Math.min(1, Number(confianza) || 0)),
    metodo,
    extractorVersion: EXTRACTOR_VERSION,
    fuentes: fuentesSeguras,
    destino: {
      tipo: definicion.tipoDestino,
      seccionId: definicion.seccionId,
      seccionEtiqueta: definicion.seccionEtiqueta,
      campoId: definicion.campoId,
      incluirEtiqueta: definicion.incluirEtiqueta
    }
  };
}

function combinarDetecciones(detecciones = []) {
  const unicas = new Map();
  detecciones.filter(Boolean).forEach((deteccion) => {
    const llave = `${deteccion.clave}|${normalizar(deteccion.valor)}`;
    const existente = unicas.get(llave);
    if (!existente) {
      unicas.set(llave, { ...deteccion, fuentes: [...deteccion.fuentes] });
      return;
    }
    deteccion.fuentes.forEach((fuente) => {
      const repetida = existente.fuentes.some((actual) => actual.tipo === fuente.tipo && actual.id === fuente.id && actual.fecha === fuente.fecha);
      if (!repetida) existente.fuentes.push(fuente);
    });
    existente.confianzaExtraccion = Math.max(existente.confianzaExtraccion, deteccion.confianzaExtraccion);
  });
  return [...unicas.values()];
}

export function detectarDatosHistoria(fuentes = []) {
  const detecciones = [];
  fuentes.forEach((fuente) => {
    if (!fuente || fuente.detectable === false || fuente.tipo === "historia_clinica") return;
    separarBloques(fuente.textoDeteccion ?? fuente.texto).forEach(({ definicion, valor }) => {
      detecciones.push(crearDeteccionHistoria({ definicion, valor, fuentes: [fuente], metodo: "section_heading", confianza: 0.96 }));
    });
    (Array.isArray(fuente.campos) ? fuente.campos : []).forEach((campo) => {
      const definicion = definicionDesdeRuta(campo.ruta);
      if (!definicion || !texto(campo.texto)) return;
      detecciones.push(crearDeteccionHistoria({ definicion, valor: campo.texto, fuentes: [fuente], metodo: "structured_field", confianza: 1 }));
    });
  });
  return combinarDetecciones(detecciones);
}

export function obtenerDefinicionHistoria(clave = "") {
  return HISTORIA_CAMPOS_DETECTABLES.find((definicion) => definicion.clave === clave) || null;
}

export function valorDeteccionParaDestino(deteccion = {}) {
  const valor = texto(deteccion.valor);
  if (!valor) return "";
  return deteccion.destino?.incluirEtiqueta ? `${deteccion.etiqueta}: ${valor}` : valor;
}

export function construirDatosAutomaticos(detecciones = []) {
  const porCampo = new Map();
  detecciones.forEach((deteccion) => {
    if (deteccion.destino?.tipo !== "campo" || !deteccion.destino.campoId) return;
    const valor = valorDeteccionParaDestino(deteccion);
    const valores = porCampo.get(deteccion.destino.campoId) || [];
    if (!valores.some((existente) => normalizar(existente) === normalizar(valor))) valores.push(valor);
    porCampo.set(deteccion.destino.campoId, valores);
  });
  return Object.fromEntries([...porCampo.entries()].map(([campoId, valores]) => [campoId, valores.join("\n\n").slice(0, 12000)]));
}

export function contieneDeteccion(valorActual = "", deteccion = {}) {
  const actual = normalizar(valorActual);
  const candidato = normalizar(deteccion.valor);
  return Boolean(actual && candidato && (actual.includes(candidato) || actual.includes(normalizar(valorDeteccionParaDestino(deteccion)))));
}
