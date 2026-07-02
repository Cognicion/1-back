import {
  PLANTILLAS_COMENTARIO,
  PLANTILLAS_EXPLORACION_MENTAL,
  PLANTILLAS_PADECIMIENTO
} from "./plantillasClinicas.js";

const CIE10_BASE = {
  "F32.1": "Episodio depresivo moderado",
  "F32.2": "Episodio depresivo grave sin sintomas psicoticos",
  "F32.3": "Episodio depresivo grave con sintomas psicoticos",
  "F33.1": "Trastorno depresivo recurrente, episodio actual moderado",
  "F33.2": "Trastorno depresivo recurrente, episodio actual grave sin sintomas psicoticos",
  "F33.3": "Trastorno depresivo recurrente, episodio actual grave con sintomas psicoticos",
  "F41.1": "Trastorno de ansiedad generalizada",
  "F41.0": "Trastorno de panico",
  "F29": "Psicosis no organica no especificada",
  "F20.0": "Esquizofrenia paranoide",
  "F22.0": "Trastorno de ideas delirantes",
  "F23.0": "Trastorno psicotico agudo polimorfo sin sintomas de esquizofrenia",
  "F25.0": "Trastorno esquizoafectivo tipo maniaco",
  "F25.1": "Trastorno esquizoafectivo tipo depresivo",
  "F31.1": "Trastorno afectivo bipolar, episodio maniaco sin sintomas psicoticos",
  "F31.2": "Trastorno afectivo bipolar, episodio maniaco con sintomas psicoticos",
  "F31.5": "Trastorno afectivo bipolar, episodio actual depresivo grave con sintomas psicoticos",
  "F60.3": "Trastorno de inestabilidad emocional de la personalidad",
  "F43.1": "Trastorno de estres postraumatico",
  "F10.1": "Uso perjudicial de alcohol",
  "F12.1": "Uso perjudicial de cannabinoides",
  "F15.1": "Uso perjudicial de otros estimulantes",
  "F19.1": "Uso perjudicial de multiples sustancias"
};

const REGLAS_SINTOMAS = {
  depresion: ["tristeza", "anhedonia", "culpa", "desesperanza", "llanto", "apatia", "hiporexia", "insomnio", "hipersomnia", "ideas de muerte", "ideacion suicida", "suicida", "animo bajo", "abatimiento", "aislamiento"],
  ansiedad: ["ansiedad", "preocupacion excesiva", "preocupacion", "inquietud", "tension", "crisis de panico", "ataque de panico", "palpitaciones", "miedo intenso", "nerviosismo"],
  psicosis: ["alucinaciones", "alucinacion", "delirios", "delirio", "voces", "escucha voces", "ideas delirantes", "paranoide", "desorganizacion", "conducta extrana", "suspicacia"],
  mania: ["euforia", "verborrea", "disminucion de sueno", "disminucion de la necesidad de dormir", "grandiosidad", "fuga de ideas", "irritabilidad", "hiperactividad", "gasto excesivo", "acelerado"],
  personalidadLimite: ["autolesiones", "impulsividad", "abandono", "relaciones inestables", "vacio", "ira", "inestabilidad emocional"],
  personalidadCriterios: ["patron persistente", "inicio temprano", "desde la adolescencia", "desde joven", "disfuncion interpersonal", "relaciones cronicas", "estabilidad temporal", "rasgos persistentes"],
  sustancias: ["cristal", "metanfetamina", "cannabis", "marihuana", "alcohol", "inhalantes", "cocaina", "benzodiacepinas", "sedantes"],
  trauma: ["trauma", "abuso", "pesadillas", "hipervigilancia", "evitacion", "reexperimentacion", "flashbacks"],
  esquizofreniaCurso: ["mas de 6 meses", "seis meses", "deterioro funcional", "sintomas negativos", "lenguaje desorganizado", "conducta desorganizada", "persistente", "persistencia"]
};

const RIESGO_SUICIDA_TERMINOS = {
  bajo: ["ideas de muerte", "desesperanza", "pensamientos de muerte"],
  moderado: ["ideas suicidas", "ideacion suicida", "conducta suicida", "amenaza suicida", "gesto suicida", "autolesiones"],
  alto: ["plan suicida", "ideacion suicida con plan", "ideación suicida con plan", "con plan", "intento suicida", "intento suicidio", "intento de suicidio", "intento autolitico", "acto suicida", "arma blanca", "cutter", "cuter", "cúter", "arrojarse"],
  muyAlto: ["intento frustrado", "abortado por terceros", "fue impedido", "fue rescatado", "intento saltar", "intento saltó", "salto", "saltó", "vias del metro", "vías del metro"]
};

const ALIAS_SECCIONES = {
  antecedentesPsiquiatricos: ["antecedentes psiquiatricos", "antecedentes de psiquiatria", "antecedentes mentales"],
  antecedentesMedicos: ["antecedentes medicos", "antecedentes personales patologicos", "antecedentes no psiquiatricos"],
  tratamientoPrevio: ["tratamiento previo", "medicacion previa", "medicamentos previos", "tratamiento actual", "medicacion actual"],
  hospitalizacionesPrevias: ["hospitalizaciones previas", "internamientos previos", "ingresos previos"],
  padecimientoActual: ["padecimiento actual", "enfermedad actual", "motivo de consulta", "motivo de atencion", "cuadro actual", "evolucion"],
  estresores: ["estresores", "factores estresores", "contexto psicosocial"],
  consumoSustancias: ["consumo de sustancias", "toxicomanias", "adicciones", "consumo"],
  factoresProtectores: ["factores protectores", "red de apoyo", "protectores"],
  factoresRiesgo: ["factores de riesgo", "riesgos"],
  exploracionMental: ["exploracion mental", "examen mental", "objetivo"],
  impresionDiagnostica: ["impresion diagnostica", "diagnostico probable", "diagnosticos probables"]
};

const CLAVES_CATEGORIA = {
  antecedentesPsiquiatricos: ["antecedente psiquiatrico", "psiquiatria", "diagnosticado", "seguimiento psiquiatrico", "consulta psiquiatrica"],
  antecedentesMedicos: ["diabetes", "hipertension", "epilepsia", "traumatismo", "cirugia", "enfermedad medica", "hipotiroidismo"],
  tratamientoPrevio: ["tratamiento", "medicamento", "toma", "sertralina", "fluoxetina", "risperidona", "olanzapina", "quetiapina", "valproato", "litio", "clonazepam"],
  hospitalizacionesPrevias: ["hospitalizacion", "internamiento", "ingreso previo", "hospitalizado", "urgencias"],
  padecimientoActual: ["acude", "refiere", "presenta", "inicia", "desde", "evolucion", "motivo", "cuadro", "traido", "llevado"],
  estresores: ["estresor", "duelo", "separacion", "desempleo", "conflicto", "violencia", "problemas familiares", "problemas laborales", "ruptura"],
  factoresProtectores: ["red de apoyo", "familia", "apoyo familiar", "apoyo de madre", "apoyo de padre", "religion", "hijos", "trabajo", "colaborador"],
  factoresRiesgo: ["riesgo", "sin red", "abandono", "impulsividad", "violencia", "arma", "intento", "desesperanza", "aislamiento"],
  exploracionMental: ["alerta", "orientado", "desorientado", "cooperador", "lenguaje", "afecto", "pensamiento", "juicio", "introspeccion", "sensopercepcion", "psicomotricidad"]
};

function normalizar(texto = "") {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function limpiarTexto(texto = "") {
  return String(texto || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function limpiarContenidoSeccion(texto = "") {
  let limpio = limpiarTexto(texto);
  const alias = Object.values(ALIAS_SECCIONES).flat().sort((a, b) => b.length - a.length);
  alias.forEach((nombre) => {
    limpio = limpio.replace(new RegExp(`^${nombre}\\s*[:\\-]\\s*`, "i"), "");
  });
  const siguienteEtiqueta = alias
    .map((nombre) => limpio.search(new RegExp(`(?:^|[.;])\\s*${nombre}\\s*[:\\-]`, "i")))
    .filter((indice) => indice > 0)
    .sort((a, b) => a - b)[0];
  if (siguienteEtiqueta) limpio = limpio.slice(0, siguienteEtiqueta);
  return limpiarTexto(limpio);
}

function estaNegado(texto, indice) {
  const contexto = texto.slice(Math.max(0, indice - 46), indice);
  return /(niega|negando|sin|no presenta|no refiere|no se observan|no se identifican|descarta)\s+([\w\s,;:.]{0,28})$/.test(contexto);
}

function contiene(texto, terminos = []) {
  return terminos.filter((termino) => {
    const terminoNormalizado = normalizar(termino);
    let indice = texto.indexOf(terminoNormalizado);
    while (indice !== -1) {
      if (!estaNegado(texto, indice)) return true;
      indice = texto.indexOf(terminoNormalizado, indice + terminoNormalizado.length);
    }
    return false;
  });
}

function dividirEnFrases(texto = "") {
  return limpiarTexto(texto)
    .split(/(?<=[.;!?])\s+|\n+/)
    .map((frase) => frase.trim())
    .filter(Boolean);
}

function unirUnico(partes = []) {
  const vistos = new Set();
  const resultado = [];
  partes.map(limpiarTexto).filter(Boolean).forEach((parte) => {
    const llave = normalizar(parte);
    if (vistos.has(llave)) return;
    if (resultado.some((actual) => normalizar(actual).includes(llave) || llave.includes(normalizar(actual)))) return;
    vistos.add(llave);
    resultado.push(parte);
  });
  return resultado.join(" ");
}

function extraerPorRegex(texto, regex) {
  return limpiarTexto(texto.match(regex)?.[1] || "");
}

function crearDatosVacios() {
  return {
    identificacion: {},
    antecedentesPsiquiatricos: {},
    antecedentesMedicos: {},
    tratamientoPrevio: {},
    hospitalizacionesPrevias: {},
    padecimientoActual: {},
    estresores: {},
    sintomas: {
      actuales: {},
      depresivos: {},
      ansiosos: {},
      psicoticos: {},
      maniformes: {},
      sustancias: {}
    },
    consumoSustancias: {},
    conductaSuicida: {},
    factoresProtectores: {},
    factoresRiesgo: {},
    riesgoSuicida: { nivel: "Sin riesgo", marcadores: [], severidad: "sin riesgo" },
    exploracionMental: {},
    impresionDiagnostica: {},
    fuente: { textoOriginal: "" }
  };
}

function asignarTexto(objeto, campo, texto) {
  const limpio = limpiarContenidoSeccion(texto);
  if (!limpio) return;
  objeto[campo] = unirUnico([objeto[campo], limpio]);
}

function extraerSecciones(texto, datos) {
  const textoNormalizado = normalizar(texto);
  const marcas = Object.entries(ALIAS_SECCIONES)
    .flatMap(([campo, alias]) => alias.map((nombre) => ({ campo, nombre: normalizar(nombre) })))
    .flatMap(({ campo, nombre }) => {
      const patron = new RegExp(`(?:^|[\\n.;])\\s*${nombre}\\s*[:\\-]`, "g");
      const salida = [];
      let match = patron.exec(textoNormalizado);
      while (match) {
        salida.push({ campo, inicio: match.index + match[0].length, marca: match.index });
        match = patron.exec(textoNormalizado);
      }
      return salida;
    })
    .sort((a, b) => a.marca - b.marca);

  marcas.forEach((marca, index) => {
    const fin = marcas[index + 1]?.marca ?? texto.length;
    const contenido = texto.slice(marca.inicio, fin);
    if (datos[marca.campo]) asignarTexto(datos[marca.campo], "texto", contenido);
  });
}

function clasificarFrases(texto, datos) {
  dividirEnFrases(texto).forEach((frase) => {
    const f = normalizar(frase);
    Object.entries(CLAVES_CATEGORIA).forEach(([campo, claves]) => {
      if (!contiene(f, claves).length || !datos[campo]) return;
      asignarTexto(datos[campo], "texto", frase);
    });

    if (contiene(f, REGLAS_SINTOMAS.depresion.concat(REGLAS_SINTOMAS.mania, REGLAS_SINTOMAS.ansiedad, REGLAS_SINTOMAS.psicosis)).length) {
      asignarTexto(datos.sintomas.actuales, "texto", frase);
    }
    if (contiene(f, REGLAS_SINTOMAS.depresion).length) asignarTexto(datos.sintomas.depresivos, "texto", frase);
    if (contiene(f, REGLAS_SINTOMAS.ansiedad).length) asignarTexto(datos.sintomas.ansiosos, "texto", frase);
    if (contiene(f, REGLAS_SINTOMAS.psicosis).length) asignarTexto(datos.sintomas.psicoticos, "texto", frase);
    if (contiene(f, REGLAS_SINTOMAS.mania).length) asignarTexto(datos.sintomas.maniformes, "texto", frase);
    if (contiene(f, REGLAS_SINTOMAS.sustancias).length) {
      asignarTexto(datos.sintomas.sustancias, "texto", frase);
      asignarTexto(datos.consumoSustancias, "texto", frase);
    }
    if (contiene(f, Object.values(RIESGO_SUICIDA_TERMINOS).flat()).length) asignarTexto(datos.conductaSuicida, "texto", frase);
  });
}

function extraerIdentificacion(texto, datos) {
  const t = limpiarTexto(texto);
  const edad = t.match(/\b(\d{1,3})\s*(anos|anios|años)\b/i)?.[1] || "";
  const sexo = t.match(/\b(femenino|masculino|mujer|hombre|varon)\b/i)?.[1] || "";
  const escolaridad = extraerPorRegex(t, /\bescolaridad\s*(?:de)?\s*([^.;,]+)/i);
  const ocupacion = extraerPorRegex(t, /\bocupacion\s*(?:de)?\s*([^.;,]+)/i);
  datos.identificacion = {
    edad,
    sexo,
    escolaridad,
    ocupacion,
    texto: unirUnico([edad ? `${edad} anos` : "", sexo, escolaridad, ocupacion])
  };
}

function extraerTemporalidad(texto, datos) {
  const t = limpiarTexto(datos.padecimientoActual.texto || texto);
  const temporalidad = t.match(/\b(desde hace|desde|hace|inicia|inicio|comenzo|comienza)\s+([^.;]+)/i)?.[0] || "";
  const motivo = t.match(/\b(acude|es traido|fue traido|ingresa|consulta|motivo por el cual)\s+([^.;]+)/i)?.[0] || "";
  datos.padecimientoActual.evolucionTemporal = limpiarTexto(temporalidad);
  datos.padecimientoActual.motivoConsulta = limpiarTexto(motivo);
}

function extraerAdherenciaYRecaidas(texto, datos) {
  const t = normalizar(texto);
  if (contiene(t, ["suspendio", "suspendida", "abandono tratamiento", "mala adherencia", "irregular", "no toma"]).length) {
    datos.tratamientoPrevio.adherencia = "irregular o suspendida";
  } else if (contiene(t, ["buena adherencia", "apego", "toma adecuadamente"]).length) {
    datos.tratamientoPrevio.adherencia = "referida como adecuada";
  }
  const recaidas = contiene(t, ["recaida", "recaidas", "reagudizacion", "descompensacion"]);
  if (recaidas.length) datos.padecimientoActual.recaidas = recaidas;
}

function recortarDesdeEtiqueta(texto = "", etiqueta = "") {
  const indice = normalizar(texto).indexOf(normalizar(etiqueta));
  return indice > 0 ? limpiarTexto(texto.slice(0, indice)) : limpiarTexto(texto);
}

function posprocesarDatos(datos) {
  if (datos.antecedentesPsiquiatricos.texto) {
    datos.antecedentesPsiquiatricos.texto = recortarDesdeEtiqueta(datos.antecedentesPsiquiatricos.texto, "tratamiento previo");
  }
  if (datos.tratamientoPrevio.texto) {
    datos.tratamientoPrevio.texto = datos.tratamientoPrevio.texto.replace(/^tratamiento previo\s*(?:[:\-]\s*)?/i, "").replace(/[.]+$/, "");
    datos.tratamientoPrevio.texto = datos.tratamientoPrevio.texto.replace(/^con\s+/i, "");
  }
  if (datos.estresores.texto) {
    datos.estresores.texto = datos.estresores.texto.replace(/^posterior a\s+/i, "");
  }
  if (datos.padecimientoActual.texto) {
    datos.padecimientoActual.texto = recortarDesdeEtiqueta(datos.padecimientoActual.texto, "conducta suicida");
  }
  if (datos.conductaSuicida.texto) {
    const indice = normalizar(datos.conductaSuicida.texto).lastIndexOf("conducta suicida");
    if (indice > 0) datos.conductaSuicida.texto = limpiarTexto(datos.conductaSuicida.texto.slice(indice)).replace(/^conducta suicida\s*[:\-]\s*/i, "");
    datos.conductaSuicida.texto = datos.conductaSuicida.texto.replace(/^refiere\s+/i, "");
  }
}

export function detectarSintomas(textoDictado = "") {
  const texto = normalizar(textoDictado);
  return Object.fromEntries(
    Object.entries(REGLAS_SINTOMAS).map(([grupo, terminos]) => [grupo, contiene(texto, terminos)])
  );
}

function riesgoDesdeMarcadores(marcadoresPorNivel) {
  if (marcadoresPorNivel.muyAlto.length) return "Muy alto";
  if (marcadoresPorNivel.alto.length) return "Alto";
  if (marcadoresPorNivel.moderado.length) return "Moderado";
  if (marcadoresPorNivel.bajo.length) return "Bajo";
  return "Sin riesgo";
}

export function detectarRiesgoSuicida(textoDictado = "") {
  const texto = normalizar(textoDictado);
  const marcadoresPorNivel = Object.fromEntries(
    Object.entries(RIESGO_SUICIDA_TERMINOS).map(([nivel, terminos]) => [nivel, contiene(texto, terminos)])
  );
  const nivel = riesgoDesdeMarcadores(marcadoresPorNivel);
  if (nivel === "Sin riesgo") return [];

  return [{
    tipo: "Riesgo suicida",
    nivel,
    severidad: nivel.toLowerCase(),
    marcadores: Object.values(marcadoresPorNivel).flat()
  }];
}

export function extraerDatosClinicos(textoDictado = "") {
  const datos = crearDatosVacios();
  const texto = limpiarTexto(textoDictado);
  datos.fuente.textoOriginal = texto;
  if (!texto) return datos;

  extraerIdentificacion(texto, datos);
  extraerSecciones(texto, datos);
  clasificarFrases(texto, datos);
  extraerTemporalidad(texto, datos);
  extraerAdherenciaYRecaidas(texto, datos);

  const sintomas = detectarSintomas(texto);
  datos.sintomas.depresivos.marcadores = sintomas.depresion;
  datos.sintomas.ansiosos.marcadores = sintomas.ansiedad;
  datos.sintomas.psicoticos.marcadores = sintomas.psicosis;
  datos.sintomas.maniformes.marcadores = sintomas.mania;
  datos.sintomas.sustancias.marcadores = sintomas.sustancias;
  datos.sintomas.personalidadLimite = {
    marcadores: sintomas.personalidadLimite,
    criteriosLongitudinales: sintomas.personalidadCriterios
  };
  datos.sintomas.esquizofreniaCurso = { marcadores: sintomas.esquizofreniaCurso };

  const riesgos = detectarRiesgoSuicida(texto);
  datos.riesgoSuicida = riesgos[0] || datos.riesgoSuicida;
  if (riesgos[0]) datos.conductaSuicida.marcadores = riesgos[0].marcadores;

  posprocesarDatos(datos);
  return datos;
}

export function estructurarTextoClinico(textoDictado = "") {
  const datos = extraerDatosClinicos(textoDictado);
  return {
    fichaIdentificacion: datos.identificacion.texto || "",
    antecedentesPsiquiatricos: datos.antecedentesPsiquiatricos.texto || "",
    antecedentesMedicos: datos.antecedentesMedicos.texto || "",
    tratamientoPrevio: datos.tratamientoPrevio.texto || "",
    hospitalizacionesPrevias: datos.hospitalizacionesPrevias.texto || "",
    padecimientoActual: datos.padecimientoActual.texto || datos.sintomas.actuales.texto || "",
    estresores: datos.estresores.texto || "",
    sintomasAfectivos: datos.sintomas.depresivos.texto || "",
    sintomasAnsiosos: datos.sintomas.ansiosos.texto || "",
    sintomasPsicoticos: datos.sintomas.psicoticos.texto || "",
    conductaSuicida: datos.conductaSuicida.texto || "",
    consumoSustancias: datos.consumoSustancias.texto || "",
    factoresRiesgo: datos.factoresRiesgo.texto || "",
    factoresProtectores: datos.factoresProtectores.texto || "",
    exploracionMental: datos.exploracionMental.texto || "",
    impresionDiagnostica: datos.impresionDiagnostica.texto || ""
  };
}

function agregarDx(lista, codigo, razon, tipo = "Diagnostico probable") {
  if (lista.some((dx) => dx.codigo === codigo && dx.tipo === tipo)) return;
  lista.push({
    codigo,
    nombre: CIE10_BASE[codigo] || "",
    catalogo: "CIE-10",
    texto: `${codigo} - ${CIE10_BASE[codigo] || ""}`.trim(),
    tipo,
    certeza: tipo,
    razon,
    sugerido: true
  });
}

export function sugerirDiagnosticos(sintomas = {}, riesgos = []) {
  const diagnosticos = [];
  const hayDepresion = sintomas.depresion?.length >= 2;
  const hayPsicosis = sintomas.psicosis?.length > 0;
  const hayMania = sintomas.mania?.length >= 2;
  const hayAnsiedad = sintomas.ansiedad?.length >= 2;
  const hayPanico = sintomas.ansiedad?.some((s) => s.includes("panico"));
  const hayTrauma = sintomas.trauma?.length >= 2;
  const haySustancias = sintomas.sustancias?.length > 0;
  const hayCursoEsquizofrenia = sintomas.esquizofreniaCurso?.length >= 3;
  const criteriosPersonalidad = sintomas.personalidadCriterios?.length >= 3;
  const riesgoAlto = riesgos.some((r) => ["Alto", "Muy alto"].includes(r.nivel));

  if (hayDepresion && hayPsicosis) {
    agregarDx(diagnosticos, riesgoAlto ? "F32.3" : "F32.2", "Sintomas depresivos con posible fenomenologia psicotica; requiere corroborar congruencia afectiva y temporalidad.", "Diagnostico probable");
    agregarDx(diagnosticos, "F31.5", "Considerar diferencial afectivo bipolar si existe antecedente de hipomania/mania.", "Diagnostico diferencial");
  } else if (hayDepresion) {
    agregarDx(diagnosticos, riesgoAlto ? "F32.2" : "F32.1", "Sindrome depresivo sugerido por sintomas afectivos y neurovegetativos.", "Diagnostico probable");
    agregarDx(diagnosticos, riesgoAlto ? "F33.2" : "F33.1", "Valorar recurrencia si existen episodios depresivos previos.", "Diagnostico diferencial");
  }

  if (hayAnsiedad) agregarDx(diagnosticos, hayPanico ? "F41.0" : "F41.1", "Sintomas ansiosos detectados en el dictado.", "Diagnostico probable");
  if (hayPsicosis) agregarDx(diagnosticos, hayCursoEsquizofrenia ? "F20.0" : "F29", hayCursoEsquizofrenia ? "Datos de curso persistente, deterioro y desorganizacion a corroborar." : "Sintomas psicoticos sin duracion suficiente; sugerir sindrome psicotico a estudio.", hayCursoEsquizofrenia ? "Diagnostico a descartar" : "Diagnostico probable");
  if (hayMania) agregarDx(diagnosticos, hayPsicosis ? "F31.2" : "F31.1", "Sintomas maniformes detectados; evitar asumir depresion unipolar sin explorar bipolaridad.", "Diagnostico a descartar");
  if (hayTrauma) agregarDx(diagnosticos, "F43.1", "Sintomas postraumaticos referidos.", "Diagnostico probable");

  if (sintomas.personalidadLimite?.length >= 2) {
    agregarDx(
      diagnosticos,
      "F60.3",
      criteriosPersonalidad
        ? "Marcadores compatibles con patron persistente, inicio temprano y disfuncion interpersonal; corroborar longitudinalmente."
        : "Hay rasgos compatibles, pero no suficientes para diagnostico definitivo sin patron persistente, inicio temprano y estabilidad temporal.",
      criteriosPersonalidad ? "Diagnostico a descartar" : "Rasgos de personalidad a valorar"
    );
  }

  if (haySustancias) {
    const texto = sintomas.sustancias.join(" ");
    let sustanciasDetectadas = 0;
    if (texto.includes("alcohol")) agregarDx(diagnosticos, "F10.1", "Consumo de alcohol referido.", "Diagnostico probable");
    if (texto.includes("alcohol")) sustanciasDetectadas += 1;
    if (texto.includes("cannabis") || texto.includes("marihuana")) {
      agregarDx(diagnosticos, "F12.1", "Consumo de cannabinoides referido.", "Diagnostico probable");
      sustanciasDetectadas += 1;
    }
    if (texto.includes("cristal") || texto.includes("metanfetamina") || texto.includes("cocaina")) {
      agregarDx(diagnosticos, "F15.1", "Consumo de estimulantes referido.", "Diagnostico probable");
      sustanciasDetectadas += 1;
    }
    if (sustanciasDetectadas > 1) {
      agregarDx(diagnosticos, "F19.1", "A descartar policonsumo o trastorno inducido por sustancias segun temporalidad.", "Diagnostico diferencial");
    }
  }

  return diagnosticos;
}

export function generarPadecimientoActual(datos = {}) {
  return PLANTILLAS_PADECIMIENTO.observacionFray(datos.datosClinicos || datos);
}

export function generarExploracionMental(datos = {}) {
  return PLANTILLAS_EXPLORACION_MENTAL.observacionFray(datos.datosClinicos || datos);
}

export function generarComentarioClinico(datos = {}) {
  return PLANTILLAS_COMENTARIO.observacionFray(datos.datosClinicos || datos);
}

export function generarDiagnosticosDiferenciales(datos = {}) {
  const diagnosticos = datos.diagnosticos || [];
  const diferenciales = diagnosticos.map((dx) => `${dx.codigo} - ${dx.nombre} (${dx.tipo || dx.certeza}). ${dx.razon}`);
  if (datos.sintomas?.sustancias?.marcadores?.length || datos.sintomas?.sustancias?.length) {
    diferenciales.push("Trastorno mental o conductual inducido por sustancias, a descartar segun temporalidad de consumo/intoxicacion/abstinencia.");
  }
  if ((datos.sintomas?.maniformes?.marcadores?.length || datos.sintomas?.mania?.length) && (datos.sintomas?.depresivos?.marcadores?.length || datos.sintomas?.depresion?.length)) {
    diferenciales.push("Trastorno afectivo bipolar vs episodio depresivo unipolar, a integrar segun antecedente de hipomania/mania.");
  }
  return unirUnico(diferenciales);
}

export function generarPlanSugerido(diagnosticos = [], riesgos = [], sintomas = {}, datosClinicos = {}) {
  const plan = [
    "Corroborar informacion dictada mediante entrevista psiquiatrica completa y exploracion mental directa.",
    "Integrar temporalidad, intensidad, deterioro funcional, antecedentes personales/familiares y consumo de sustancias.",
    "Mantener diagnosticos como probables, diferenciales o a descartar hasta completar integracion clinica."
  ];

  if (riesgos.length) plan.push("Estratificar riesgo suicida, implementar plan de seguridad, vigilancia y restriccion de medios letales segun nivel de riesgo.");
  if (sintomas.psicosis?.length) plan.push("Valorar fenomenologia psicotica, organicidad, intoxicacion/abstinencia y necesidad de antipsicotico o contencion segun juicio clinico.");
  if (sintomas.mania?.length) plan.push("Ante sintomas maniformes, evitar indicar antidepresivo sin valorar bipolaridad y necesidad de estabilizador del estado de animo.");
  if (sintomas.sustancias?.length || datosClinicos.consumoSustancias?.texto) plan.push("Indagar patron de consumo, abstinencia, intoxicacion y comorbilidad por sustancias.");
  if (datosClinicos.factoresProtectores?.texto) plan.push("Incorporar factores protectores y red de apoyo al plan terapeutico.");
  if (diagnosticos.length) plan.push("Revisar manualmente los CIE-10 sugeridos antes de integrarlos al expediente.");

  return plan.join("\n");
}

export function generarNotaAutomatica(textoDictado = "") {
  const datosClinicos = extraerDatosClinicos(textoDictado);
  const textoAnalisis = [textoDictado, JSON.stringify(datosClinicos)].join(" ");
  const sintomas = detectarSintomas(textoAnalisis);
  const riesgosDetectados = detectarRiesgoSuicida(textoAnalisis);
  const diagnosticosSugeridos = sugerirDiagnosticos(sintomas, riesgosDetectados);
  const impresion = generarDiagnosticosDiferenciales({
    diagnosticos: diagnosticosSugeridos,
    sintomas: datosClinicos.sintomas
  });

  datosClinicos.impresionDiagnostica.texto = datosClinicos.impresionDiagnostica.texto || impresion;

  return {
    datosClinicos,
    estructuraClinica: estructurarTextoClinico(textoDictado),
    padecimientoActual: generarPadecimientoActual(datosClinicos),
    exploracionMental: generarExploracionMental(datosClinicos),
    comentarioClinico: generarComentarioClinico(datosClinicos),
    impresionDiagnostica: datosClinicos.impresionDiagnostica.texto,
    diagnosticosDiferenciales: impresion,
    diagnosticosSugeridos: diagnosticosSugeridos.map((dx) => dx.nombre),
    cie10Sugeridos: diagnosticosSugeridos,
    planSugerido: generarPlanSugerido(diagnosticosSugeridos, riesgosDetectados, sintomas, datosClinicos),
    riesgosDetectados
  };
}
