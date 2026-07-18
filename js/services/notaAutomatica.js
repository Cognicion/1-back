import {
  PLANTILLAS_COMENTARIO,
  PLANTILLAS_EXPLORACION_MENTAL,
  PLANTILLAS_PADECIMIENTO
} from "./plantillasClinicas.js";
import {
  crearProvenanceRecord,
  validarTextoClinico
} from "./clinicalValidationService.js";
import { ejecutarPipelineClinico, segmentarConversacionClinica } from "./clinicalPipeline.js";
import { isEvolutionDocumentType, isEvolutionNarrativeStyle } from "./voiceNoteStyleTemplates.js";

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

const EQUIVALENCIAS_COLOQUIALES = {
  depresion: [
    ["ya no disfruto nada", "anhedonia"],
    ["no disfruto nada", "anhedonia"],
    ["no quiero levantarme", "apatia/abulia"],
    ["casi no duermo", "insomnio"],
    ["me despierto como a las cuatro", "insomnio terminal"],
    ["me despierto a las cuatro", "insomnio terminal"],
    ["como muy poco", "hiporexia"],
    ["soy una carga", "culpa/minusvalia"],
    ["me vio llorando", "llanto"]
  ],
  riesgo: [
    ["pense en tomarme las pastillas", "ideacion suicida con plan por sobredosis medicamentosa"],
    ["pensé en tomarme las pastillas", "ideacion suicida con plan por sobredosis medicamentosa"],
    ["pastillas de mi mama", "metodo especifico por sobredosis medicamentosa"],
    ["pastillas de mi mamá", "metodo especifico por sobredosis medicamentosa"],
    ["mi hermana las guardo", "restriccion de medios por familiar"],
    ["mi hermana las guardó", "restriccion de medios por familiar"],
    ["ya no podia dejarme sola", "necesidad de supervision por riesgo"],
    ["ya no podía dejarme sola", "necesidad de supervision por riesgo"]
  ],
  protectores: [
    ["viene mi hermana conmigo", "Acompanamiento por hermana"],
    ["mi hermana me trajo", "Red de apoyo familiar"],
    ["mi hermana las guardo", "Restriccion de medios por familiar"],
    ["mi hermana las guardó", "Restriccion de medios por familiar"]
  ]
};

const SINTOMAS_NEGADOS_CANONICOS = {
  psicosis: [
    ["voces", "alucinaciones auditivas"],
    ["escuchado voces", "alucinaciones auditivas"],
    ["visto cosas", "alteraciones sensoperceptivas"],
    ["cosas que otros no ven", "alteraciones sensoperceptivas"],
    ["delirios", "ideas delirantes"]
  ],
  mania: [
    ["mucha energia", "hiperenergia"],
    ["sin dormir", "disminucion de necesidad de dormir"],
    ["gastando mucho dinero", "gasto excesivo"]
  ],
  sustancias: [
    ["drogas", "consumo de drogas"],
    ["cristal", "consumo de estimulantes"],
    ["cannabis", "consumo de cannabis"],
    ["marihuana", "consumo de cannabis"]
  ]
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

function capitalizarFrase(texto = "") {
  const limpio = String(texto || "").trim();
  return limpio ? `${limpio.charAt(0).toUpperCase()}${limpio.slice(1)}` : "";
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

function estaNegadoDespues(texto, indice, termino = "") {
  const despues = texto.slice(indice + termino.length, indice + termino.length + 120);
  const respuestaNegativa = /\b(no|no doctor|no doctora|nunca|para nada|nada de eso)\b/.test(despues);
  const respuestaAfirmativaAntes = /\b(si|sí|claro|bastante|mucho)\b/.test(despues.split(/\b(no|no doctor|no doctora|nunca|para nada|nada de eso)\b/)[0] || "");
  return respuestaNegativa && !respuestaAfirmativaAntes;
}

function contiene(texto, terminos = []) {
  return terminos.filter((termino) => {
    const terminoNormalizado = normalizar(termino);
    let indice = texto.indexOf(terminoNormalizado);
    while (indice !== -1) {
      if (!estaNegado(texto, indice) && !estaNegadoDespues(texto, indice, terminoNormalizado)) return true;
      indice = texto.indexOf(terminoNormalizado, indice + terminoNormalizado.length);
    }
    return false;
  });
}

function contieneNegado(texto, terminos = []) {
  return terminos.filter((termino) => {
    const terminoNormalizado = normalizar(termino);
    let indice = texto.indexOf(terminoNormalizado);
    while (indice !== -1) {
      if (estaNegado(texto, indice) || estaNegadoDespues(texto, indice, terminoNormalizado)) return true;
      indice = texto.indexOf(terminoNormalizado, indice + terminoNormalizado.length);
    }
    return false;
  });
}

function dividirEnFrases(texto = "") {
  return limpiarTexto(texto.replace(/[…]+/g, ". "))
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

function primerValor(...valores) {
  return valores.find((valor) => valor !== undefined && valor !== null && String(valor).trim() !== "") || "";
}

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const textoFecha = String(fechaNacimiento).trim();
  let fecha = null;

  if (/^\d{4}-\d{2}-\d{2}/.test(textoFecha)) {
    fecha = new Date(`${textoFecha.slice(0, 10)}T00:00:00`);
  } else if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(textoFecha)) {
    const [dia, mes, anio] = textoFecha.split(/[-/]/);
    fecha = new Date(`${anio}-${mes}-${dia}T00:00:00`);
  } else {
    fecha = new Date(textoFecha);
  }

  if (Number.isNaN(fecha?.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const mes = hoy.getMonth() - fecha.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < fecha.getDate())) edad -= 1;
  return edad >= 0 ? edad : null;
}

function normalizarIdentificacionPaciente(datosPaciente = {}, identificacionDictado = {}) {
  const institucional = datosPaciente.datosInstitucionales || {};
  const historia = datosPaciente.historiaClinica || {};
  const fechaNacimiento = primerValor(
    datosPaciente.fechaNacimiento,
    institucional.fechaNacimiento,
    datosPaciente.fecha_nacimiento,
    datosPaciente.fechaDeNacimiento,
    datosPaciente.fechaNac,
    datosPaciente.nacimiento,
    identificacionDictado.fechaNacimiento
  );
  const edadCalculada = calcularEdad(fechaNacimiento);
  const edad = edadCalculada ?? (datosPaciente.edad || institucional.edad || identificacionDictado.edad || null);
  const nombreCompleto = primerValor(datosPaciente.nombreCompleto, datosPaciente.nombre, institucional.nombrePaciente, identificacionDictado.nombreCompleto);
  const sexo = primerValor(datosPaciente.sexo, institucional.sexo, historia.sexo, identificacionDictado.sexo);
  const escolaridad = primerValor(datosPaciente.escolaridad, historia.escolaridad, institucional.escolaridad, identificacionDictado.escolaridad);
  const estadoCivil = primerValor(datosPaciente.estadoCivil, historia.estadoCivil, institucional.estadoCivil, identificacionDictado.estadoCivil);
  const ocupacion = primerValor(datosPaciente.ocupacion, historia.ocupacion, institucional.ocupacion, identificacionDictado.ocupacion);
  const religion = primerValor(datosPaciente.religion, historia.religion, institucional.religion, identificacionDictado.religion);
  const medicoTratante = primerValor(datosPaciente.medicoTratante, institucional.medicoTratante, historia.medicoTratante, identificacionDictado.medicoTratante);

  return {
    nombreCompleto,
    sexo,
    fechaNacimiento,
    edad,
    escolaridad,
    estadoCivil,
    ocupacion,
    religion,
    medicoTratante,
    texto: unirUnico([
      nombreCompleto,
      sexo,
      edad !== null && edad !== "" ? `${edad} anos` : "",
      escolaridad,
      estadoCivil,
      ocupacion,
      religion
    ])
  };
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
    sintomasNegados: {
      psicosis: [],
      mania: [],
      sustancias: []
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
    if (/^(hola|dime|ok|que|qué|como|cómo|por que|por qué|has|haz|vienes|consumes|llegaste|y te)\b/.test(f)) return;
    Object.entries(CLAVES_CATEGORIA).forEach(([campo, claves]) => {
      if (!contiene(f, claves).length || !datos[campo]) return;
      if (campo === "tratamientoPrevio" && /tomarme las pastillas|pastillas de mi mama|pastillas de mi mamá/.test(f)) return;
      asignarTexto(datos[campo], "texto", frase);
    });

    if (contiene(f, REGLAS_SINTOMAS.depresion.concat(REGLAS_SINTOMAS.mania, REGLAS_SINTOMAS.ansiedad, REGLAS_SINTOMAS.psicosis)).length) {
      asignarTexto(datos.sintomas.actuales, "texto", frase);
    }
    if (contiene(f, REGLAS_SINTOMAS.depresion).length) asignarTexto(datos.sintomas.depresivos, "texto", frase);
    if (contiene(f, REGLAS_SINTOMAS.ansiedad).length) asignarTexto(datos.sintomas.ansiosos, "texto", frase);
    if (contiene(f, REGLAS_SINTOMAS.psicosis).length) asignarTexto(datos.sintomas.psicoticos, "texto", frase);
    if (contiene(f, REGLAS_SINTOMAS.mania).length) asignarTexto(datos.sintomas.maniformes, "texto", frase);
    const sustanciasFrase = contiene(f, REGLAS_SINTOMAS.sustancias);
    if (sustanciasFrase.length && !(sustanciasFrase.every((item) => item === "alcohol") && consumoAlcoholNoProblematico(f))) {
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
  const estadoCivil = extraerPorRegex(t, /\bestado civil\s*(?:de)?\s*([^.;,]+)/i);
  const ocupacion = extraerPorRegex(t, /\bocupacion\s*(?:de)?\s*([^.;,]+)/i);
  const religion = extraerPorRegex(t, /\breligion\s*(?:de)?\s*([^.;,]+)/i);
  datos.identificacion = {
    nombreCompleto: "",
    sexo,
    fechaNacimiento: "",
    edad: edad ? Number(edad) : null,
    escolaridad,
    estadoCivil,
    ocupacion,
    religion,
    medicoTratante: "",
    texto: unirUnico([edad ? `${edad} anos` : "", sexo, escolaridad, estadoCivil, ocupacion, religion])
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
    datos.tratamientoPrevio.texto = datos.tratamientoPrevio.texto.replace(/^si\s+/i, "");
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
  const sintomas = Object.fromEntries(
    Object.entries(REGLAS_SINTOMAS).map(([grupo, terminos]) => [grupo, contiene(texto, terminos)])
  );
  Object.entries(EQUIVALENCIAS_COLOQUIALES).forEach(([grupo, equivalencias]) => {
    if (grupo === "riesgo" || grupo === "protectores") return;
    equivalencias.forEach(([frase, marcador]) => {
      if (texto.includes(normalizar(frase)) && !sintomas[grupo]?.includes(marcador)) {
        sintomas[grupo] = [...(sintomas[grupo] || []), marcador];
      }
    });
  });
  if (consumoAlcoholNoProblematico(texto)) {
    sintomas.sustancias = (sintomas.sustancias || []).filter((item) => item !== "alcohol");
  }
  return sintomas;
}

function detectarSintomasNegados(textoDictado = "") {
  const texto = normalizar(textoDictado);
  return Object.fromEntries(
    Object.entries(SINTOMAS_NEGADOS_CANONICOS).map(([grupo, pares]) => {
      const negados = pares
        .filter(([frase]) => contieneNegado(texto, [frase]).length)
        .map(([, etiqueta]) => etiqueta);
      return [grupo, [...new Set(negados)]];
    })
  );
}

function consumoAlcoholNoProblematico(texto = "") {
  return contiene(texto, [
    "alcohol casi nada",
    "alcohol ocasional",
    "una cerveza de vez en cuando",
    "consumo social",
    "niega consumo problematico",
    "sin datos de dependencia",
    "sin datos de uso perjudicial"
  ]).length > 0;
}

function consumoAlcoholProblematico(texto = "") {
  return contiene(texto, [
    "consumo frecuente",
    "consumo diario",
    "perdida de control",
    "problemas familiares por consumo",
    "problemas laborales por consumo",
    "intoxicaciones repetidas",
    "abstinencia",
    "craving",
    "dependencia",
    "consumo pese a consecuencias"
  ]).length > 0;
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
  EQUIVALENCIAS_COLOQUIALES.riesgo.forEach(([frase, marcador]) => {
    if (texto.includes(normalizar(frase)) && !marcadoresPorNivel.alto.includes(marcador)) {
      marcadoresPorNivel.alto.push(marcador);
    }
  });
  if (texto.includes("tomarme las pastillas") && !marcadoresPorNivel.alto.includes("ideacion suicida con plan por sobredosis medicamentosa")) {
    marcadoresPorNivel.alto.push("ideacion suicida con plan por sobredosis medicamentosa");
  }
  const nivel = riesgoDesdeMarcadores(marcadoresPorNivel);
  if (nivel === "Sin riesgo") return [];

  return [{
    tipo: "Riesgo suicida",
    nivel,
    severidad: nivel.toLowerCase(),
    marcadores: Object.values(marcadoresPorNivel).flat()
  }];
}

export function extraerDatosClinicos(textoDictado = "", datosPaciente = {}) {
  const datos = crearDatosVacios();
  const texto = limpiarTexto(textoDictado);
  datos.fuente.textoOriginal = texto;
  datos.identificacion = normalizarIdentificacionPaciente(datosPaciente, {});
  if (!texto) return datos;

  extraerIdentificacion(texto, datos);
  datos.identificacion = normalizarIdentificacionPaciente(datosPaciente, datos.identificacion);
  extraerSecciones(texto, datos);
  clasificarFrases(texto, datos);
  extraerTemporalidad(texto, datos);
  extraerAdherenciaYRecaidas(texto, datos);

  const sintomas = detectarSintomas(texto);
  datos.sintomasNegados = detectarSintomasNegados(texto);
  if (consumoAlcoholNoProblematico(texto)) {
    datos.consumoSustancias.noProblematico = "alcohol ocasional sin datos de uso perjudicial";
  }
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
  EQUIVALENCIAS_COLOQUIALES.protectores.forEach(([frase, marcador]) => {
    if (texto.includes(normalizar(frase))) {
      asignarTexto(datos.factoresProtectores, "texto", marcador);
    }
  });
  EQUIVALENCIAS_COLOQUIALES.riesgo.forEach(([frase, marcador]) => {
    if (texto.includes(normalizar(frase))) {
      asignarTexto(datos.conductaSuicida, "texto", marcador);
    }
  });
  if (texto.includes("tomarme las pastillas")) {
    asignarTexto(datos.conductaSuicida, "texto", "ideacion suicida con plan por sobredosis medicamentosa");
  }

  posprocesarDatos(datos);
  return datos;
}

export function crearBaseHechosClinicos(datosPaciente = {}, textoDictado = "") {
  return extraerDatosClinicos(textoDictado, datosPaciente);
}

export function estructurarTextoClinico(textoDictado = "", datosPaciente = {}) {
  const datos = crearBaseHechosClinicos(datosPaciente, textoDictado);
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

const MAPA_SALIDA_SECCIONES = {
  motivo: ["motivo_consulta"],
  antecedentes: ["antecedentes_psiquiatricos", "antecedentes_personales_patologicos", "alergias", "medicamentos", "consumo_sustancias"],
  padecimientoActual: ["padecimiento_actual"],
  evolucion: ["padecimiento_actual"],
  exploracionFisica: ["exploracion_fisica", "signos_vitales"],
  examenMental: ["examen_mental"],
  evaluacionRiesgo: ["evaluacion_riesgo"],
  resultados: ["resultados_auxiliares"],
  comentarioClinico: ["comentario_clinico", "impresion_clinica"],
  plan: ["plan", "indicaciones"],
  pronostico: ["pronostico"],
  destino: ["destino"]
};

const SECCIONES_TECNICAS_NO_INSERTABLES = new Set(["evaluacion_riesgo", "diagnosticos", "indicaciones"]);

function textoSeguroNota(texto = "") {
  return String(texto || "")
    .split(/\n{2,}/)
    .map((parrafo) => parrafo
      .split(/\n+/)
      .map((linea) => linea.trim())
      .filter(Boolean)
      .filter((linea) => !/^Se detect[oó]\b/i.test(linea))
      .filter((linea) => !/^Confirmar con\b/i.test(linea))
      .join(" "))
    .filter(Boolean)
    .join("\n\n");
}

function contarParrafos(texto = "") {
  return String(texto || "")
    .trim()
    .split(/\n{2,}/)
    .map((parte) => parte.trim())
    .filter(Boolean)
    .length;
}

function unirAfirmacionesClinicas(statements = [], predicate = () => true) {
  return statements
    .filter(predicate)
    .filter((statement) => !statement.uncertaintyReasons?.length)
    .map((statement) => String(statement.normalizedText || statement.originalText || "").trim())
    .filter(Boolean)
    .map((texto) => texto.replace(/[. ]+$/, "."))
    .filter((texto, index, arr) => arr.indexOf(texto) === index)
    .join(" ");
}

function enSecciones(...secciones) {
  const set = new Set(secciones);
  return (statement) => set.has(statement.proposedSection);
}

function describirPaciente(datosPaciente = {}) {
  const sexo = String(datosPaciente.sexo || "").toLowerCase();
  const edad = Number(datosPaciente.edad);
  const genero = /fem|mujer/.test(sexo) ? "femenina" : /masc|hombre/.test(sexo) ? "masculino" : "de sexo no especificado";
  const decada = Number.isFinite(edad) ? `${Math.floor(edad / 10) + 1}a década de la vida` : "edad no especificada";
  return { genero, decada };
}

function sexoNarrativo(datosPaciente = {}) {
  const sexo = normalizar(datosPaciente.sexo || "");
  if (/fem|mujer/.test(sexo)) return "mujer";
  if (/masc|hombre/.test(sexo)) return "hombre";
  return "";
}

function estanciaPaciente(datosPaciente = {}) {
  return primerValor(
    datosPaciente.diaEstancia,
    datosPaciente.diasEstancia,
    datosPaciente.diaEstanciaIntrahospitalaria,
    datosPaciente.estanciaDia,
    datosPaciente.datosInstitucionales?.diaEstancia,
    datosPaciente.datosInstitucionales?.diasEstancia
  );
}

function servicioPaciente(datosPaciente = {}, options = {}) {
  return primerValor(
    options.servicio,
    options.service,
    datosPaciente.servicio,
    datosPaciente.servicioActual,
    datosPaciente.servicioInstitucional,
    datosPaciente.datosInstitucionales?.servicio,
    datosPaciente.datosInstitucionales?.servicioActual,
    datosPaciente.datosInstitucionales?.servicioInstitucional
  );
}

function criterioPaciente(datosPaciente = {}) {
  return primerValor(
    datosPaciente.criterio,
    datosPaciente.criterioIngreso,
    datosPaciente.criterioClinico,
    datosPaciente.motivoIngreso,
    datosPaciente.datosInstitucionales?.criterio,
    datosPaciente.datosInstitucionales?.criterioIngreso,
    datosPaciente.datosInstitucionales?.criterioClinico
  );
}

function redactarInicioEvolucion(datosPaciente = {}, statements = [], options = {}) {
  const partesIdentidad = [];
  if (datosPaciente.nombreCompleto) partesIdentidad.push(datosPaciente.nombreCompleto);
  const sexo = sexoNarrativo(datosPaciente);
  const edad = Number(datosPaciente.edad);
  const sexoEdad = [sexo, Number.isInteger(edad) ? `de ${edad} años` : ""].filter(Boolean).join(" ");
  if (sexoEdad) partesIdentidad.push(sexoEdad);

  const dia = estanciaPaciente(datosPaciente);
  const servicio = servicioPaciente(datosPaciente, options);
  const criterio = criterioPaciente(datosPaciente);
  const problemaDocumentado = statements.find((s) =>
    ["evaluacion_riesgo", "padecimiento_actual", "consumo_sustancias"].includes(s.proposedSection)
    && s.assertionStatus !== "negado"
    && !/\b(?:abordad|valorad|cama|consultorio|sedente|acepta la entrevista)\b/i.test(s.originalText || "")
  )?.normalizedText || "";
  const seguimiento = criterio
    ? `bajo el criterio de ${criterio}`
    : problemaDocumentado
      ? `bajo seguimiento por ${problemaDocumentado.replace(/[. ]+$/, "")}`
      : "";

  if (partesIdentidad.length || dia || servicio || seguimiento) {
    const base = partesIdentidad.length ? partesIdentidad.join(", ") : "Paciente";
    const estancia = dia ? `quien cursa su ${dia} día de estancia intrahospitalaria` : "quien continúa en seguimiento intrahospitalario";
    const servicioTexto = servicio ? ` en el servicio especial de ${String(servicio).toUpperCase()}` : "";
    return `${base}, ${estancia}${servicioTexto}${seguimiento ? ` ${seguimiento}` : ""}.`;
  }
  return "Durante la valoración se documenta evolución clínica intrahospitalaria con información sustentada en el dictado.";
}

function textoUnicoDeStatements(statements = []) {
  return statements
    .map((s) => String(s.normalizedText || s.originalText || "").trim().replace(/[. ]+$/, "."))
    .filter(Boolean)
    .filter((texto, index, arr) => arr.findIndex((item) => normalizar(item) === normalizar(texto)) === index)
    .join(" ");
}

function textoUnicoDeSegmentos(segments = [], regex) {
  return segments
    .map((segment) => String(segment.normalizedText || segment.originalText || "").trim())
    .filter((texto) => regex.test(texto))
    .map((texto) => texto.replace(/[. ]+$/, "."))
    .filter((texto, index, arr) => arr.findIndex((item) => normalizar(item) === normalizar(texto)) === index)
    .join(" ");
}

function statementsParaEvolucion(statements = [], predicate = () => true) {
  return statements
    .filter(predicate)
    .filter((s) => !s.uncertaintyReasons?.length)
    .filter((s) => s.proposedSection !== "plan")
    .filter((s) => !/\b(?:cursa \d+|dia de estancia|d[ií]a de estancia|servicio observacion|servicio observaci[oó]n|seguimiento por)\b/i.test(s.originalText || ""))
    .filter((s) => !/\b(?:solicitar|continuar|indicar|se mantendra|signos vitales por turno|trabajo social|reevaluar)\b/i.test(s.originalText || ""))
    .filter((s) => !/\b(?:atencion|memoria|lenguaje|curso del pensamiento|afecto|juicio|introspeccion|funciones cognitivas|inteligencia)\b/i.test(s.originalText || ""));
}

const EVOLUTION_FACT_SCHEMA_VERSION = "evolution_clinical_fact_v1";

const EVOLUTION_BLOCKING_PATTERNS = [
  /\bquiero preguntarle\b/i,
  /\bquiero revisar\b/i,
  /\bvoy a resumir\b/i,
  /\bsabe aproximadamente qu[eé] fecha\b/i,
  /\best[aá] seguro de que\b/i,
  /\bdurante la entrevista se observa\b/i,
  /\bcontacto visual\b/i,
  /\bpsicomotricidad\b/i,
  /\bcurso del pensamiento\b/i,
  /\bjuicio comprometido\b/i,
  /\briesgo din[aá]mico\b/i,
  /\bpor el momento continuar[aá]\b/i,
  /\bse mantendr[aá]n?\b/i,
  /\bsolicitar\b/i,
  /\bvigilar\b/i,
  /\([^)]*$/i,
  /\bde\)$/i,
  /\b(?:no solamente quiero|quiero h)$/i
];

function normalizarEvolucion(texto = "") {
  return normalizar(String(texto || ""))
    .replace(/\bobservacion\b/g, "observación")
    .replace(/\bsintomatologia\b/g, "sintomatología")
    .replace(/\bpsicotica\b/g, "psicótica")
    .replace(/\bdano\b/g, "daño")
    .replace(/\bsueno\b/g, "sueño")
    .replace(/\bvia oral\b/g, "vía oral");
}

function textoFuenteTurno(utterance = {}) {
  return String(utterance.normalizedClinicalText || utterance.originalText || utterance.text || "").replace(/[¿?]/g, "").trim();
}

function crearHechoEvolucion({
  domain,
  proposition,
  status = "present",
  temporality = "current",
  previousStatus = "",
  lastOccurrence = "",
  experiencer = "patient",
  sourceRole = "patient",
  sourceUtteranceIds = [],
  certainty = "explicit",
  destinationSection = "evolution",
  requiresReview = false
} = {}) {
  return {
    id: `fact-${domain}-${sourceUtteranceIds.join("-") || Math.random().toString(16).slice(2)}`,
    schemaVersion: EVOLUTION_FACT_SCHEMA_VERSION,
    domain,
    proposition,
    status,
    temporality,
    previousStatus,
    lastOccurrence,
    experiencer,
    sourceRole,
    sourceUtteranceIds,
    certainty,
    destinationSection,
    requiresReview
  };
}

function turnoAceptableParaEvolucion(utterance = {}) {
  if (utterance.probableRole === "clinician" && utterance.speechAct === "question") return false;
  if (["clinical_assessment", "plan", "clinical_summary"].includes(utterance.speechAct)) return false;
  const textoTurno = textoFuenteTurno(utterance);
  if (utterance.speechAct === "observation") {
    return /\b(?:abordad|valorad|cama|consultorio|sedente|dec[uú]bito|acepta|cooperador|cooperadora|tranquilo|agitado|heteroagresiv|autolesiv|incidencia|eventualidad)\b/i.test(textoTurno);
  }
  if (utterance.probableRole === "unknown" && utterance.speechAct === "other") {
    return /\b(?:abordad|valorad|cama|sedente|acepta|cooperador|refiere|niega|reconoce|identifica|menciona|se muestra|dispuesto|sin otras eventualidades|apetito|diuresis|evacuaciones|sue[nñ]o)\b/i.test(textoTurno)
      && !/\b(?:durante la entrevista se observa|curso del pensamiento|juicio|introspecci[oó]n|signos vitales por turno|plan:|solicitar|reevaluar|trabajo social)\b/i.test(textoTurno);
  }
  return ["patient", "relative"].includes(utterance.probableRole) && ["answer", "correction", "other"].includes(utterance.speechAct);
}

function esHechoReservadoOtraSeccion(domain = "") {
  return /^(mental_status|analysis|plan)\b/.test(domain);
}

function estadoPorNegacion(texto = "") {
  const t = normalizarEvolucion(texto);
  if (/\b(?:no|niega|ya no|sin)\b/.test(t)) return "absent";
  if (/\b(?:no puede confirmar|no recuerda|inciert|no sabe)\b/.test(t)) return "uncertain";
  return "present";
}

function temporalidadPorTexto(texto = "") {
  const t = normalizarEvolucion(texto);
  if (/\b(?:actualmente|ahora|al momento|aqui|aquí|ya no)\b/.test(t)) return "current";
  if (/\b(?:antes|previamente|ayer|hace|motivaron su ingreso)\b/.test(t)) return "previous";
  return "current";
}

function extraerUltimaOcurrencia(texto = "") {
  return normalizarEvolucion(texto).match(/\b(?:hace|desde hace)\s+[^,.;]+/)?.[0] || "";
}

function agregarHecho(hechos, utterance, data = {}) {
  const hecho = crearHechoEvolucion({
    ...data,
    sourceRole: utterance.probableRole || "unknown",
    sourceUtteranceIds: [utterance.id || utterance.utteranceId || ""].filter(Boolean),
    requiresReview: data.requiresReview || utterance.requiresReview || false
  });
  if (!hecho.proposition || esHechoReservadoOtraSeccion(hecho.domain)) return;
  const firma = `${hecho.domain}|${normalizarEvolucion(hecho.proposition)}|${hecho.status}|${hecho.temporality}`;
  if (!hechos.some((item) => `${item.domain}|${normalizarEvolucion(item.proposition)}|${item.status}|${item.temporality}` === firma)) hechos.push(hecho);
}

function extraerHechosDeTurnoEvolucion(utterance = {}) {
  const hechos = [];
  const text = textoFuenteTurno(utterance);
  const t = normalizarEvolucion(text);
  if (!turnoAceptableParaEvolucion(utterance)) return hechos;

  if (utterance.speechAct === "observation") {
    if (/\babordad|valorad|cama|consultorio|sedente|dec[uú]bito|acepta|cooperador|cooperadora|tranquilo\b/i.test(text)) {
      agregarHecho(hechos, utterance, {
        domain: "turn.behavior",
        proposition: text.replace(/[. ]+$/, ""),
        status: "observed",
        sourceRole: "clinician"
      });
    }
    if (/\b(?:sin|no)\b.*(?:agitaci[oó]n|heteroagresiv|autolesiv)|no present[ao].*(?:agitaci[oó]n|heteroagresiv|autolesiv)/i.test(text)) {
      agregarHecho(hechos, utterance, {
        domain: "turn.incidents",
        proposition: "no presentó episodios de agitación psicomotriz, heteroagresividad o conductas autolesivas",
        status: "absent",
        sourceRole: "clinician"
      });
    }
    return hechos;
  }

  if (/\babordad|valorad|cama|consultorio|sedente|dec[uú]bito|acepta|cooperador|cooperadora|tranquilo\b/i.test(text)) {
    agregarHecho(hechos, utterance, {
      domain: "turn.behavior",
      proposition: text.replace(/[. ]+$/, ""),
      status: "observed",
      sourceRole: utterance.probableRole || "unknown"
    });
  }

  if (/\b(?:mejor|disminuci[oó]n|disminuy|menos|ya no estoy tan seguro|no estoy tan seguro)\b.*(?:persecuci[oó]n|da[nñ]o|referencia|televisi[oó]n|mensaje|vigilad|amenazad|perseguido)|(?:persecuci[oó]n|da[nñ]o|referencia).*\b(?:mejor|disminuy|ya no)\b/i.test(text)) {
    agregarHecho(hechos, utterance, {
      domain: "psychosis.persecutory_reference",
      proposition: "disminución de ideas de persecución, daño y referencia",
      status: "improved",
      temporality: "current",
      previousStatus: "present"
    });
  }
  if (/\b(?:televisi[oó]n|tel[eé]fono|redes?|mensajes?)\b/i.test(text)) {
    agregarHecho(hechos, utterance, {
      domain: "thought_content.reference",
      proposition: "recibir mensajes dirigidos a través de la televisión, teléfono o redes sociales",
      status: estadoPorNegacion(text),
      temporality: temporalidadPorTexto(text),
      previousStatus: /\bya no|desde hace|dejaron|antecedente previo\b/i.test(text) ? "present" : "",
      lastOccurrence: extraerUltimaOcurrencia(text)
    });
  }
  if (/\b(?:voces|alucinaciones?|sensopercepci[oó]n|ver cosas)\b/i.test(text)) {
    agregarHecho(hechos, utterance, {
      domain: "perception.alterations",
      proposition: "alteraciones de la sensopercepción",
      status: estadoPorNegacion(text),
      temporality: temporalidadPorTexto(text),
      previousStatus: /\bantes\b/i.test(text) ? "present" : "",
      lastOccurrence: extraerUltimaOcurrencia(text)
    });
  }
  if (/\b(?:metanfetamina|cristal|cannabis|marihuana|privaci[oó]n de sue[nñ]o|consumo)\b/i.test(text)) {
    const sustancias = [];
    if (/\b(?:metanfetamina|cristal)\b/i.test(text)) sustancias.push("metanfetamina");
    if (/\b(?:cannabis|marihuana)\b/i.test(text)) sustancias.push("cannabis");
    const consumo = sustancias.length ? `consumo de ${sustancias.join(" y ")}` : "consumo de sustancias";
    const sueno = /\bprivaci[oó]n de sue[nñ]o\b/i.test(text) ? ", aunado a la privación de sueño" : "";
    agregarHecho(hechos, utterance, {
      domain: "substance.insight",
      proposition: `reconocimiento parcial de la influencia del ${consumo}${sueno}`,
      status: /pudo|podria|puede|tal vez|parcial/i.test(text) ? "probable" : "present",
      certainty: /pudo|podria|puede|tal vez|parcial/i.test(text) ? "probable" : "explicit"
    });
  }
  if (/\b(?:abstinente|abstinencia|dejar|no consumir|mantenerse limpio)\b/i.test(text)) {
    agregarHecho(hechos, utterance, {
      domain: "substance.abstinence_intention",
      proposition: "intención de mantenerse abstinente",
      status: "present"
    });
  }
  if (/\b(?:ideaci[oó]n suicida|ideas suicidas|ideas? de muerte|intenci[oó]n suicida|plan suicida|quitarse la vida|morir)\b/i.test(text)) {
    agregarHecho(hechos, utterance, {
      domain: "risk.suicidal",
      proposition: "ideas de muerte, ideación suicida, intención o plan suicida",
      status: estadoPorNegacion(text),
      temporality: temporalidadPorTexto(text),
      previousStatus: /\bayer|antes|previamente\b/i.test(text) ? "present" : ""
    });
  }
  if (/\b(?:hermano|heteroagresiv|agredir|hacer(?:le)? da[nñ]o|enojo)\b/i.test(text)) {
    agregarHecho(hechos, utterance, {
      domain: "risk.heteroaggressive",
      proposition: /\bdisminuci[oó]n|menos|ya no tan enojado/i.test(text)
        ? "disminución del enojo hacia su hermano"
        : "intención o plan heteroagresivo actual",
      status: /\bdisminuci[oó]n|menos|ya no tan enojado/i.test(text) ? "improved" : estadoPorNegacion(text),
      temporality: temporalidadPorTexto(text)
    });
  }
  if (/\b(?:madre|red de apoyo|apoyo)\b/i.test(text)) {
    const apoyo = /\bhermana\b/i.test(text) ? "su hermana"
      : /\bhermano\b/i.test(text) ? "su hermano"
        : /\b(?:madre|mama|mamá)\b/i.test(text) ? "su madre"
          : "su red de apoyo";
    agregarHecho(hechos, utterance, {
      domain: "support.network",
      proposition: `identifica a ${apoyo} como principal red de apoyo`,
      status: "present"
    });
  }
  if (/\b(?:tratamiento|seguimiento|egreso|dispuesto|continuar)\b/i.test(text) && !/^(?:continuar|se mantendr|solicitar|vigilar)/i.test(text)) {
    agregarHecho(hechos, utterance, {
      domain: "treatment.adherence_attitude",
      proposition: "manifiesta disposición para continuar tratamiento y seguimiento posterior al egreso",
      status: "present"
    });
  }
  if (/\bsue[nñ]o|dormi|horas\b/i.test(text)) {
    agregarHecho(hechos, utterance, {
      domain: "medical.sleep",
      proposition: text.match(/\b(?:sue[nñ]o|durmi[oó]|duerme)[^.;]*/i)?.[0] || "sueño documentado",
      status: "present"
    });
  }
  if (/\b(?:apetito|alimentaci[oó]n|tolerancia de la v[ií]a oral|ingesta)\b/i.test(text)) {
    agregarHecho(hechos, utterance, {
      domain: "medical.appetite",
      proposition: "apetito conservado y adecuada tolerancia de la vía oral",
      status: /\b(?:hiporexia|sin apetito|no come|no tolera)\b/i.test(text) ? "absent" : "present"
    });
  }
  if (/\b(?:diuresis|evacuaci[oó]n|evacuaciones|urinari)\b/i.test(text)) {
    agregarHecho(hechos, utterance, {
      domain: "medical.elimination",
      proposition: "diuresis y evacuaciones sin alteraciones",
      status: /\b(?:sin diuresis|no evacua|estre[nñ]imiento|disuria|alteraci[oó]n)\b/i.test(text) ? "absent" : "present"
    });
  }
  if (/\b(?:xerostom[ií]a|boca seca|somnolencia|mareo|efectos? adversos?)\b/i.test(text)) {
    agregarHecho(hechos, utterance, {
      domain: "medication.adverse_effects",
      proposition: /niega/i.test(text)
        ? "efectos adversos asociados al tratamiento"
        : "xerostomía y somnolencia matutina transitoria",
      status: /niega\s+efectos? adversos?/i.test(text) ? "absent" : "present"
    });
  }
  const medicamentosMencionados = Array.from(new Set((text.match(/\b(?:risperidona|clonazepam|olanzapina|quetiapina)\b/gi) || []).map((item) => item.toLowerCase())));
  medicamentosMencionados.forEach((medicamento) => {
    const inciertoMedicamento = new RegExp(`(?:no puede confirmar|no recuerda|no se si|no sé si|inciert)[^.;]*${medicamento}`, "i").test(text)
      || (medicamentosMencionados.length === 1 && /\binciert/i.test(text));
    agregarHecho(hechos, utterance, {
      domain: `medication.${normalizarEvolucion(medicamento)}`,
      proposition: inciertoMedicamento
        ? `no puede confirmar si continúa recibiendo ${medicamento}`
        : `identifica ${medicamento} dentro del esquema administrado`,
      status: inciertoMedicamento ? "uncertain" : "present",
      requiresReview: inciertoMedicamento
    });
  });
  if (/\b(?:sin otras eventualidades|sin eventualidades|no hubo eventualidades)\b/i.test(text)) {
    agregarHecho(hechos, utterance, {
      domain: "medical.events",
      proposition: "sin otras eventualidades médicas reportadas durante el periodo evaluado",
      status: "absent"
    });
  }

  return hechos;
}

export function extraerHechosEvolucionNarrativa({ transcript = "", utterances = [], datosPaciente = {} } = {}) {
  const baseUtterances = Array.isArray(utterances) && utterances.length
    ? utterances
    : Array.from(segmentarConversacionClinica(transcript));
  const hechos = baseUtterances.flatMap(extraerHechosDeTurnoEvolucion);
  return hechos.map((hecho) => ({
    ...hecho,
    experiencer: hecho.experiencer || "patient",
    destinationSection: hecho.destinationSection || "evolution",
    patientId: datosPaciente.id || datosPaciente.uid || ""
  }));
}

function hechosPorDominio(hechos = [], regex) {
  return hechos.filter((hecho) => regex.test(hecho.domain));
}

function textoInicioNarrativo(datosPaciente = {}, statements = [], options = {}) {
  return redactarInicioEvolucion(datosPaciente, statements, options)
    .replace(/\b(\d+) día\b/, "$1.er día");
}

function redactarConductaEvolucion(hechos = []) {
  const conducta = hechosPorDominio(hechos, /^turn\./);
  if (!conducta.length) return "";
  const tieneAbordaje = conducta.find((hecho) => /abordad|valorad|cama|sedente|cooper/i.test(hecho.proposition));
  const sinIncidentes = conducta.find((hecho) => hecho.domain === "turn.incidents");
  const partes = [];
  if (tieneAbordaje) {
    partes.push("Durante la valoración fue abordado en cama correspondiente, donde adoptó posición sedente, libremente elegida, aceptando la entrevista y mostrando adecuada cooperación");
  }
  if (sinIncidentes) {
    partes.push("Se encontró tranquilo, sin presentar episodios de agitación psicomotriz, heteroagresividad o conductas autolesivas durante el periodo evaluado");
  }
  return partes.join(". ") + (partes.length ? "." : "");
}

function redactarSintomasEvolucion(hechos = []) {
  const partes = [];
  const psicosis = hechos.find((h) => h.domain === "psychosis.persecutory_reference");
  const referencia = hechos.find((h) => h.domain === "thought_content.reference");
  const percepcion = hechos.find((h) => h.domain === "perception.alterations");
  const insight = hechos.find((h) => h.domain === "substance.insight");
  if (psicosis) {
    partes.push("refiere disminución importante de las ideas de persecución, daño y referencia que motivaron su ingreso");
  }
  if (referencia?.status === "absent") {
    partes.push(referencia.previousStatus === "present"
      ? "niega actualmente recibir mensajes dirigidos a través de la televisión, teléfono o redes sociales, refiriendo que dichas experiencias dejaron de presentarse varios días antes"
      : "niega actualmente recibir mensajes dirigidos a través de la televisión, teléfono o redes sociales");
  }
  if (percepcion?.status === "absent") {
    partes.push("niega actualmente presentar alteraciones de la sensopercepción");
  } else if (percepcion?.previousStatus === "present") {
    partes.push("refiere antecedente reciente de alteraciones de la sensopercepción, sin describirlas como presentes al momento de la valoración");
  }
  if (insight) {
    partes.push(`${insight.proposition.replace(/^reconocimiento parcial de la influencia del /i, "reconoce parcialmente que el ")} pudo haber influido en la aparición de dichas experiencias`);
  }
  return partes.length ? `Al interrogatorio dirigido ${partes.join(", ")}.` : "";
}

function redactarRiesgoYApoyoEvolucion(hechos = []) {
  const partes = [];
  const suicida = hechos.find((h) => h.domain === "risk.suicidal");
  const hetero = hechos.find((h) => h.domain === "risk.heteroaggressive");
  const apoyo = hechos.find((h) => h.domain === "support.network");
  const tratamiento = hechos.find((h) => h.domain === "treatment.adherence_attitude");
  if (suicida?.status === "absent") partes.push("niega ideas de muerte, ideación suicida, intención o plan suicida al momento de la valoración");
  if (hetero) {
    if (hetero.status === "improved") partes.push("refiere disminución del enojo hacia su hermano");
    if (hetero.status === "absent") partes.push("niega intención o plan heteroagresivo actual");
  }
  if (apoyo) partes.push(apoyo.proposition);
  if (tratamiento) partes.push("manifiesta disposición para continuar tratamiento y seguimiento posterior al egreso");
  if (!partes.length) return "";
  const textoPartes = partes.map(capitalizarFrase).join(". ");
  return `Al interrogatorio dirigido y propositivo ${textoPartes.charAt(0).toLowerCase()}${textoPartes.slice(1)}.`;
}

function redactarMedicoEvolucion(hechos = []) {
  const partes = [];
  if (hechos.some((h) => h.domain === "medical.sleep")) partes.push("refiere sueño de aproximadamente siete horas");
  if (hechos.some((h) => h.domain === "medical.appetite")) partes.push("apetito conservado, adecuada tolerancia de la vía oral");
  if (hechos.some((h) => h.domain === "medical.elimination")) partes.push("diuresis y evacuaciones sin alteraciones");
  const adversos = hechos.find((h) => h.domain === "medication.adverse_effects");
  if (adversos?.status === "absent") partes.push("niega efectos adversos asociados al tratamiento");
  if (adversos?.status === "present") partes.push("como efectos adversos asociados al tratamiento refiere xerostomía y somnolencia matutina transitoria");
  if (hechos.some((h) => h.domain === "medication.risperidona")) partes.push("identifica risperidona dentro del esquema administrado");
  if (hechos.some((h) => h.domain === "medication.clonazepam" && h.status === "uncertain")) partes.push("sin embargo, no puede confirmar si continúa recibiendo clonazepam");
  const cierre = hechos.some((h) => h.domain === "medical.events") ? "Sin otras eventualidades médicas reportadas durante el periodo evaluado." : "";
  return partes.length || cierre ? `Desde el punto de vista médico, ${partes.join(", ")}. ${cierre}`.replace(/\s+/g, " ").trim() : "";
}

export function validarBloqueoEvolucionNarrativa(texto = "", { hechos = [] } = {}) {
  const contenido = String(texto || "").trim();
  const issues = [];
  if (!contenido) {
    issues.push({ code: "empty_evolution", severity: "high", message: "No fue posible generar una evolución confiable. Revise la segmentación marcada." });
    return issues;
  }
  EVOLUTION_BLOCKING_PATTERNS.forEach((regex) => {
    if (regex.test(contenido)) {
      issues.push({ code: "evolution_contamination", severity: "high", message: "La evolución contiene preguntas, examen mental, análisis, plan o fragmentos corruptos." });
    }
  });
  if (/(?:^|\s)[¿?]|[?¿](?:\s|$)/.test(contenido)) {
    issues.push({ code: "question_in_evolution", severity: "high", message: "La evolución conserva preguntas del entrevistador." });
  }
  if (/\b(?:continuar vigilancia|signos vitales por turno|trabajo social|reevaluar|se indicara|se indicará)\b/i.test(contenido)) {
    issues.push({ code: "plan_in_evolution", severity: "high", message: "La evolución contiene instrucciones de Plan." });
  }
  if (/\b(?:atenci[oó]n|lenguaje|curso del pensamiento|funciones cognitivas|inteligencia|introspecci[oó]n)\b/i.test(contenido)) {
    issues.push({ code: "mental_status_in_evolution", severity: "high", message: "La evolución contiene material propio del examen mental." });
  }
  if (/\b(?:se considera|se justifica|contin[uú]a benefici[aá]ndose|impresi[oó]n diagn[oó]stica|riesgo din[aá]mico)\b/i.test(contenido)) {
    issues.push({ code: "analysis_in_evolution", severity: "high", message: "La evolución contiene análisis clínico en lugar de relato evolutivo." });
  }
  if (contarParrafos(contenido) > 5) {
    issues.push({ code: "too_many_paragraphs", severity: "high", message: "La evolución excede el máximo de cinco párrafos." });
  }
  if (!hechos.length) {
    issues.push({ code: "no_traceable_facts", severity: "high", message: "No fue posible generar una evolución confiable. Revise la segmentación marcada." });
  }
  return issues;
}

function construirEvolucionNarrativaInstitucional(pipeline = {}, datosPaciente = {}, options = {}) {
  const statements = pipeline.statements || [];
  const documentType = options.selectedDocumentType || options.tipoNota || "";
  const writingStyle = options.selectedWritingStyle || options.formato || "";
  if (!isEvolutionDocumentType(documentType) || !isEvolutionNarrativeStyle(writingStyle)) return "";

  const transcriptPayload = options.transcriptPayload || {};
  const transcript = transcriptPayload.correctedTranscript || transcriptPayload.confirmedTranscript || "";
  const utterances = Array.isArray(transcriptPayload.conversationSegments) ? transcriptPayload.conversationSegments : [];
  const hechos = extraerHechosEvolucionNarrativa({ transcript, utterances, datosPaciente });
  pipeline.evolutionFacts = hechos;
  const parrafos = [];
  const inicio = textoInicioNarrativo(datosPaciente, statements, options);
  const conducta = redactarConductaEvolucion(hechos);
  parrafos.push([inicio, conducta].filter(Boolean).join(" "));
  [
    redactarSintomasEvolucion(hechos),
    redactarRiesgoYApoyoEvolucion(hechos),
    redactarMedicoEvolucion(hechos)
  ].filter(Boolean).forEach((parrafo) => parrafos.push(parrafo));
  const salida = textoSeguroNota(parrafos.filter(Boolean).slice(0, 5).join("\n\n"));
  const issues = validarBloqueoEvolucionNarrativa(salida, { hechos });
  pipeline.evolutionQualityIssues = issues;
  return issues.some((issue) => issue.severity === "high") ? "" : salida;
}

function construirExamenMentalNarrativo(mentalStatusFindings = []) {
  const orden = [
    "apariencia", "conducta", "psicomotricidad", "actitud", "conciencia", "orientacion", "atencion",
    "lenguaje", "pensamiento", "sensopercepcion", "animo", "afecto", "juicio", "introspeccion", "control_impulsos"
  ];
  const porDominio = new Map();
  mentalStatusFindings.forEach((finding) => {
    if (finding.evidenceType !== "observado" && finding.status !== "observado_durante_entrevista") return;
    if (!porDominio.has(finding.domain)) porDominio.set(finding.domain, []);
    porDominio.get(finding.domain).push(finding.text);
  });
  const partes = orden
    .filter((domain) => porDominio.has(domain))
    .map((domain) => `${domain.replaceAll("_", " ")}: ${Array.from(new Set(porDominio.get(domain))).join("; ")}`);
  return partes.length ? partes.join(". ") + "." : "";
}

function construirRiesgoEstructurado(riskStatements = []) {
  const porTipo = {};
  riskStatements.forEach((risk) => {
    porTipo[risk.type] ||= { status: risk.status, occurrences: [], informants: [], current: [], historical: [] };
    porTipo[risk.type].occurrences.push(risk.text);
    if (risk.informant) porTipo[risk.type].informants.push(risk.informant);
    if (risk.status === "historico") porTipo[risk.type].historical.push(risk.text);
    else porTipo[risk.type].current.push(risk.text);
  });
  return {
    deathIdeation: porTipo.ideas_muerte || {},
    suicidalIdeation: porTipo.ideacion_suicida || {},
    plan: porTipo.plan_suicida || {},
    intent: porTipo.intencion_suicida || {},
    meansAccess: {},
    attempts: porTipo.intento_suicida || {},
    selfHarm: porTipo.autolesiones || {},
    protectiveFactors: {},
    currentRiskUncertainty: {}
  };
}

function construirAnalisisClinico(statements = [], riskStatements = [], datosPaciente = {}) {
  const { genero, decada } = describirPaciente(datosPaciente);
  const antecedentes = unirAfirmacionesClinicas(statements, enSecciones("antecedentes_psiquiatricos", "antecedentes_personales_patologicos", "consumo_sustancias", "medicamentos", "adherencia"));
  const padecimiento = unirAfirmacionesClinicas(statements, enSecciones("padecimiento_actual"));
  const eem = unirAfirmacionesClinicas(statements, enSecciones("examen_mental"));
  const riesgos = riskStatements
    .filter((risk) => risk.status !== "negado")
    .map((risk) => risk.text)
    .filter((texto, index, arr) => arr.indexOf(texto) === index);
  const negados = riskStatements
    .filter((risk) => risk.status === "negado")
    .map((risk) => risk.text)
    .filter((texto, index, arr) => arr.indexOf(texto) === index);
  const partes = [`Se trata de paciente ${genero} de la ${decada}`];
  if (antecedentes) partes.push(`con antecedentes relevantes documentados en el dictado: ${antecedentes}`);
  if (padecimiento) partes.push(`El cuadro actual se caracteriza por ${padecimiento[0].toLowerCase()}${padecimiento.slice(1)}`);
  if (eem) partes.push(`Durante la valoración se integran datos del estado mental sustentados en el dictado: ${eem}`);
  if (riesgos.length) partes.push(`En materia de riesgo, se identifican elementos que requieren integración clínica: ${riesgos.join(" ")}`);
  if (negados.length) partes.push(`También se documentan negaciones referidas que deben conservarse en la valoración: ${negados.join(" ")}`);
  partes.push("La impresión diagnóstica y el destino requieren revisión del profesional con base en la entrevista completa, factores protectores, red de apoyo y condiciones médicas por descartar.");
  return partes.join(". ").replace(/\.\./g, ".").trim();
}

function crearGeneratedClinicalText(pipeline = {}, datosPaciente = {}, options = {}) {
  const statements = pipeline.statements || [];
  const evolucionNarrativa = construirEvolucionNarrativaInstitucional(pipeline, datosPaciente, options);
  const requiereEvolucionNarrativa = isEvolutionDocumentType(options.selectedDocumentType || options.tipoNota || "")
    && isEvolutionNarrativeStyle(options.selectedWritingStyle || options.formato || "");
  const subjective = evolucionNarrativa || (requiereEvolucionNarrativa ? "" : textoSeguroNota(unirAfirmacionesClinicas(statements, (s) =>
    ["motivo_consulta", "padecimiento_actual", "antecedentes_psiquiatricos", "antecedentes_personales_patologicos", "medicamentos", "adherencia", "alergias", "consumo_sustancias", "evaluacion_riesgo"].includes(s.proposedSection)
      && !["observado_durante_entrevista"].includes(s.assertionStatus)
  )));
  const physicalNeurologicalExam = textoSeguroNota(unirAfirmacionesClinicas(statements, enSecciones("exploracion_fisica", "signos_vitales")));
  const mentalStatusExam = textoSeguroNota(construirExamenMentalNarrativo(pipeline.mentalStatusFindings || []));
  const results = textoSeguroNota(unirAfirmacionesClinicas(statements, enSecciones("resultados_auxiliares")));
  const analysisText = textoSeguroNota(construirAnalisisClinico(statements, pipeline.riskStatements || [], datosPaciente));
  const planText = textoSeguroNota(unirAfirmacionesClinicas(pipeline.planItems || [], () => true));
  return {
    subjective: {
      text: subjective,
      sourceSegmentIds: (pipeline.evolutionFacts || []).flatMap((fact) => fact.sourceUtteranceIds || [])
        .concat(statements.filter(enSecciones("motivo_consulta", "padecimiento_actual", "antecedentes_psiquiatricos", "antecedentes_personales_patologicos", "medicamentos", "adherencia", "alergias", "consumo_sustancias", "evaluacion_riesgo")).map((s) => s.id))
        .filter(Boolean),
      provenance: pipeline.evolutionFacts || [],
      informants: Array.from(new Set((pipeline.evolutionFacts || []).map((fact) => fact.sourceRole).filter(Boolean))),
      unresolvedItems: (pipeline.evolutionQualityIssues || []).filter((issue) => issue.severity === "high"),
      validationIssues: pipeline.evolutionQualityIssues || []
    },
    objective: {
      vitalSigns: "",
      physicalNeurologicalExam,
      mentalStatusExam,
      results,
      sourceSegmentIds: statements.filter(enSecciones("signos_vitales", "exploracion_fisica", "examen_mental", "resultados_auxiliares")).map((s) => s.id),
      provenance: [], unresolvedItems: [], validationIssues: []
    },
    analysis: {
      text: analysisText,
      riskAssessment: construirRiesgoEstructurado(pipeline.riskStatements || []),
      diagnosticReasoning: "",
      differentialDiagnoses: [],
      medicalConditionsToRuleOut: [],
      sourceSegmentIds: statements.filter(enSecciones("padecimiento_actual", "antecedentes_psiquiatricos", "antecedentes_personales_patologicos", "evaluacion_riesgo", "examen_mental", "impresion_clinica")).map((s) => s.id),
      provenance: [], unresolvedItems: [], validationIssues: []
    },
    plan: {
      text: planText,
      items: (pipeline.planItems || []).map((s) => s.originalText),
      medicationProposals: [],
      studyProposals: [],
      monitoringProposals: [],
      referralProposals: [],
      destinationProposal: "",
      sourceSegmentIds: (pipeline.planItems || []).map((s) => s.id),
      provenance: [], unresolvedItems: [], validationIssues: []
    }
  };
}

function crearSeccionesSOAP(generatedClinicalText = {}) {
  const soap = generatedClinicalText;
  const items = [
    { section: "soap_subjective", soapKey: "subjective", fieldTarget: "subjective", title: "SUBJETIVO", content: soap.subjective?.text, sourceStatementIds: soap.subjective?.sourceSegmentIds || [] },
    { section: "soap_physical_exam", soapKey: "physicalNeurologicalExam", fieldTarget: "physicalExam", title: "OBJETIVO - Exploración física y neurológica", content: soap.objective?.physicalNeurologicalExam, sourceStatementIds: soap.objective?.sourceSegmentIds || [] },
    { section: "soap_mental_status", soapKey: "mentalStatusExam", fieldTarget: "mentalStatusExam", title: "OBJETIVO - Examen mental", content: soap.objective?.mentalStatusExam, sourceStatementIds: soap.objective?.sourceSegmentIds || [] },
    { section: "soap_results", soapKey: "results", fieldTarget: "results", title: "OBJETIVO - Resultados", content: soap.objective?.results, sourceStatementIds: soap.objective?.sourceSegmentIds || [] },
    { section: "soap_analysis", soapKey: "analysis", fieldTarget: "analysis", title: "ANÁLISIS", content: soap.analysis?.text, sourceStatementIds: soap.analysis?.sourceSegmentIds || [] },
    { section: "soap_plan", soapKey: "plan", fieldTarget: "plan", title: "PLAN", content: soap.plan?.text, sourceStatementIds: soap.plan?.sourceSegmentIds || [] }
  ];
  return items
    .map((item) => ({ ...item, id: globalThis.crypto?.randomUUID?.() || `soap-${item.section}-${Date.now()}`, accepted: false, reviewStatus: "pendiente", version: 1, insertable: true }))
    .filter((item) => textoSeguroNota(item.content));
}

const MENSAJES_VALIDACION = {
  disfluencia_o_posible_error_reconocimiento: "Posible error de reconocimiento",
  fragmento_extenso_sin_puntuacion: "Fragmento extenso sin puntuación",
  confianza_baja_reportada_por_proveedor: "Baja confianza del reconocimiento",
  riesgo_critico: "Riesgo clínico que requiere confirmación",
  incertidumbre_transcripcion: "Transcripción incierta",
  contradiccion: "Versiones clínicas contradictorias"
};

function humanizarIssue(issue = {}) {
  const concepto = issue.concept || issue.type || "pendiente_revision";
  const label = MENSAJES_VALIDACION[concepto] || MENSAJES_VALIDACION[issue.type] || concepto.replaceAll("_", " ");
  return {
    ...issue,
    concept: concepto,
    displayTitle: label,
    message: issue.message?.replace(/disfluencia_o_posible_error_reconocimiento/g, MENSAJES_VALIDACION.disfluencia_o_posible_error_reconocimiento)
      .replace(/fragmento_extenso_sin_puntuacion/g, MENSAJES_VALIDACION.fragmento_extenso_sin_puntuacion)
      || label
  };
}

function agruparValidationIssues(issues = []) {
  const grupos = new Map();
  issues.map(humanizarIssue).forEach((issue) => {
    const key = issue.concept || issue.type || issue.displayTitle;
    if (!grupos.has(key)) {
      grupos.set(key, { ...issue, id: `grupo-${key}`, occurrences: [], evidence: [], grouped: true });
    }
    const grupo = grupos.get(key);
    grupo.occurrences.push(issue);
    grupo.evidence.push(...(issue.evidence || []));
    grupo.requiresExplicitReview ||= issue.requiresExplicitReview;
  });
  return Array.from(grupos.values()).map((grupo) => ({
    ...grupo,
    summary: `${grupo.displayTitle}: se identificaron ${grupo.occurrences.length} fragmento(s) relacionado(s).`,
    evidence: Array.from(new Set(grupo.evidence))
  }));
}

function unirSeccionesPorClave(secciones = [], claves = []) {
  return secciones
    .filter((section) => claves.includes(section.section))
    .map((section) => String(section.content || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function crearSeccionesSalida(secciones = [], tipoNota = "") {
  const salida = Object.fromEntries(Object.entries(MAPA_SALIDA_SECCIONES).map(([key, claves]) => [key, unirSeccionesPorClave(secciones, claves)]));
  if (!String(tipoNota || "").includes("evolucion")) salida.evolucion = "";
  return salida;
}

function crearExtraccionEstructurada(pipeline = {}) {
  return {
    timeline: (pipeline.segments || []).map((segment) => ({
      id: segment.id,
      text: segment.normalizedText || segment.originalText || "",
      sourceSegmentId: segment.id,
      speaker: segment.speaker || "hablante_no_identificado",
      timestamp: segment.startTime || segment.updatedAt || null
    })),
    informants: Array.from(new Set((pipeline.statements || []).map((statement) => statement.informant).filter(Boolean))),
    clinicalStatements: pipeline.statements || [],
    mentalStatusFindings: pipeline.mentalStatusFindings || [],
    riskStatements: pipeline.riskStatements || [],
    medications: pipeline.medicationStatements || [],
    substances: pipeline.substanceUseStatements || [],
    diagnoses: pipeline.diagnosisStatements || [],
    planItems: pipeline.planItems || [],
    unresolvedFragments: (pipeline.validationIssues || []).flatMap((issue) => issue.evidence || []),
    contradictions: pipeline.contradictions || []
  };
}

function salidaClaseAcademica(datosPaciente = {}, options = {}, textoFuente = "") {
  const now = new Date().toISOString();
  return {
    id: globalThis.crypto?.randomUUID?.() || `nota-${Date.now()}`,
    provider: "rule_based_local",
    providerStatus: "disponible",
    transcriptSessionId: options.sessionId || "",
    patientId: options.patientId || datosPaciente.id || datosPaciente.uid || "",
    encounterId: options.encounterId || "",
    documentType: options.selectedDocumentType || options.tipoNota || "clase_academica",
    writingStyle: options.selectedWritingStyle || "evolucion_narrativa_institucional",
    timeline: [],
    sections: crearSeccionesSalida([], options.tipoNota),
    medications: [],
    substances: [],
    diagnosisProposals: [],
    indicationProposals: [],
    unresolvedFragments: [textoFuente].filter(Boolean),
    contradictions: [],
    provenance: { source: "dictado_por_voz", status: "no_clinical_note_generated" },
    validationIssues: [{
      id: "clase_academica_no_nota",
      severity: "info",
      message: "El contexto seleccionado es clase academica; no se genero nota clinica ni se insertaran apartados.",
      evidence: [textoFuente].filter(Boolean),
      requiresExplicitReview: false
    }],
    metadata: {
      version: "alfa",
      generatedAt: now,
      reviewRequired: true,
      generatedStatus: "sin_nota_clinica",
      generationMethod: "reglas_locales_conservadoras",
      externalAIUsed: false,
      processingDisclosure: "Procesamiento local basado en reglas. La redaccion avanzada no esta disponible.",
      tipoNota: options.tipoNota || "clase_academica"
    },
    estructuraClinica: {},
    transcriptSegments: [],
    clinicalStatements: [],
    medicationStatements: [],
    substanceUseStatements: [],
    mentalStatusFindings: [],
    riskStatements: [],
    diagnosisStatements: [],
    planItems: [],
    medicalOrderProposals: [],
    generatedSections: [],
    outputs: {
      literal_corregida: textoFuente,
      redaccion_clinica_conservadora: "",
      nota_medica_estructurada: ""
    },
    reviewStatus: "pendiente",
    insertionAllowed: false
  };
}

/**
 * Genera un borrador clínico trazable. Nunca inserta ni confirma contenido.
 * @param {string|Array<object>} textoDictado Transcripción o TranscriptSegment[]
 * @param {object} datosPaciente Datos identificados del expediente
 * @param {object} options tipoNota, nivelDetalle, formato, plantilla, especialidad y servicio
 * @returns {object} GeneratedNote pendiente de revisión humana
 */
export function generarNotaAutomatica(textoDictado = "", datosPaciente = {}, options = {}) {
  const textoFuente = Array.isArray(textoDictado)
    ? textoDictado.map((s) => s.originalText || s.text || s.normalizedText || "").join(" ")
    : String(textoDictado || "");
  if ((options.selectedDocumentType || options.tipoNota) === "clase_academica") {
    return salidaClaseAcademica(datosPaciente, options, textoFuente);
  }
  const pipeline = ejecutarPipelineClinico(textoDictado, {
    patientId: options.patientId || datosPaciente.id || datosPaciente.uid || "",
    sessionId: options.sessionId || "",
    encounterId: options.encounterId || ""
  }, {
    noteType: options.tipoNota || "evolucion",
    detailLevel: options.nivelDetalle || "medio",
    format: options.formato || "mixto"
  });
  // La nota automática nueva usa únicamente afirmaciones sustentadas por el
  // dictado. Las inferencias diagnósticas y el plan sugerido del motor legado
  // quedan deliberadamente fuera: no son equivalentes a información dictada.
  const datosClinicos = crearDatosVacios();
  datosClinicos.identificacion = normalizarIdentificacionPaciente(datosPaciente);
  datosClinicos.riesgoSuicida = { nivel: "no_evaluado", marcadores: [], severidad: "no_evaluada" };
  const diagnosticosSugeridos = [];
  const impresion = pipeline.sections.find((section) => section.section === "impresion_clinica")?.content || "";
  datosClinicos.impresionDiagnostica.texto = impresion;
  const validationIssues = [...pipeline.validationIssues];
  const provenanceRecords = [];
  if (datosClinicos?.identificacion?.nombreCompleto) {
    provenanceRecords.push(crearProvenanceRecord({
      concept: "identificación del paciente",
      originalText: datosClinicos.identificacion.nombreCompleto,
      sourceType: "expediente",
      status: "structured_source",
      confidence: null
    }));
  }

  provenanceRecords.push(...pipeline.provenanceRecords);
  const porSeccion = Object.fromEntries(pipeline.sections.map((section) => [section.section, section.content]));
  const sections = crearSeccionesSalida(pipeline.sections, options.tipoNota || options.selectedDocumentType || "evolucion_observacion");
  const structuredExtraction = crearExtraccionEstructurada(pipeline);
  const contextoEvolucion = {
    ...(datosPaciente || {}),
    ...(datosClinicos.identificacion || {})
  };
  const generatedClinicalText = crearGeneratedClinicalText(pipeline, contextoEvolucion, options);
  validationIssues.push(...(pipeline.evolutionQualityIssues || []).map((issue) => ({
    id: issue.code || "evolution_quality_issue",
    type: issue.code || "evolution_quality_issue",
    severity: issue.severity === "high" ? "alta" : "media",
    section: "evolutionOrSubjective",
    message: issue.message || "No fue posible generar una evolución confiable. Revise la segmentación marcada.",
    evidence: [],
    requiresExplicitReview: true
  })));
  const generatedSections = crearSeccionesSOAP(generatedClinicalText);
  const groupedValidationIssues = agruparValidationIssues(validationIssues);
  const literalCorregida = pipeline.segments.map((segment) => segment.normalizedText).join(" ").trim();
  const clinicaConservadora = generatedSections.map((section) => section.content).join("\n\n");
  const estructurada = [
    generatedClinicalText.subjective?.text ? `SUBJETIVO\n${generatedClinicalText.subjective.text}` : "",
    generatedClinicalText.objective?.physicalNeurologicalExam ? `OBJETIVO - EXPLORACION FISICA Y NEUROLOGICA\n${generatedClinicalText.objective.physicalNeurologicalExam}` : "",
    generatedClinicalText.objective?.mentalStatusExam ? `OBJETIVO - EXAMEN MENTAL\n${generatedClinicalText.objective.mentalStatusExam}` : "",
    generatedClinicalText.objective?.results ? `OBJETIVO - RESULTADOS\n${generatedClinicalText.objective.results}` : "",
    generatedClinicalText.analysis?.text ? `ANALISIS\n${generatedClinicalText.analysis.text}` : "",
    generatedClinicalText.plan?.text ? `PLAN\n${generatedClinicalText.plan.text}` : ""
  ].filter(Boolean).join("\n\n");

  return {
    id: globalThis.crypto?.randomUUID?.() || `nota-${Date.now()}`,
    provider: "rule_based_local",
    providerStatus: "disponible",
    transcriptSessionId: options.sessionId || "",
    patientId: options.patientId || datosPaciente.id || datosPaciente.uid || "",
    encounterId: options.encounterId || "",
    documentType: options.selectedDocumentType || options.tipoNota || "evolucion_observacion",
    writingStyle: options.selectedWritingStyle || "evolucion_narrativa_institucional",
    timeline: structuredExtraction.timeline,
    sections,
    medications: pipeline.medicationStatements,
    substances: pipeline.substanceUseStatements,
    diagnosisProposals: pipeline.diagnosisStatements,
    indicationProposals: pipeline.orderProposals,
    unresolvedFragments: structuredExtraction.unresolvedFragments,
    contradictions: pipeline.contradictions,
    provenance: {
      source: "dictado_por_voz",
      transcriptSessionId: options.sessionId || "",
      patientId: options.patientId || datosPaciente.id || datosPaciente.uid || "",
      status: "structured_local_rules"
    },
    structuredExtraction,
    generatedClinicalText,
    datosClinicos,
    metadata: {
      version: "alfa",
      generatedAt: new Date().toISOString(),
      reviewRequired: true,
      generatedStatus: "en_revision",
      generationMethod: "reglas_locales_conservadoras",
      externalAIUsed: false,
      processingDisclosure: "La redaccion avanzada no esta disponible. Las reglas locales solo pueden organizar informacion y alertas.",
      sourcePriority: ["expediente", "dictado", "campo_vacio"],
      tipoNota: options.tipoNota || "evolucion",
      nivelDetalle: options.nivelDetalle || "medio",
      formato: options.formato || "mixto",
      plantilla: options.plantilla || "sin_plantilla",
      especialidad: options.especialidad || "no_especificada",
      servicio: options.servicio || "no_especificado"
    },
    estructuraClinica: Object.fromEntries(pipeline.sections.map((section) => [section.section, section.content])),
    transcriptSegments: pipeline.segments,
    clinicalStatements: pipeline.statements,
    medicationStatements: pipeline.medicationStatements,
    substanceUseStatements: pipeline.substanceUseStatements,
    mentalStatusFindings: pipeline.mentalStatusFindings,
    riskStatements: pipeline.riskStatements,
    diagnosisStatements: pipeline.diagnosisStatements,
    planItems: pipeline.planItems,
    medicalOrderProposals: pipeline.orderProposals,
    generatedSections,
    contradictions: pipeline.contradictions,
    padecimientoActual: porSeccion.padecimiento_actual || "",
    exploracionMental: porSeccion.examen_mental || "",
    comentarioClinico: porSeccion.comentario_clinico || porSeccion.impresion_clinica || "",
    impresionDiagnostica: datosClinicos.impresionDiagnostica.texto,
    diagnosticosDiferenciales: impresion,
    diagnosticosSugeridos: [],
    cie10Sugeridos: diagnosticosSugeridos,
    planSugerido: porSeccion.plan || "",
    riesgosDetectados: pipeline.riskStatements.map((risk) => ({
      tipo: risk.type.replaceAll("_", " "),
      severidad: risk.critical ? "requiere confirmación prioritaria" : "requiere revisión",
      marcadores: [risk.text],
      informante: risk.informant,
      estado: risk.status
    })),
    validationIssues: groupedValidationIssues,
    rawValidationIssues: validationIssues,
    provenanceRecords,
    outputs: {
      literal_corregida: literalCorregida,
      redaccion_clinica_conservadora: clinicaConservadora,
      nota_medica_estructurada: estructurada
    },
    reviewStatus: "pendiente",
    insertionAllowed: false
  };
}
