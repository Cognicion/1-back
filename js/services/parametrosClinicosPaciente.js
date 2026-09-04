const FUENTE_NIDDK_RENAL = "NIDDK: Chronic Kidney Disease Tests & Diagnosis, https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/tests-diagnosis";
const FUENTE_KDIGO_RENAL = "KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD, https://kdigo.org/guidelines/ckd-evaluation-and-management/";
const FUENTE_MEDLINE_PROTEINAS = "MedlinePlus: Total Protein and Albumin/Globulin (A/G) Ratio, https://medlineplus.gov/lab-tests/total-protein-and-albumin-globulin-a-g-ratio/";

export const VERSION_PARAMETROS_CLINICOS = "1.0.0";

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
    fuente: FUENTE_NIDDK_RENAL
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
    fuente: FUENTE_KDIGO_RENAL
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
    fuente: FUENTE_KDIGO_RENAL
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
    rutas: ["sodio", "electrolitos.sodio", "laboratorio.sodio", "parametrosClinicos.sodio", "parametrosClinicos.valores.sodio", "parametrosClinicos.electrolitos.sodio"]
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
    rutas: ["potasio", "electrolitos.potasio", "laboratorio.potasio", "parametrosClinicos.potasio", "parametrosClinicos.valores.potasio", "parametrosClinicos.electrolitos.potasio"]
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
    rutas: ["cloro", "cloruro", "electrolitos.cloro", "electrolitos.cloruro", "laboratorio.cloro", "parametrosClinicos.valores.cloro", "parametrosClinicos.electrolitos.cloro"]
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
    rutas: ["bicarbonato", "co2Total", "electrolitos.bicarbonato", "laboratorio.bicarbonato", "parametrosClinicos.valores.bicarbonato", "parametrosClinicos.electrolitos.bicarbonato"]
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
    rutas: ["magnesio", "electrolitos.magnesio", "laboratorio.magnesio", "parametrosClinicos.valores.magnesio", "parametrosClinicos.electrolitos.magnesio"]
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
    rutas: ["calcio", "electrolitos.calcio", "laboratorio.calcio", "parametrosClinicos.valores.calcio", "parametrosClinicos.electrolitos.calcio"]
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
    fuente: FUENTE_MEDLINE_PROTEINAS
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
    fuente: FUENTE_MEDLINE_PROTEINAS
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
    fuente: FUENTE_MEDLINE_PROTEINAS
  })
]);

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
  const unidad = String(objeto.unidad || objeto.unit || definicion.unidad || "").trim();
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
    limiteInferior: rangoParseado?.minimo ?? numeroSeguro(objeto.limiteInferior ?? objeto.minimo),
    limiteSuperior: rangoParseado?.maximo ?? numeroSeguro(objeto.limiteSuperior ?? objeto.maximo),
    estado: estadoParametro({ ...objeto, valor, rangoReferencia: rangoEntrada }),
    fecha: fechaComparable(objeto.fecha || objeto.measuredAt || objeto.fechaResultado || objeto.updatedAt || objeto.fechaActualizacion),
    origen: String(objeto.origen || objeto.source || origen),
    procedencia: String(objeto.procedencia || objeto.sourceSystem || objeto.sistemaOrigen || objeto.origen || origen),
    muestra: String(objeto.muestra || objeto.specimen || definicion.muestra || ""),
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
  const unidad = textoNormalizado(registro.unidad).replace(/\s/g, "");
  if (/mol/.test(unidad)) return registro.valor / 88.4;
  return registro.valor;
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
  const esMmol = /mmol/i.test(String(unidad || ""));
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
  const derivados = {};
  if (globulinas === null && total !== null && albumina !== null && total >= albumina) {
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
  if (albumina !== null && globulinasParaRelacion !== null && globulinasParaRelacion > 0) {
    derivados.relacionAlbuminaGlobulina = {
      id: "relacionAlbuminaGlobulina",
      etiqueta: "Relación albúmina/globulinas (A/G)",
      valor: Number((albumina / globulinasParaRelacion).toFixed(2)),
      unidad: "",
      formula: "albúmina ÷ globulinas",
      derivado: true
    };
  }

  const egfr = porId.eGFR ? categoriaEgfr(porId.eGFR.valor) : null;
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

  const discrepanciaProteinas = total !== null && albumina !== null && globulinas !== null
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
      eGFR: porId.eGFR?.valor ?? null,
      uacr: porId.uacr?.valor ?? null,
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
