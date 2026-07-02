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
  depresion: ["tristeza", "anhedonia", "culpa", "desesperanza", "llanto", "apatia", "hiporexia", "insomnio", "hipersomnia", "ideas de muerte", "ideacion suicida", "suicida"],
  ansiedad: ["ansiedad", "preocupacion excesiva", "preocupacion", "inquietud", "tension", "crisis de panico", "ataque de panico", "palpitaciones", "miedo intenso"],
  psicosis: ["alucinaciones", "alucinacion", "delirios", "delirio", "voces", "escucha voces", "ideas delirantes", "paranoide", "desorganizacion", "conducta extrana"],
  mania: ["euforia", "verborrea", "disminucion de sueno", "grandiosidad", "fuga de ideas", "irritabilidad", "hiperactividad", "gasto excesivo"],
  personalidadLimite: ["autolesiones", "impulsividad", "abandono", "relaciones inestables", "vacio", "ira", "inestabilidad emocional"],
  sustancias: ["cristal", "metanfetamina", "cannabis", "marihuana", "alcohol", "inhalantes", "cocaina", "benzodiacepinas", "sedantes"],
  trauma: ["trauma", "abuso", "pesadillas", "hipervigilancia", "evitacion", "reexperimentacion", "flashbacks"],
  esquizofreniaCurso: ["mas de 6 meses", "seis meses", "deterioro funcional", "sintomas negativos", "lenguaje desorganizado", "conducta desorganizada", "persistente"]
};

function normalizar(texto = "") {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function estaNegado(texto, indice) {
  const contexto = texto.slice(Math.max(0, indice - 42), indice);
  return /(niega|negando|sin|no presenta|no refiere|no se observan|no se identifican|descarta)\s+([\w\s,;:.]{0,24})$/.test(contexto);
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

function agregarDx(lista, codigo, razon, certeza = "probable") {
  const existente = lista.find((dx) => dx.codigo === codigo);
  if (existente) return;
  lista.push({
    codigo,
    nombre: CIE10_BASE[codigo] || "",
    catalogo: "CIE-10",
    texto: `${codigo} - ${CIE10_BASE[codigo] || ""}`.trim(),
    certeza,
    razon,
    sugerido: true
  });
}

export function detectarSintomas(textoDictado = "") {
  const texto = normalizar(textoDictado);
  return Object.fromEntries(
    Object.entries(REGLAS_SINTOMAS).map(([grupo, terminos]) => [grupo, contiene(texto, terminos)])
  );
}

export function detectarRiesgoSuicida(textoDictado = "") {
  const texto = normalizar(textoDictado);
  const marcadores = contiene(texto, [
    "ideas suicidas",
    "ideacion suicida",
    "plan suicida",
    "intento suicida",
    "autolesiones",
    "se quiere morir",
    "quitarse la vida",
    "desesperanza"
  ]);

  return marcadores.length
    ? [{ tipo: "Riesgo suicida", marcadores, severidad: marcadores.some((m) => m.includes("plan") || m.includes("intento")) ? "alto" : "a valorar" }]
    : [];
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
  const hayCursoEsquizofrenia = sintomas.esquizofreniaCurso?.length >= 2;

  if (hayDepresion && hayPsicosis) {
    agregarDx(diagnosticos, "F32.3", "Sintomas afectivos depresivos con sintomas psicoticos; valorar recurrencia y contexto longitudinal.", "probable/a descartar");
    agregarDx(diagnosticos, "F31.5", "Diagnostico diferencial afectivo con sintomas psicoticos si existe antecedente bipolar.", "diferencial");
  } else if (hayDepresion) {
    const codigo = riesgos.length ? "F32.2" : "F32.1";
    agregarDx(diagnosticos, codigo, "Sintomatologia afectiva depresiva detectada en dictado.", "probable");
    agregarDx(diagnosticos, codigo === "F32.2" ? "F33.2" : "F33.1", "Considerar si hay episodios depresivos previos documentados.", "diferencial");
  }

  if (hayAnsiedad) agregarDx(diagnosticos, hayPanico ? "F41.0" : "F41.1", "Sintomas ansiosos referidos.", "probable");
  if (hayPsicosis) agregarDx(diagnosticos, hayCursoEsquizofrenia ? "F20.0" : "F29", hayCursoEsquizofrenia ? "Datos de curso persistente y deterioro funcional a corroborar." : "Sintomas psicoticos sin duracion clara; sugerir sindrome psicotico a estudio.", hayCursoEsquizofrenia ? "a descartar" : "probable/a estudio");
  if (hayMania) agregarDx(diagnosticos, hayPsicosis ? "F31.2" : "F31.1", "Sintomas maniformes detectados; evitar sugerir antidepresivo sin valorar bipolaridad.", "probable/a descartar");
  if (hayTrauma) agregarDx(diagnosticos, "F43.1", "Sintomas postraumaticos referidos.", "probable");

  if (sintomas.personalidadLimite?.length >= 3) {
    agregarDx(diagnosticos, "F60.3", "Rasgos de personalidad a valorar; no constituye diagnostico definitivo sin patron persistente y longitudinal.", "rasgos a valorar");
  }

  if (haySustancias) {
    const texto = sintomas.sustancias.join(" ");
    if (texto.includes("alcohol")) agregarDx(diagnosticos, "F10.1", "Consumo de alcohol referido.", "probable/a valorar");
    if (texto.includes("cannabis") || texto.includes("marihuana")) agregarDx(diagnosticos, "F12.1", "Consumo de cannabinoides referido.", "probable/a valorar");
    if (texto.includes("cristal") || texto.includes("metanfetamina") || texto.includes("cocaina")) agregarDx(diagnosticos, "F15.1", "Consumo de estimulantes referido.", "probable/a valorar");
    agregarDx(diagnosticos, "F19.1", "Diagnostico diferencial por multiples sustancias si hay policonsumo.", "diferencial");
  }

  return diagnosticos;
}

export function generarExploracionMental(datos = {}) {
  const s = datos.sintomas || {};
  const partes = [
    "Paciente valorado durante entrevista clinica. Se sugiere corroborar hallazgos directamente antes de integrar al expediente.",
    s.depresion?.length ? "Afecto y estado de animo: probable hipotimia, anhedonia y sintomatologia afectiva depresiva referida." : "Afecto y estado de animo: sin datos afectivos mayores inferidos del dictado, pendiente corroboracion.",
    s.ansiedad?.length ? "Ansiedad: se identifican datos subjetivos de ansiedad, tension o preocupacion excesiva." : "",
    s.psicosis?.length ? "Pensamiento y sensopercepcion: se reportan posibles alteraciones del contenido del pensamiento o sensopercepcion; valorar alucinaciones, delirios y grado de organizacion." : "Pensamiento y sensopercepcion: sin datos psicoticos francos inferidos del dictado.",
    s.mania?.length ? "Actividad psicomotriz/lenguaje: datos sugerentes de activacion maniforme a corroborar, incluyendo verborrea, irritabilidad o disminucion de necesidad de dormir." : "",
    datos.riesgos?.length ? "Riesgo: se identifican marcadores de riesgo suicida o autolesivo que requieren estratificacion clinica inmediata." : "Riesgo: no se identifican marcadores suicidas directos en el texto dictado."
  ];
  return partes.filter(Boolean).join("\n");
}

export function generarComentarioClinico(datos = {}) {
  const s = datos.sintomas || {};
  const fenomenos = [];
  if (s.depresion?.length) fenomenos.push("sintomatologia afectiva caracterizada por animo bajo, anhedonia y alteraciones neurovegetativas");
  if (s.ansiedad?.length) fenomenos.push("sintomas ansiosos con preocupacion, tension psicofisiologica o crisis compatibles con panico");
  if (s.psicosis?.length) fenomenos.push("posibles alteraciones del contenido del pensamiento o sensopercepcion");
  if (s.mania?.length) fenomenos.push("datos de activacion afectiva o sintomas maniformes a descartar");
  if (s.trauma?.length) fenomenos.push("manifestaciones relacionadas con trauma, hipervigilancia o reexperimentacion");

  const base = fenomenos.length
    ? `Se trata de paciente en valoracion psiquiatrica, quien cursa con ${fenomenos.join("; ")}.`
    : "Se trata de paciente en valoracion psiquiatrica, con informacion dictada insuficiente para integrar sindrome clinico especifico.";

  const riesgo = datos.riesgos?.length
    ? " Se detectan marcadores de riesgo suicida/autolesivo, por lo que se recomienda estratificacion clinica, medidas de seguridad y corroboracion dirigida."
    : " Durante el analisis automatizado no se identifican marcadores suicidas directos, sin que esto sustituya la exploracion clinica intencionada.";

  const cierre = " Lo anterior constituye una impresion preliminar generada por reglas, sujeta a revision, entrevista completa, temporalidad, funcionalidad, antecedentes y juicio clinico del medico tratante.";
  return `${base}${riesgo}${cierre}`;
}

export function generarPlanSugerido(diagnosticos = [], riesgos = [], sintomas = {}) {
  const plan = [
    "Revisar y confirmar la informacion dictada mediante entrevista clinica completa.",
    "Integrar temporalidad, intensidad, deterioro funcional, antecedentes personales y familiares.",
    "Realizar exploracion mental completa y estratificacion de riesgo."
  ];

  if (riesgos.length) plan.push("Si se confirma riesgo suicida: establecer plan de seguridad, vigilancia, restriccion de medios letales y valorar nivel de atencion requerido.");
  if (sintomas.psicosis?.length) plan.push("Valorar sintomas psicoticos, consumo de sustancias, organicidad, necesidad de contencion y tratamiento antipsicotico segun juicio clinico.");
  if (sintomas.mania?.length) plan.push("Ante sintomas maniformes, evitar iniciar antidepresivo sin valorar bipolaridad, psicosis afectiva y necesidad de estabilizador del estado de animo.");
  if (sintomas.sustancias?.length) plan.push("Indagar patron de consumo, abstinencia, intoxicacion, comorbilidad y diagnostico diferencial inducido por sustancias.");
  if (diagnosticos.length) plan.push("Registrar diagnosticos solo como probables/a descartar hasta completar integracion diagnostica.");

  return plan.join("\n");
}

function generarPadecimientoActual(textoDictado = "", datos = {}) {
  const sintomas = Object.entries(datos.sintomas || {})
    .filter(([, valores]) => valores.length)
    .map(([grupo, valores]) => `${grupo}: ${valores.join(", ")}`)
    .join("; ");

  return [
    "Paciente valorado por motivo de atencion en salud mental. De acuerdo con el dictado clinico, refiere cuadro actual que requiere integracion diagnostica formal.",
    sintomas ? `Se identifican como elementos relevantes: ${sintomas}.` : "El texto dictado no permite extraer un sindrome especifico con suficiente claridad.",
    `Texto fuente revisable: ${textoDictado.trim()}`
  ].join("\n");
}

export function generarNotaAutomatica(textoDictado = "") {
  const sintomas = detectarSintomas(textoDictado);
  const riesgosDetectados = detectarRiesgoSuicida(textoDictado);
  const diagnosticosSugeridos = sugerirDiagnosticos(sintomas, riesgosDetectados);
  const datos = { sintomas, riesgos: riesgosDetectados, diagnosticos: diagnosticosSugeridos };

  return {
    padecimientoActual: generarPadecimientoActual(textoDictado, datos),
    exploracionMental: generarExploracionMental(datos),
    comentarioClinico: generarComentarioClinico(datos),
    diagnosticosSugeridos: diagnosticosSugeridos.map((dx) => dx.nombre),
    cie10Sugeridos: diagnosticosSugeridos,
    planSugerido: generarPlanSugerido(diagnosticosSugeridos, riesgosDetectados, sintomas),
    riesgosDetectados
  };
}
