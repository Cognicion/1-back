const FUENTE_NIDDK_RENAL = "NIDDK: Chronic Kidney Disease Tests & Diagnosis, https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/tests-diagnosis";
const FUENTE_KDIGO_RENAL = "KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD, https://kdigo.org/guidelines/ckd-evaluation-and-management/";
const FUENTE_MEDLINE_PROTEINAS = "MedlinePlus: Total Protein and Albumin/Globulin (A/G) Ratio, https://medlineplus.gov/lab-tests/total-protein-and-albumin-globulin-a-g-ratio/";
const FUENTE_MEDLINE_PANEL_METABOLICO = "MedlinePlus: Comprehensive metabolic panel, https://medlineplus.gov/ency/article/003468.htm";
const FUENTE_MAYO_ELECTROLITOS = "Mayo Clinic Laboratories: Electrolyte Panel, Serum, https://www.mayocliniclabs.com/test-catalog/overview/113632";
const FUENTE_MAYO_MAGNESIO = "Mayo Clinic Laboratories: Magnesium, Serum, https://www.mayocliniclabs.com/test-catalog/overview/8448";
const FUENTE_MAYO_RENAL = "Mayo Clinic Laboratories: Creatinine with Estimated Glomerular Filtration Rate, Serum, https://www.mayocliniclabs.com/test-catalog/overview/48216";

export const VERSION_PARAMETROS_CLINICOS = "1.1.0";

export const GRUPOS_PARAMETROS_CLINICOS = Object.freeze([
  Object.freeze({
    id: "funcionRenal",
    etiqueta: "Creatinina y función renal",
    descripcion: "La eGFR es una estimación y debe interpretarse con tendencia, edad, contexto clínico y albuminuria."
  }),
  Object.freeze({
    id: "electrolitos",
    etiqueta: "Hidratación y electrolitos",
    descripcion: "Usa el intervalo de referencia del laboratorio que procesó la muestra."
  }),
  Object.freeze({
    id: "proteinasSericas",
    etiqueta: "Proteínas séricas",
    descripcion: "Albúmina sérica y albuminuria urinaria son mediciones diferentes y no se intercambian."
  })
]);

export const DEFINICIONES_PARAMETROS_CLINICOS = Object.freeze([
  Object.freeze({
    id: "creatinina",
    grupo: "funcionRenal",
    etiqueta: "Creatinina sérica",
    unidad: "mg/dL",
    muestra: "suero/plasma",
    unidades: ["mg/dL", "µmol/L"],
    step: "0.01",
    aliases: ["creatinina", "creatinina serica", "serum creatinine"],
    rutas: ["creatinina", "funcionRenal.creatinina", "laboratorio.creatinina", "parametrosClinicos.creatinina", "parametrosClinicos.valores.creatinina", "parametrosClinicos.funcionRenal.creatinina"],
    fuente: FUENTE_NIDDK_RENAL,
    referenciasPredeterminadas: {
      "mg/dL": { predeterminado: "0.6–1.3", masculino: "0.74–1.35", femenino: "0.59–1.04" },
      "µmol/L": { predeterminado: "53–115", masculino: "65–119", femenino: "52–92" }
    },
    fuenteReferenciaPredeterminada: FUENTE_MAYO_RENAL
  }),
  Object.freeze({
    id: "eGFR",
    grupo: "funcionRenal",
    etiqueta: "Función renal / eGFR",
    unidad: "mL/min/1.73 m²",
    muestra: "estimación a partir de sangre",
    unidades: ["mL/min/1.73 m²"],
    step: "1",
    aliases: ["egfr", "tfg", "filtrado glomerular", "tasa de filtrado glomerular"],
    rutas: ["eGFR", "egfr", "tfg", "funcionRenal.eGFR", "funcionRenal.egfr", "laboratorio.eGFR", "laboratorio.egfr", "laboratorio.tfg", "parametrosClinicos.eGFR", "parametrosClinicos.egfr", "parametrosClinicos.valores.eGFR", "parametrosClinicos.valores.egfr", "parametrosClinicos.funcionRenal.eGFR", "parametrosClinicos.funcionRenal.egfr"],
    fuente: FUENTE_KDIGO_RENAL,
    referenciasPredeterminadas: { "mL/min/1.73 m²": { predeterminado: "≥60" } },
    fuenteReferenciaPredeterminada: FUENTE_MAYO_RENAL,
    notaReferenciaPredeterminada: "Umbral adulto de reporte; la categoría KDIGO y el contexto clínico siguen siendo necesarios."
  }),
  Object.freeze({
    id: "uacr",
    grupo: "funcionRenal",
    etiqueta: "Relación albúmina/creatinina urinaria (UACR)",
    unidad: "mg/g",
    muestra: "orina",
    unidades: ["mg/g", "mg/mmol"],
    step: "0.1",
    aliases: ["uacr", "acr urinaria", "relacion albumina creatinina urinaria", "cociente albumina creatinina urinaria"],
    rutas: ["uacr", "albuminuria.uacr", "funcionRenal.uacr", "laboratorio.uacr", "parametrosClinicos.uacr", "parametrosClinicos.valores.uacr", "parametrosClinicos.funcionRenal.uacr"],
    fuente: FUENTE_KDIGO_RENAL,
    referenciasPredeterminadas: {
      "mg/g": { predeterminado: "<30" },
      "mg/mmol": { predeterminado: "<3" }
    },
    fuenteReferenciaPredeterminada: FUENTE_KDIGO_RENAL,
    notaReferenciaPredeterminada: "Umbral KDIGO A1; la confirmación requiere tendencia y contexto clínico."
  }),
  Object.freeze({
    id: "sodio",
    grupo: "electrolitos",
    etiqueta: "Sodio",
    unidad: "mmol/L",
    muestra: "suero/plasma",
    unidades: ["mmol/L", "mEq/L"],
    step: "0.1",
    aliases: ["sodio", "na", "na+"],
    rutas: ["sodio", "electrolitos.sodio", "laboratorio.sodio", "parametrosClinicos.sodio", "parametrosClinicos.valores.sodio", "parametrosClinicos.electrolitos.sodio"],
    referenciasPredeterminadas: {
      "mmol/L": { predeterminado: "135–145" },
      "mEq/L": { predeterminado: "135–145" }
    },
    fuenteReferenciaPredeterminada: FUENTE_MAYO_ELECTROLITOS
  }),
  Object.freeze({
    id: "potasio",
    grupo: "electrolitos",
    etiqueta: "Potasio",
    unidad: "mmol/L",
    muestra: "suero/plasma",
    unidades: ["mmol/L", "mEq/L"],
    step: "0.1",
    aliases: ["potasio", "k", "k+"],
    rutas: ["potasio", "electrolitos.potasio", "laboratorio.potasio", "parametrosClinicos.potasio", "parametrosClinicos.valores.potasio", "parametrosClinicos.electrolitos.potasio"],
    referenciasPredeterminadas: {
      "mmol/L": { predeterminado: "3.6–5.2" },
      "mEq/L": { predeterminado: "3.6–5.2" }
    },
    fuenteReferenciaPredeterminada: FUENTE_MAYO_ELECTROLITOS
  }),
  Object.freeze({
    id: "cloro",
    grupo: "electrolitos",
    etiqueta: "Cloro",
    unidad: "mmol/L",
    muestra: "suero/plasma",
    unidades: ["mmol/L", "mEq/L"],
    step: "0.1",
    aliases: ["cloro", "cloruro", "chloride", "cl"],
    rutas: ["cloro", "cloruro", "electrolitos.cloro", "electrolitos.cloruro", "laboratorio.cloro", "parametrosClinicos.valores.cloro", "parametrosClinicos.electrolitos.cloro"],
    referenciasPredeterminadas: {
      "mmol/L": { predeterminado: "98–107" },
      "mEq/L": { predeterminado: "98–107" }
    },
    fuenteReferenciaPredeterminada: FUENTE_MAYO_ELECTROLITOS
  }),
  Object.freeze({
    id: "bicarbonato",
    grupo: "electrolitos",
    etiqueta: "Bicarbonato / CO₂ total",
    unidad: "mmol/L",
    muestra: "suero/plasma",
    unidades: ["mmol/L", "mEq/L"],
    step: "0.1",
    aliases: ["bicarbonato", "co2 total", "hco3", "hco3-"],
    rutas: ["bicarbonato", "co2Total", "electrolitos.bicarbonato", "laboratorio.bicarbonato", "parametrosClinicos.valores.bicarbonato", "parametrosClinicos.electrolitos.bicarbonato"],
    referenciasPredeterminadas: {
      "mmol/L": { predeterminado: "22–29" },
      "mEq/L": { predeterminado: "22–29" }
    },
    fuenteReferenciaPredeterminada: FUENTE_MAYO_ELECTROLITOS
  }),
  Object.freeze({
    id: "magnesio",
    grupo: "electrolitos",
    etiqueta: "Magnesio",
    unidad: "mg/dL",
    muestra: "suero/plasma",
    unidades: ["mg/dL", "mmol/L"],
    step: "0.01",
    aliases: ["magnesio", "magnesium", "mg++"],
    rutas: ["magnesio", "electrolitos.magnesio", "laboratorio.magnesio", "parametrosClinicos.valores.magnesio", "parametrosClinicos.electrolitos.magnesio"],
    referenciasPredeterminadas: {
      "mg/dL": { predeterminado: "1.7–2.3" },
      "mmol/L": { predeterminado: "0.70–0.95" }
    },
    fuenteReferenciaPredeterminada: FUENTE_MAYO_MAGNESIO,
    notaReferenciaPredeterminada: "El intervalo en mmol/L es la conversión del intervalo de mg/dL; confirmar siempre con el informe local."
  }),
  Object.freeze({
    id: "calcio",
    grupo: "electrolitos",
    etiqueta: "Calcio total",
    unidad: "mg/dL",
    muestra: "suero/plasma",
    unidades: ["mg/dL", "mmol/L"],
    step: "0.01",
    aliases: ["calcio", "calcio total", "calcium", "ca++"],
    rutas: ["calcio", "electrolitos.calcio", "laboratorio.calcio", "parametrosClinicos.valores.calcio", "parametrosClinicos.electrolitos.calcio"],
    referenciasPredeterminadas: {
      "mg/dL": { predeterminado: "8.5–10.2" },
      "mmol/L": { predeterminado: "2.13–2.55" }
    },
    fuenteReferenciaPredeterminada: FUENTE_MEDLINE_PANEL_METABOLICO
  }),
  Object.freeze({
    id: "proteinasTotales",
    grupo: "proteinasSericas",
    etiqueta: "Proteínas séricas totales",
    unidad: "g/dL",
    muestra: "suero",
    unidades: ["g/dL", "g/L"],
    step: "0.01",
    aliases: ["proteinas sericas", "proteinas totales", "proteina total", "total protein", "serum total protein"],
    rutas: ["proteinasSericas", "proteinasTotales", "laboratorio.proteinasTotales", "parametrosClinicos.proteinasTotales", "parametrosClinicos.valores.proteinasTotales", "parametrosClinicos.proteinasSericas.proteinasTotales"],
    fuente: FUENTE_MEDLINE_PROTEINAS,
    referenciasPredeterminadas: {
      "g/dL": { predeterminado: "6.0–8.3" },
      "g/L": { predeterminado: "60–83" }
    },
    fuenteReferenciaPredeterminada: FUENTE_MEDLINE_PANEL_METABOLICO
  }),
  Object.freeze({
    id: "albumina",
    grupo: "proteinasSericas",
    etiqueta: "Albúmina sérica",
    unidad: "g/dL",
    muestra: "suero",
    unidades: ["g/dL", "g/L"],
    step: "0.01",
    aliases: ["albumina", "albumina serica", "serum albumin"],
    rutas: ["albumina", "albuminaSerica", "laboratorio.albumina", "parametrosClinicos.albumina", "parametrosClinicos.valores.albumina", "parametrosClinicos.proteinasSericas.albumina"],
    fuente: FUENTE_MEDLINE_PROTEINAS,
    referenciasPredeterminadas: {
      "g/dL": { predeterminado: "3.4–5.4" },
      "g/L": { predeterminado: "34–54" }
    },
    fuenteReferenciaPredeterminada: FUENTE_MEDLINE_PANEL_METABOLICO
  }),
  Object.freeze({
    id: "globulinas",
    grupo: "proteinasSericas",
    etiqueta: "Globulinas séricas",
    unidad: "g/dL",
    muestra: "suero",
    unidades: ["g/dL", "g/L"],
    step: "0.01",
    aliases: ["globulina", "globulinas", "globulinas sericas", "serum globulin"],
    rutas: ["globulinas", "globulina", "laboratorio.globulinas", "parametrosClinicos.globulinas", "parametrosClinicos.valores.globulinas", "parametrosClinicos.proteinasSericas.globulinas"],
    fuente: FUENTE_MEDLINE_PROTEINAS,
    fuenteReferenciaPredeterminada: FUENTE_MEDLINE_PROTEINAS,
    notaReferenciaPredeterminada: "No se carga un intervalo estándar: las globulinas dependen del método y de las fracciones medidas; usa el intervalo del laboratorio."
  })
]);

function normalizarSexoReferencia(valor = "") {
  const texto = String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (["masculino", "hombre", "male", "m"].includes(texto)) return "masculino";
  if (["femenino", "mujer", "female", "f"].includes(texto)) return "femenino";
  return "";
}

export function obtenerReferenciaPredeterminadaParametro(definicionOId, { unidad = "", sexo = "" } = {}) {
  const definicion = typeof definicionOId === "string"
    ? DEFINICIONES_PARAMETROS_CLINICOS.find((item) => item.id === definicionOId)
    : definicionOId;
  if (!definicion) return { rangoReferencia: "", fuente: "", nota: "Parámetro no reconocido." };

  const referencias = definicion.referenciasPredeterminadas || {};
  const referenciaUnidad = referencias[unidad] || referencias[definicion.unidad] || null;
  const sexoNormalizado = normalizarSexoReferencia(sexo);
  const rangoReferencia = referenciaUnidad?.[sexoNormalizado] || referenciaUnidad?.predeterminado || "";
  return {
    rangoReferencia,
    fuente: definicion.fuenteReferenciaPredeterminada || "Fuente pendiente para intervalo predeterminado",
    nota: definicion.notaReferenciaPredeterminada || "Referencia orientativa para adultos; reemplázala por el intervalo del laboratorio que procesó la muestra.",
    esPredeterminado: Boolean(rangoReferencia)
  };
}

function textoNormalizado(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numeroSeguro(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;
  const numero = Number(String(valor).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numero) ? numero : null;
}

function normalizarUnidadBusqueda(valor = "") {
  return String(valor || "")
    .toLowerCase()
    .replace(/[µμ]/g, "u")
    .replace(/m\^?2|m²/g, "m2")
    .replace(/,/g, ".")
    .replace(/\s+/g, "");
}

function contieneUnidadCompleta(texto, unidad) {
  const fuente = normalizarUnidadBusqueda(texto);
  const buscada = normalizarUnidadBusqueda(unidad);
  if (!fuente || !buscada) return false;
  let indice = fuente.indexOf(buscada);
  while (indice >= 0) {
    const anterior = indice > 0 ? fuente[indice - 1] : "";
    const siguiente = fuente[indice + buscada.length] || "";
    if (!/[a-z]/.test(anterior) && !/[a-z]/.test(siguiente)) return true;
    indice = fuente.indexOf(buscada, indice + 1);
  }
  return false;
}

function unidadDesdeValorTexto(valor, definicion) {
  if (typeof valor !== "string") return "";
  return [...(definicion.unidades || [])]
    .sort((a, b) => normalizarUnidadBusqueda(b).length - normalizarUnidadBusqueda(a).length)
    .find((unidad) => contieneUnidadCompleta(valor, unidad)) || "";
}

function sufijoUnidadNoReconocida(valor) {
  if (typeof valor !== "string") return "";
  const coincidencia = valor.trim().match(/^[<>≤≥]?\s*[+-]?\d+(?:[.,]\d+)?\s*(.+)$/);
  if (!coincidencia || !/[a-zµμ/]/i.test(coincidencia[1])) return "";
  return coincidencia[1].split(/[;(]/)[0].trim();
}

function leerRuta(objeto, ruta = "") {
  return ruta.split(".").reduce((actual, parte) => actual?.[parte], objeto);
}

function fechaComparable(valor) {
  if (!valor) return "";
  if (typeof valor?.toDate === "function") return valor.toDate().toISOString();
  if (typeof valor?.toMillis === "function") return new Date(valor.toMillis()).toISOString();
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? String(valor) : fecha.toISOString();
}

export function parsearRangoReferencia(valor = "") {
  if (valor && typeof valor === "object") {
    const minimo = numeroSeguro(valor.minimo ?? valor.minimum ?? valor.limiteInferior ?? valor.low);
    const maximo = numeroSeguro(valor.maximo ?? valor.maximum ?? valor.limiteSuperior ?? valor.high);
    if (minimo !== null || maximo !== null) return { minimo, maximo };
  }
  const texto = String(valor || "").trim();
  const intervalo = texto.match(/(-?\d+(?:[.,]\d+)?)\s*(?:-|–|—|a)\s*(-?\d+(?:[.,]\d+)?)/i);
  if (intervalo) {
    const minimo = numeroSeguro(intervalo[1]);
    const maximo = numeroSeguro(intervalo[2]);
    if (minimo !== null && maximo !== null && minimo <= maximo) return { minimo, maximo };
  }
  const menor = texto.match(/^\s*[<≤]\s*(-?\d+(?:[.,]\d+)?)/);
  if (menor) return { minimo: null, maximo: numeroSeguro(menor[1]) };
  const mayor = texto.match(/^\s*[>≥]\s*(-?\d+(?:[.,]\d+)?)/);
  if (mayor) return { minimo: numeroSeguro(mayor[1]), maximo: null };
  return null;
}

function estadoParametro(registro = {}) {
  const explicito = textoNormalizado(registro.estado || registro.status || registro.interpretacion || registro.bandera || "");
  if (/\b(?:bajo|low|disminuid|hipo)\b/.test(explicito)) return "bajo";
  if (/\b(?:alto|high|elevad|hiper)\b/.test(explicito)) return "alto";
  if (/\b(?:normal|en rango|dentro de rango)\b/.test(explicito)) return "en_rango_registrado";
  const rango = parsearRangoReferencia(
    registro.rangoReferencia
      || registro.referenceRange
      || registro.rango
      || registro.valoresReferencia
      || {
        minimo: registro.limiteInferior ?? registro.minimo,
        maximo: registro.limiteSuperior ?? registro.maximo
      }
  );
  const valor = numeroSeguro(registro.valor ?? registro.value ?? registro.resultado);
  if (!rango || valor === null) return "no_clasificado";
  if (rango.minimo !== null && valor < rango.minimo) return "bajo";
  if (rango.maximo !== null && valor > rango.maximo) return "alto";
  return "en_rango_registrado";
}

function definicionPorNombre(nombre = "") {
  const texto = textoNormalizado(nombre);
  if (!texto) return null;
  return DEFINICIONES_PARAMETROS_CLINICOS.find((definicion) =>
    [definicion.id, definicion.etiqueta, ...(definicion.aliases || [])]
      .some((alias) => texto === textoNormalizado(alias))
  ) || null;
}

function registroNormalizado(definicion, entrada, origen = "expediente") {
  if (entrada === null || entrada === undefined || entrada === "") return null;
  const objeto = entrada && typeof entrada === "object" && !Array.isArray(entrada)
    ? entrada
    : { valor: entrada };
  const valorOriginal = objeto.valor ?? objeto.value ?? objeto.resultadoLaboratorio ?? objeto.valorLaboratorio ?? objeto.resultado ?? objeto.result;
  const valor = numeroSeguro(valorOriginal);
  if (valor === null) return null;
  const rangoEntrada = objeto.rangoReferencia || objeto.referenceRange || objeto.rango || objeto.valoresReferencia || "";
  const rangoParseado = parsearRangoReferencia(rangoEntrada || {
    minimo: objeto.limiteInferior ?? objeto.minimo,
    maximo: objeto.limiteSuperior ?? objeto.maximo
  });
  const rangoReferencia = typeof rangoEntrada === "object"
    ? [rangoParseado?.minimo, rangoParseado?.maximo].filter((valorRango) => valorRango !== null && valorRango !== undefined).join(" – ")
    : String(rangoEntrada || "").trim();
  const unidadDeclarada = String(objeto.unidad || objeto.unit || "").trim();
  const unidadEnTexto = unidadDesdeValorTexto(valorOriginal, definicion);
  const unidadNoReconocida = unidadDeclarada || unidadEnTexto ? "" : sufijoUnidadNoReconocida(valorOriginal);
  const unidad = unidadDeclarada || unidadEnTexto || unidadNoReconocida || definicion.unidad || "";
  return {
    id: definicion.id,
    analyteId: definicion.id,
    analito: definicion.etiqueta,
    grupo: definicion.grupo,
    etiqueta: definicion.etiqueta,
    valor,
    valorOriginal: String(valorOriginal),
    unidad,
    rangoReferencia,
    origenRangoReferencia: String(objeto.origenRangoReferencia || objeto.rangeReferenceOrigin || "").trim(),
    fuenteRangoReferencia: String(objeto.fuenteRangoReferencia || objeto.referenceRangeSource || "").trim(),
    limiteInferior: rangoParseado?.minimo ?? numeroSeguro(objeto.limiteInferior ?? objeto.minimo),
    limiteSuperior: rangoParseado?.maximo ?? numeroSeguro(objeto.limiteSuperior ?? objeto.maximo),
    estado: estadoParametro({ ...objeto, valor, rangoReferencia: rangoEntrada }),
    fecha: fechaComparable(objeto.fecha || objeto.measuredAt || objeto.fechaResultado || objeto.updatedAt || objeto.fechaActualizacion),
    origen: String(objeto.origen || objeto.source || origen),
    procedencia: String(objeto.procedencia || objeto.sourceSystem || objeto.sistemaOrigen || objeto.origen || origen),
    muestra: String(objeto.muestra || objeto.specimen || definicion.muestra || ""),
    identificadorMuestra: String(objeto.identificadorMuestra || objeto.specimenId || objeto.idMuestra || objeto.panelId || objeto.idPanel || ""),
    metodo: String(objeto.metodo || objeto.method || ""),
    formula: String(objeto.formula || objeto.equation || ""),
    versionFormula: String(objeto.versionFormula || objeto.equationVersion || ""),
    estadoResultado: String(objeto.estadoResultado || objeto.resultStatus || "final"),
    derivado: Boolean(objeto.derivado),
    fuente: definicion.fuente || "Intervalo de referencia aportado por el laboratorio"
  };
}

function registrosEstructuradosPaciente(paciente = {}) {
  const fuentes = [
    paciente.laboratorios,
    paciente.estudios,
    paciente.resultadosLaboratorio,
    paciente.parametrosClinicos?.registros
  ];
  const salida = [];
  const agregar = (item, origen) => {
    if (!item) return;
    if (Array.isArray(item)) {
      item.forEach((subitem) => agregar(subitem, origen));
      return;
    }
    if (typeof item !== "object") return;
    [item.analitos, item.resultados, item.parametros, item.mediciones].forEach((coleccion) => {
      if (Array.isArray(coleccion)) agregar(coleccion, origen);
      else if (coleccion && typeof coleccion === "object") {
        Object.entries(coleccion).forEach(([nombre, valor]) => agregar(
          valor && typeof valor === "object" ? { analito: nombre, ...valor } : { analito: nombre, valor },
          origen
        ));
      }
    });
    const nombre = item.analito || item.analyte || item.nombreAnalito || item.parametro || item.nombre || item.name;
    const definicion = definicionPorNombre(nombre);
    if (!definicion) return;
    const registro = registroNormalizado(definicion, item, origen);
    if (registro) salida.push(registro);
  };
  fuentes.forEach((fuente, index) => agregar(fuente, `laboratorio_estructurado_${index + 1}`));
  return salida;
}

function valorCanonicoProteina(registro) {
  if (!registro) return null;
  const unidad = textoNormalizado(registro.unidad).replace(/\s/g, "");
  if (unidad === "g l" || unidad === "gl") return registro.valor / 10;
  if (unidad === "g dl" || unidad === "gdl" || !unidad) return registro.valor;
  return null;
}

function valorCanonicoCreatinina(registro) {
  if (!registro) return null;
  const unidad = normalizarUnidadBusqueda(registro.unidad);
  if (unidad === "umol/l") return registro.valor / 88.4;
  if (unidad === "mmol/l") return (registro.valor * 1000) / 88.4;
  if (unidad === "mg/dl") return registro.valor;
  return null;
}

function unidadEgfrCompatible(registro) {
  if (!registro) return false;
  const unidad = textoNormalizado(registro.unidad).replace(/\s/g, "");
  return /ml.*min/.test(unidad) && /1[.,]?73/.test(unidad);
}

function fechaMuestra(registro) {
  return String(registro?.fecha || "").slice(0, 10);
}

function medicionesProteicasCompatibles(registros = []) {
  const presentes = registros.filter(Boolean);
  if (presentes.length <= 1) return true;
  const fechas = [...new Set(presentes.map(fechaMuestra).filter(Boolean))];
  if (fechas.length !== 1 || presentes.some((registro) => !fechaMuestra(registro))) return false;
  const muestras = [...new Set(presentes.map((registro) => textoNormalizado(registro.muestra)).filter(Boolean))];
  if (muestras.length > 1) return false;
  const identificadores = presentes.map((registro) => String(registro.identificadorMuestra || "").trim());
  if (identificadores.some(Boolean) && (identificadores.some((id) => !id) || new Set(identificadores).size > 1)) return false;
  return true;
}

export function categoriaEgfr(valor) {
  const numero = numeroSeguro(valor);
  if (numero === null || numero < 0) return null;
  if (numero >= 90) return { id: "G1", etiqueta: "normal o alta", severidad: "informativa" };
  if (numero >= 60) return { id: "G2", etiqueta: "ligeramente disminuida", severidad: "informativa" };
  if (numero >= 45) return { id: "G3a", etiqueta: "ligera a moderadamente disminuida", severidad: "moderada" };
  if (numero >= 30) return { id: "G3b", etiqueta: "moderada a gravemente disminuida", severidad: "moderada" };
  if (numero >= 15) return { id: "G4", etiqueta: "gravemente disminuida", severidad: "alta" };
  return { id: "G5", etiqueta: "falla renal", severidad: "alta" };
}

export function categoriaUacr(valor, unidad = "mg/g") {
  const numero = numeroSeguro(valor);
  if (numero === null || numero < 0) return null;
  const unidadNormalizada = textoNormalizado(unidad).replace(/\s/g, "");
  const esMmol = /mg.*mmol/.test(unidadNormalizada);
  const esMgG = /mg.*g/.test(unidadNormalizada) && !esMmol;
  if (!esMmol && !esMgG) return null;
  const limiteA2 = esMmol ? 3 : 30;
  const limiteA3 = esMmol ? 30 : 300;
  if (numero < limiteA2) return { id: "A1", etiqueta: "normal a ligeramente aumentada", severidad: "informativa" };
  if (numero <= limiteA3) return { id: "A2", etiqueta: "moderadamente aumentada", severidad: "moderada" };
  return { id: "A3", etiqueta: "gravemente aumentada", severidad: "alta" };
}

export function resolverParametrosClinicosPaciente(paciente = {}) {
  const porId = {};
  registrosEstructuradosPaciente(paciente).forEach((registro) => {
    const previo = porId[registro.id];
    if (!previo || String(registro.fecha || "").localeCompare(String(previo.fecha || "")) >= 0) porId[registro.id] = registro;
  });

  DEFINICIONES_PARAMETROS_CLINICOS.forEach((definicion) => {
    const rutasCanonicas = (definicion.rutas || []).filter((ruta) => ruta.startsWith("parametrosClinicos."));
    const rutasLegacy = (definicion.rutas || []).filter((ruta) => !ruta.startsWith("parametrosClinicos."));
    const buscarPrimero = (rutas) => {
      for (const ruta of rutas) {
        const registro = registroNormalizado(definicion, leerRuta(paciente, ruta), `campo:${ruta}`);
        if (registro) return registro;
      }
      return null;
    };
    // El bloque versionado de parámetros es la fuente canónica. Los registros
    // estructurados son la segunda opción y los aliases raíz quedan como fallback.
    const canonico = buscarPrimero(rutasCanonicas);
    if (canonico) porId[definicion.id] = canonico;
    else if (!porId[definicion.id]) {
      const legacy = buscarPrimero(rutasLegacy);
      if (legacy) porId[definicion.id] = legacy;
    }
  });

  const total = valorCanonicoProteina(porId.proteinasTotales);
  const albumina = valorCanonicoProteina(porId.albumina);
  const globulinas = valorCanonicoProteina(porId.globulinas);
  const proteinasComparables = medicionesProteicasCompatibles([
    porId.proteinasTotales,
    porId.albumina,
    porId.globulinas
  ]);
  const derivados = {};
  if (proteinasComparables && globulinas === null && total !== null && albumina !== null && total >= albumina) {
    derivados.globulinasCalculadas = {
      id: "globulinasCalculadas",
      etiqueta: "Globulinas calculadas",
      valor: Number((total - albumina).toFixed(2)),
      unidad: "g/dL",
      formula: "proteínas totales − albúmina",
      derivado: true
    };
  }
  const globulinasParaRelacion = globulinas ?? derivados.globulinasCalculadas?.valor ?? null;
  if (proteinasComparables && albumina !== null && globulinasParaRelacion !== null && globulinasParaRelacion > 0) {
    derivados.relacionAlbuminaGlobulina = {
      id: "relacionAlbuminaGlobulina",
      etiqueta: "Relación albúmina/globulinas (A/G)",
      valor: Number((albumina / globulinasParaRelacion).toFixed(2)),
      unidad: "",
      formula: "albúmina ÷ globulinas",
      derivado: true
    };
  }

  const egfr = unidadEgfrCompatible(porId.eGFR) ? categoriaEgfr(porId.eGFR.valor) : null;
  const uacr = porId.uacr ? categoriaUacr(porId.uacr.valor, porId.uacr.unidad) : null;
  const hallazgos = Object.values(porId)
    .filter((registro) => registro.estado === "bajo" || registro.estado === "alto")
    .map((registro) => ({
      id: `parametro_fuera_rango:${registro.id}`,
      parametroId: registro.id,
      titulo: `${registro.etiqueta} ${registro.estado === "bajo" ? "por debajo" : "por encima"} del intervalo registrado`,
      estado: registro.estado,
      valor: registro.valor,
      unidad: registro.unidad,
      rangoReferencia: registro.rangoReferencia,
      fuente: registro.fuente
    }));

  Object.values(porId).forEach((registro) => {
    const estadoResultado = textoNormalizado(registro.estadoResultado || "final");
    if (["final", "validado", "definitivo", "completo", "completed"].includes(estadoResultado)) return;
    hallazgos.push({
      id: `parametro_resultado_no_final:${registro.id}`,
      parametroId: registro.id,
      titulo: `${registro.etiqueta}: resultado ${registro.estadoResultado || "no final"}`,
      estado: "dato_preliminar",
      valor: registro.valor,
      unidad: registro.unidad,
      estadoResultado: registro.estadoResultado,
      recomendacion: "Confirmar el resultado final antes de tomar una decisión farmacológica definitiva.",
      fuente: registro.fuente
    });
  });

  if (!proteinasComparables) {
    hallazgos.push({
      id: "parametros_proteinas_fechas_no_comparables",
      parametroId: "proteinasSericas",
      titulo: "Proteínas séricas registradas en fechas distintas",
      estado: "dato_no_comparable",
      recomendacion: "No calcular globulinas ni relación A/G con mediciones de fechas distintas; confirmar que procedan de la misma muestra o panel."
    });
  }
  if (porId.eGFR && !unidadEgfrCompatible(porId.eGFR)) {
    hallazgos.push({
      id: "parametro_egfr_unidad_no_compatible",
      parametroId: "eGFR",
      titulo: "Unidad de eGFR no compatible con la clasificación cargada",
      estado: "dato_no_clasificable",
      recomendacion: "Verificar que el resultado esté expresado por 1.73 m² antes de aplicar categorías KDIGO."
    });
  }
  if (porId.uacr && !uacr) {
    hallazgos.push({
      id: "parametro_uacr_unidad_no_compatible",
      parametroId: "uacr",
      titulo: "Unidad de UACR no compatible con la clasificación cargada",
      estado: "dato_no_clasificable",
      recomendacion: "Usar mg/g o mg/mmol, o convertir el resultado mediante un método validado antes de clasificarlo."
    });
  }

  const discrepanciaProteinas = proteinasComparables && total !== null && albumina !== null && globulinas !== null
    ? Number((total - albumina - globulinas).toFixed(2))
    : null;
  if (discrepanciaProteinas !== null && Math.abs(discrepanciaProteinas) > 0.2) {
    hallazgos.push({
      id: "parametros_proteinas_no_concilian",
      parametroId: "proteinasSericas",
      titulo: "Proteínas totales no concilian con albúmina + globulinas",
      estado: "dato_inconsistente",
      diferencia: discrepanciaProteinas,
      unidad: "g/dL",
      recomendacion: "Verificar unidades, fecha y transcripción; no interpretar la relación A/G hasta conciliar los datos."
    });
  }
  if (total !== null && albumina !== null && total < albumina) {
    hallazgos.push({
      id: "parametros_proteinas_totales_menores_albumina",
      parametroId: "proteinasSericas",
      titulo: "Proteínas totales menores que la albúmina",
      estado: "dato_inconsistente",
      unidad: "g/dL",
      recomendacion: "Verificar unidad, muestra, fecha y transcripción antes de interpretar o calcular globulinas y relación A/G."
    });
  }

  return {
    versionEsquema: VERSION_PARAMETROS_CLINICOS,
    porId,
    lista: DEFINICIONES_PARAMETROS_CLINICOS.map((definicion) => porId[definicion.id]).filter(Boolean),
    derivados,
    categorias: { eGFR: egfr, uacr },
    hallazgos,
    valoresCanonicos: {
      creatininaMgDl: valorCanonicoCreatinina(porId.creatinina),
      eGFR: egfr ? porId.eGFR?.valor ?? null : null,
      uacr: uacr ? porId.uacr?.valor ?? null : null,
      proteinasTotalesGdl: total,
      albuminaGdl: albumina,
      globulinasGdl: globulinasParaRelacion
    },
    fuentes: [FUENTE_NIDDK_RENAL, FUENTE_KDIGO_RENAL, FUENTE_MEDLINE_PROTEINAS]
  };
}

export function construirRegistroParametrosClinicos(valores = {}, metadata = {}) {
  const registros = {};
  DEFINICIONES_PARAMETROS_CLINICOS.forEach((definicion) => {
    const entrada = valores[definicion.id];
    if (!entrada || numeroSeguro(entrada.valor ?? entrada.value ?? entrada) === null) return;
    const objeto = entrada && typeof entrada === "object" ? entrada : { valor: entrada };
    registros[definicion.id] = {
      analyteId: definicion.id,
      analito: definicion.etiqueta,
      valor: numeroSeguro(objeto.valor ?? objeto.value),
      unidad: String(objeto.unidad || definicion.unidad),
      rangoReferencia: String(objeto.rangoReferencia || "").trim(),
      origenRangoReferencia: String(objeto.origenRangoReferencia || "").trim(),
      fuenteRangoReferencia: String(objeto.fuenteRangoReferencia || "").trim(),
      fecha: String(objeto.fecha || metadata.fecha || "").trim(),
      origen: String(objeto.origen || metadata.origen || "captura_manual").trim(),
      procedencia: String(objeto.procedencia || metadata.procedencia || objeto.origen || metadata.origen || "captura_manual").trim(),
      muestra: String(objeto.muestra || definicion.muestra || "").trim(),
      metodo: String(objeto.metodo || "").trim(),
      formula: String(objeto.formula || "").trim(),
      versionFormula: String(objeto.versionFormula || "").trim(),
      estadoResultado: String(objeto.estadoResultado || "final").trim(),
      derivado: Boolean(objeto.derivado)
    };
  });
  return {
    versionEsquema: VERSION_PARAMETROS_CLINICOS,
    actualizadoEn: metadata.actualizadoEn || new Date().toISOString(),
    fechaMuestra: String(metadata.fecha || "").trim(),
    origen: String(metadata.origen || "captura_manual").trim(),
    valores: registros
  };
}
