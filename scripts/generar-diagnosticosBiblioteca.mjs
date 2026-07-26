import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(".");

async function evaluateModule(relativePath, exportNames, prelude = "") {
  let source = await readFile(resolve(root, relativePath), "utf8");
  source = source
    .replace(/^\s*import[^;]+;\s*$/gm, "")
    .replace(/^\s*export\s*\{[^}]+\};?\s*$/gm, "")
    .replace(/\bexport\s+(?=(const|let|var|function|class)\b)/g, "");
  return Function(`${prelude}\n${source}\nreturn { ${exportNames.join(", ")} };`)();
}

const { CIE10 } = await evaluateModule("js/data/cie10.js", ["CIE10"]);
const { CIE11 } = await evaluateModule("js/data/cie11.js", ["CIE11"]);
const { CRITERIOS_DIAGNOSTICOS, PSICOEDUCACION } = await evaluateModule("js/data/bibliotecaClinica.js", ["CRITERIOS_DIAGNOSTICOS", "PSICOEDUCACION"]);
const { CRITERIOS_DIAGNOSTICOS_EXTENDIDOS } = await evaluateModule(
  "js/data/diagnosticosClinicosExtendidos.js",
  ["CRITERIOS_DIAGNOSTICOS_EXTENDIDOS"],
  "const enriquecerDiagnosticoClinico = (value) => value;"
);

const SISTEMAS = ["cie10", "cie11", "dsm5"];
const ORDEN_SISTEMAS = { cie10: 1, cie11: 2, dsm5: 3 };

function normalizar(texto = "") {
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function idClinico(nombre) {
  return `trastorno-${normalizar(nombre).replace(/ /g, "-")}`;
}

function categoriaPorCodigo(codigo = "") {
  if (codigo.startsWith("F")) return "Psiquiatría y salud mental";
  if (codigo.startsWith("E")) return "Endocrinología / metabolismo";
  if (codigo.startsWith("I")) return "Cardiovascular";
  if (codigo.startsWith("L")) return "Dermatología";
  if (codigo.startsWith("Z")) return "Otros";
  return "Clínica general";
}

const FECHA_AUDITORIA = new Date().toISOString().slice(0, 10);
const FUENTES_OFICIALES = {
  cie10: {
    organismo: "World Health Organization",
    documento: "The ICD-10 Classification of Mental and Behavioural Disorders: Clinical descriptions and diagnostic guidelines",
    edicion: "1992",
    url: "https://www.who.int/publications/i/item/9241544228"
  },
  cie11: {
    organismo: "World Health Organization",
    documento: "Clinical descriptions and diagnostic requirements for ICD-11 mental, behavioural and neurodevelopmental disorders (CDDR)",
    edicion: "2024",
    url: "https://www.who.int/publications/i/item/9789240077263"
  },
  dsm5: {
    organismo: "American Psychiatric Association",
    documento: "DSM-5 / DSM-5-TR; contenido secundario resumido",
    edicion: "Resumen no literal",
    url: ""
  }
};

function fuenteSistema(sistema) {
  return { ...FUENTES_OFICIALES[sistema], fechaConsulta: FECHA_AUDITORIA, sourceVerified: false };
}

function nuevoSistema(codigo, nombre, orden, sistema = orden === 1 ? "cie10" : "cie11") {
  return {
    visible: true,
    orden,
    codigo,
    nombre,
    fuente: fuenteSistema(sistema),
    tipoContenido: sistema === "dsm5" ? "resumen_clinico" : "resumen_local_pendiente_revision",
    completionStatus: "pending_review",
    review: { reviewed: false, reviewedAt: null, sourceVerified: false, notes: "Requiere verificación contra la fuente oficial antes de marcarse completo." },
    criterios: [],
    especificadores: [],
    notas: [],
    contenidoLiteralAutorizado: false
  };
}

function separarNumeroDeTexto(texto) {
  const original = String(texto || "").trim();
  const coincidencia = original.match(/^(?:\((\d+)\)|([0-9]+)[.)]|([0-9]+)\s[-–])\s*(.*)$/);
  if (!coincidencia) return { numero: null, marcador: null, texto: original };
  return { numero: Number(coincidencia[1] || coincidencia[2] || coincidencia[3]), marcador: null, texto: coincidencia[4].trim() };
}

function criterioComoTexto(criterio) {
  if (typeof criterio === "string") return criterio.trim();
  return String(criterio?.texto || "").trim();
}

function normalizarCriteriosAgrupados(criterios = [], entidadId = "diagnostico", sistema = "sistema") {
  if (!Array.isArray(criterios) || !criterios.length) return [];
  const grupos = [];
  let criterioPadre = null;
  let subgrupoActual = null;
  const crearGrupo = (titulo, clave = "", tipo = "grupo_clinico", anidar = false) => {
    const grupo = {
      id: `${entidadId}-${sistema}-grupo-${grupos.length + 1}`,
      clave,
      titulo,
      tipo,
      introduccion: "",
      literal: false,
      listType: "none",
      grupos: [],
      items: []
    };
    if (anidar && criterioPadre) criterioPadre.grupos.push(grupo);
    else grupos.push(grupo);
    return grupo;
  };
  const asegurarGrupo = () => criterioPadre || (criterioPadre = crearGrupo("Pendiente de clasificación", "", "revision_requerida"));
  const asegurarDestino = () => subgrupoActual || asegurarGrupo();
  const agregarItem = (destino, item) => {
    if (!destino) return;
    if (item.numero !== null && item.numero !== undefined) destino.listType = "decimal";
    if (item.marcador) destino.listType = /^[a-z]$/.test(item.marcador) ? "lower-alpha" : "upper-alpha";
    destino.items.push({ ...item, orden: destino.items.length + 1, literal: false });
  };

  criterios.forEach((criterio) => {
    const texto = criterioComoTexto(criterio);
    if (!texto) return;
    const limpio = texto.replace(/^\s+/, "");
    const criterioLetra = limpio.match(/^([A-Z])\)\s*(.*)$/);
    const letraLista = limpio.match(/^([a-z])[.)]\s*(.*)$/);
    const encabezado = limpio.match(/^(.+):$/);

    if (criterioLetra) {
      criterioPadre = crearGrupo(`Criterio ${criterioLetra[1]}`, criterioLetra[1], "criterio_principal");
      subgrupoActual = null;
      if (criterioLetra[2]) criterioPadre.introduccion = criterioLetra[2];
      return;
    }
    if (letraLista) {
      agregarItem(asegurarDestino(), { numero: null, marcador: letraLista[1], texto: letraLista[2] });
      return;
    }
    if (encabezado && !/^CIE\d+/i.test(encabezado[1])) {
      subgrupoActual = crearGrupo(encabezado[1].trim(), "", "subcategoria", Boolean(criterioPadre));
      subgrupoActual.listType = "none";
      return;
    }

    const numerado = separarNumeroDeTexto(texto);
    const destino = asegurarDestino();
    if (!destino.items.length && !destino.introduccion && numerado.numero === null) destino.introduccion = numerado.texto;
    else agregarItem(destino, numerado);
  });

  return grupos.filter((grupo) => grupo.items.length || grupo.introduccion || grupo.grupos.length);
}

let diagnosticos = [];
const porNombre = new Map();

function obtenerEntidad(nombre, categoria = "Clínica general") {
  const clave = normalizar(nombre);
  let entidad = porNombre.get(clave);
  if (!entidad) {
    entidad = {
      id: idClinico(nombre),
      nombre,
      descripcionBreve: "",
      categoria,
      subcategoria: categoria,
      aliases: [],
      sistemas: {},
      psicoeducacion: "",
      diagnosticoDiferencial: [],
      comorbilidades: [],
      evaluacionClinica: [],
      referencias: []
    };
    porNombre.set(clave, entidad);
    diagnosticos.push(entidad);
  }
  return entidad;
}

function agregarClasificacion(sistema, registro) {
  const entidad = obtenerEntidad(registro.nombre, categoriaPorCodigo(registro.codigo));
  if (!entidad.sistemas[sistema]) {
    entidad.sistemas[sistema] = nuevoSistema(registro.codigo, registro.nombre, ORDEN_SISTEMAS[sistema]);
  }
  entidad.aliases = [...new Set([...entidad.aliases, registro.nombre, registro.codigo])];
  return entidad;
}

for (const registro of CIE10) agregarClasificacion("cie10", registro);
for (const registro of CIE11) agregarClasificacion("cie11", registro);

function tokensCodigo(codigo = "") {
  return String(codigo).split(/[\/,+]/).map((token) => token.trim()).filter(Boolean);
}

function anexarCriterios(registro) {
  const tokens = tokensCodigo(registro.codigo);
  for (const entidad of diagnosticos) {
    for (const [sistema, datos] of Object.entries(entidad.sistemas)) {
      if (!tokens.includes(datos.codigo)) continue;
      const criterios = Array.isArray(registro.criterios) ? registro.criterios : [];
      for (const texto of criterios) {
        const criterio = typeof texto === "string" ? { texto } : texto;
        if (!criterio?.texto || datos.criterios.some((actual) => actual.texto === criterio.texto)) continue;
        datos.criterios.push({ texto: criterio.texto });
      }
      if (registro.psicoeducacion && !entidad.psicoeducacion) entidad.psicoeducacion = registro.psicoeducacion;
      if (registro.fuente) entidad.referencias.push({ sistema, titulo: registro.fuente, tipoContenido: "Resumen clínico" });
    }
  }
}

for (const registro of [...CRITERIOS_DIAGNOSTICOS, ...CRITERIOS_DIAGNOSTICOS_EXTENDIDOS]) anexarCriterios(registro);

const ansiedad = [
  {
    nombre: "Trastorno de ansiedad por separación", aliases: ["ansiedad por separación"], cie10: "F93.0", cie11: "6B05",
    dsm5: "309.21", dsm5Cie10: "F93.0", criterios: ["Malestar excesivo ante la separación de figuras de apego.", "Preocupación por pérdida o acontecimientos que provoquen separación.", "Resistencia a salir, permanecer solo o dormir separado.", "Síntomas físicos, persistencia y deterioro clínicamente significativo.", "Considerar la etapa del desarrollo y descartar otras explicaciones."]
  },
  {
    nombre: "Mutismo selectivo", aliases: ["mutismo"], cie10: "F94.0", cie11: "6B06", dsm5: "313.23", dsm5Cie10: "F94.0",
    criterios: ["Incapacidad persistente para hablar en determinadas situaciones sociales pese a poder hacerlo en otras.", "Interferencia académica, laboral o social.", "Persistencia clínicamente relevante.", "No atribuible únicamente a desconocimiento del idioma ni a otro trastorno de la comunicación."]
  },
  {
    nombre: "Fobia específica", aliases: ["fobia especifica", "fobia simple"], cie10: "F40.2", cie11: "6B03", dsm5: "300.29", dsm5Cie10: "F40.2",
    criterios: ["Miedo o ansiedad intensa ante un objeto o situación específica.", "Respuesta inmediata, evitación o resistencia con ansiedad.", "Temor desproporcionado y persistente con deterioro clínicamente significativo.", "Especificar tipo: animal, entorno natural, sangre-inyección-lesión, situacional u otro."]
  },
  {
    nombre: "Trastorno de ansiedad social", aliases: ["fobia social", "ansiedad social"], cie10: "F40.1", cie11: "6B04", dsm5: "300.23", dsm5Cie10: "F40.1",
    criterios: ["Miedo ante situaciones sociales por posible evaluación negativa.", "Temor a actuar de forma humillante o mostrar síntomas de ansiedad.", "Las situaciones provocan ansiedad y se evitan o soportan con malestar.", "Desproporción, persistencia y deterioro clínicamente significativo.", "Considerar manifestaciones infantiles y especificador relacionado con desempeño."]
  },
  {
    nombre: "Trastorno de pánico", aliases: ["pánico"], cie10: "F41.0", cie11: "6B01", dsm5: "300.01", dsm5Cie10: "F41.0",
    criterios: ["Ataques de pánico recurrentes, de inicio abrupto.", "Síntomas autonómicos, respiratorios, neurológicos y cognitivos durante los ataques.", "Preocupación persistente por nuevos ataques o sus consecuencias.", "Cambios conductuales desadaptativos y deterioro.", "Distinguir ataque de pánico de trastorno de pánico y descartar sustancias o afecciones médicas."]
  },
  {
    nombre: "Agorafobia", aliases: ["agorafobia"], cie10: "F40.0", cie11: "6B02", dsm5: "300.22", dsm5Cie10: "F40.0",
    criterios: ["Temor ante situaciones donde escapar o recibir ayuda podría resultar difícil.", "Puede incluir transporte público, espacios abiertos o cerrados, filas, multitudes y estar fuera de casa sin compañía.", "Evitación, necesidad de acompañante o exposición con ansiedad intensa.", "Persistencia, desproporción y deterioro clínicamente significativo."]
  },
  {
    nombre: "Trastorno de ansiedad generalizada", aliases: ["TAG", "ansiedad generalizada"], cie10: "F41.1", cie11: "6B00", dsm5: "300.02", dsm5Cie10: "F41.1",
    criterios: ["Ansiedad y preocupación excesivas relacionadas con diferentes acontecimientos o áreas de la vida.", "Dificultad para controlar la preocupación.", "Síntomas físicos y cognitivos asociados.", "Duración clínicamente relevante, malestar o deterioro.", "Descartar sustancias, afecciones médicas y otros trastornos mentales; considerar la presentación infantil."]
  },
  {
    nombre: "Trastorno de ansiedad inducido por sustancias o medicamentos", aliases: ["ansiedad inducida por sustancias"], cie10: "F19.98", cie11: "6C4A", dsm5: "292.89", dsm5Cie10: "F19.98",
    criterios: ["Síntomas de ansiedad predominantes.", "Relación temporal con intoxicación, abstinencia o exposición a un medicamento.", "La sustancia o medicamento es capaz de producir los síntomas.", "Ausencia de mejor explicación por un trastorno independiente y no aparición exclusiva durante delirium."]
  },
  {
    nombre: "Trastorno de ansiedad debido a otra afección médica", aliases: ["ansiedad por afección médica"], cie10: "F06.4", cie11: "6E61",
    dsm5: "293.84", dsm5Cie10: "F06.4", criterios: ["Ansiedad o ataques de pánico predominantes.", "Evidencia de relación fisiopatológica directa con una afección médica.", "Excluir otra explicación mental y la aparición exclusiva durante delirium.", "Malestar o deterioro clínicamente significativo."]
  },
  {
    nombre: "Otro trastorno de ansiedad especificado", aliases: ["ansiedad especificada"], cie10: "F41.8", cie11: "6B0Y", dsm5: "300.09", dsm5Cie10: "F41.8",
    criterios: ["Se presentan síntomas de ansiedad clínicamente significativos.", "El profesional especifica la razón por la que no se cumplen todos los criterios de una categoría concreta."]
  },
  {
    nombre: "Trastorno de ansiedad no especificado", aliases: ["ansiedad no especificada"], cie10: "F41.9", cie11: "6B0Z", dsm5: "300.00", dsm5Cie10: "F41.9",
    criterios: ["Predominan síntomas de ansiedad que causan malestar o deterioro.", "No se especifica el motivo de incumplimiento de criterios o la información disponible es insuficiente."]
  }
];

function anexarAnsiedad(definicion) {
  const entidad = obtenerEntidad(definicion.nombre, "Trastornos de ansiedad");
  entidad.categoria = "Trastornos de ansiedad";
  entidad.subcategoria = "Ansiedad";
  entidad.aliases = [...new Set([...entidad.aliases, ...definicion.aliases])];
  const cie10Disponible = definicion.cie10 && CIE10.some((registro) => registro.codigo === definicion.cie10);
  const cie11Disponible = definicion.cie11 && CIE11.some((registro) => registro.codigo === definicion.cie11);
  if (cie10Disponible && !entidad.sistemas.cie10) entidad.sistemas.cie10 = nuevoSistema(definicion.cie10, definicion.nombre, 1);
  if (cie11Disponible && !entidad.sistemas.cie11) entidad.sistemas.cie11 = nuevoSistema(definicion.cie11, definicion.nombre, 2);
  const criteriosResumen = definicion.criterios.map((texto, index) => ({
    orden: index + 1,
    titulo: `Resumen clínico ${index + 1}`,
    texto,
    tipo: "resumen_clinico",
    fuente: "Resumen estructurado del proyecto; revisar fuente oficial",
    literal: false
  }));
  const agregarResumenSiFalta = (sistema) => {
    if (!entidad.sistemas[sistema] || entidad.sistemas[sistema].criterios.length) return;
    entidad.sistemas[sistema].criterios = criteriosResumen.map((criterio, index) => ({
      ...criterio,
      id: `${entidad.id}-${sistema}-criterio-${index + 1}`
    }));
  };
  agregarResumenSiFalta("cie10");
  agregarResumenSiFalta("cie11");
  entidad.sistemas.dsm5 = {
    visible: true,
    orden: 3,
    codigo: definicion.dsm5,
    codigoCie10Cm: definicion.dsm5Cie10,
    nombre: definicion.nombre,
    fuente: fuenteSistema("dsm5"),
    tipoContenido: "resumen_clinico",
    completionStatus: "pending_review",
    review: { reviewed: false, reviewedAt: null, sourceVerified: false, notes: "Resumen no literal; no sustituye CIE-10 ni CIE-11." },
    criterios: definicion.criterios.map((texto) => ({ texto })),
    especificadores: [],
    notas: [],
    contenidoLiteralAutorizado: false,
    equivalencia: "aproximada",
    notasEquivalencia: "La correspondencia entre sistemas puede no ser uno a uno."
  };
  entidad.referencias.push({ sistema: "DSM-5-TR", organismo: "American Psychiatric Association", tipoContenido: "Resumen clínico no literal" });
  if (!entidad.psicoeducacion) entidad.psicoeducacion = "Los criterios son una herramienta de apoyo y deben integrarse con la entrevista clínica, antecedentes, exploración mental, evolución y juicio profesional.";
}

ansiedad.forEach(anexarAnsiedad);

function fusionarCamposEntidad(principal, secundaria) {
  principal.aliases = [...new Set([...(principal.aliases || []), ...(secundaria.aliases || []), secundaria.nombre])];
  if (!principal.descripcionBreve && secundaria.descripcionBreve) principal.descripcionBreve = secundaria.descripcionBreve;
  if (!principal.psicoeducacion && secundaria.psicoeducacion) principal.psicoeducacion = secundaria.psicoeducacion;
  principal.referencias = [...(principal.referencias || []), ...(secundaria.referencias || [])];
  for (const [sistema, datosSecundarios] of Object.entries(secundaria.sistemas || {})) {
    const datosPrincipales = principal.sistemas[sistema];
    if (!datosPrincipales) {
      principal.sistemas[sistema] = datosSecundarios;
      continue;
    }
    datosPrincipales.criterios = [...(datosPrincipales.criterios || []), ...(datosSecundarios.criterios || [])];
    datosPrincipales.especificadores = [...new Set([...(datosPrincipales.especificadores || []), ...(datosSecundarios.especificadores || [])])];
    datosPrincipales.notas = [...new Set([...(datosPrincipales.notas || []), ...(datosSecundarios.notas || [])])];
  }
}

function agruparJerarquiaCie10() {
  const jerarquiasVerificadas = new Set(["F90"]);
  const porCodigo = new Map(diagnosticos
    .map((diagnostico) => [diagnostico.sistemas?.cie10?.codigo, diagnostico])
    .filter(([codigo]) => codigo));
  const eliminados = new Set();

  for (const diagnostico of diagnosticos) {
    const codigo = diagnostico.sistemas?.cie10?.codigo || "";
    if (!/^F\d{2}\.\d+/i.test(codigo)) continue;
    const codigoPadre = codigo.split(".")[0];
    if (!jerarquiasVerificadas.has(codigoPadre)) continue;
    const padre = porCodigo.get(codigoPadre);
    if (!padre || padre === diagnostico) continue;
    const subtipo = diagnostico.sistemas.cie10;
    padre.sistemas.cie10.subtipos = [
      ...(padre.sistemas.cie10.subtipos || []),
      { codigo: subtipo.codigo, nombre: subtipo.nombre, criterios: subtipo.criterios || [], especificadores: subtipo.especificadores || [], notas: subtipo.notas || [] }
    ];
    fusionarCamposEntidad(padre, { ...diagnostico, sistemas: Object.fromEntries(Object.entries(diagnostico.sistemas).filter(([sistema]) => sistema !== "cie10")) });
    eliminados.add(diagnostico);
  }

  // La equivalencia clínica entre F90 y 6A05 no puede depender solo del nombre.
  const grupoF90 = porCodigo.get("F90");
  const tdahCie11 = diagnosticos.find((diagnostico) => diagnostico.sistemas?.cie11?.codigo === "6A05");
  if (grupoF90 && tdahCie11 && grupoF90 !== tdahCie11) {
    fusionarCamposEntidad(grupoF90, tdahCie11);
    eliminados.add(tdahCie11);
    grupoF90.nombre = "Trastornos hipercinéticos / Trastorno por déficit de atención con hiperactividad (TDAH)";
    grupoF90.aliases = [...new Set([...(grupoF90.aliases || []), "TDAH", "ADHD", "6A05"] )];
  }

  if (grupoF90 && !grupoF90.sistemas.dsm5) {
    grupoF90.sistemas.dsm5 = nuevoSistema("314.xx", "Attention-Deficit/Hyperactivity Disorder", 3, "dsm5");
    grupoF90.sistemas.dsm5.codigoCie10Cm = "F90.0";
    grupoF90.sistemas.dsm5.review.notes = "Correspondencia de código añadida como pendiente de verificación contra DSM-5-TR; no se incorporan criterios sin una fuente autorizada.";
  }

  return diagnosticos.filter((diagnostico) => !eliminados.has(diagnostico));
}

diagnosticos = agruparJerarquiaCie10();

function grupoContenido(titulo, items = [], introduccion = "") {
  return {
    id: normalizar(titulo).replace(/ /g, "-"),
    clave: "",
    titulo,
    tipo: "criterio_clinico",
    introduccion,
    literal: false,
    listType: "none",
    grupos: [],
    items: items.map((texto) => ({ numero: null, marcador: null, texto, literal: false }))
  };
}

function subtipoF90(codigo, nombre, items) {
  return {
    codigo,
    nombre,
    criterios: [grupoContenido("Descripción y requisitos", items)],
    especificadores: [],
    notas: []
  };
}

function completarGrupoF90() {
  const diagnostico = diagnosticos.find((item) => item.sistemas?.cie10?.codigo === "F90");
  if (!diagnostico) return;

  const cie10 = diagnostico.sistemas.cie10;
  cie10.criterios = [{
    ...grupoContenido("Criterios generales del grupo F90", [], "Síntesis estructurada de las pautas diagnósticas de la OMS; no sustituye la consulta del documento fuente."),
    grupos: [
      grupoContenido("A. Inatención", [
        "Dificultad marcada para mantener la atención y tendencia a interrumpir o abandonar actividades antes de completarlas.",
        "La inatención debe ser excesiva para la edad y el nivel de desarrollo, y afectar el funcionamiento cotidiano."
      ]),
      grupoContenido("B. Hiperactividad", [
        "Actividad motora excesiva, inquietud o dificultad para permanecer sentado en situaciones que requieren calma relativa.",
        "La actividad debe ser persistente y claramente desproporcionada respecto de la edad y del contexto."
      ]),
      grupoContenido("C. Impulsividad", [
        "Dificultad para esperar turnos, actuar sin valorar las consecuencias o interrumpir respuestas y actividades de otras personas.",
        "La impulsividad se valora junto con la inatención y la hiperactividad, no como una conducta aislada."
      ]),
      grupoContenido("D. Inicio y duración", [
        "El patrón comienza durante el desarrollo temprano y persiste durante un periodo clínicamente relevante.",
        "La OMS describe un inicio antes de los 7 años y una duración mínima de 6 meses en sus pautas de investigación; debe registrarse la fuente y la versión consultada al aplicar ese umbral."
      ]),
      grupoContenido("E. Presencia en diferentes contextos", [
        "Las manifestaciones son generalizadas y aparecen en más de una situación, por ejemplo en el hogar, la escuela, el trabajo o la consulta.",
        "La información debe contrastarse con observación directa y con informantes que conozcan al paciente en distintos contextos."
      ]),
      grupoContenido("F. Deterioro funcional", [
        "El patrón produce interferencia clínicamente significativa en el aprendizaje, las relaciones, la actividad familiar, laboral o social.",
        "La actividad elevada o la distracción aislada no bastan cuando no existe deterioro funcional relevante."
      ]),
      grupoContenido("G. Exclusiones y diagnóstico diferencial", [
        "Descartar trastornos generalizados del desarrollo, episodios maníacos o afectivos, trastornos de ansiedad, trastornos del espectro autista, trastorno disocial, discapacidad intelectual o dificultades específicas de aprendizaje cuando expliquen mejor el cuadro.",
        "También deben considerarse afecciones neurológicas o médicas, sustancias y efectos farmacológicos antes de atribuir los síntomas a F90."
      ])
    ]
  }];
  cie10.subtipos = [
    subtipoF90("F90.0", "Trastorno de la actividad y de la atención", [
      "Deben cumplirse los criterios generales del grupo F90.",
      "No deben cumplirse simultáneamente los criterios de un trastorno disocial del grupo F91.",
      "La categoría integra alteraciones persistentes de la atención, la actividad y la impulsividad con inicio temprano, presencia generalizada y deterioro funcional.",
      "Incluye el trastorno o síndrome de déficit de atención con hiperactividad cuando corresponde a la clasificación de la OMS.",
      "La ausencia de un trastorno disocial concurrente suficiente distingue F90.0 de F90.1."
    ]),
    subtipoF90("F90.1", "Trastorno hipercinético disocial", [
      "Deben cumplirse los criterios generales del grupo F90.",
      "Deben cumplirse simultáneamente los criterios del trastorno disocial del grupo F91.",
      "La categoría combina el patrón hipercinético con una pauta persistente de conducta disocial, y no equivale simplemente a TDAH con problemas de conducta ocasionales.",
      "La persistencia, la generalización entre contextos y el deterioro deben documentarse para ambos grupos de síntomas.",
      "Deben excluirse episodios afectivos, trastornos generalizados del desarrollo, esquizofrenia, trastornos por sustancias y afecciones médicas que expliquen mejor la combinación."
    ]),
    subtipoF90("F90.8", "Otros trastornos hipercinéticos", [
      "Categoría residual para cuadros que cumplen el grupo F90 pero no encajan en una subcategoría específica disponible.",
      "Debe documentarse por qué el cuadro no puede clasificarse como F90.0 o F90.1.",
      "No debe utilizarse para sustituir una valoración incompleta o la falta de información clínica básica."
    ]),
    subtipoF90("F90.9", "Trastorno hipercinético sin especificación", [
      "Categoría reservada para información insuficiente o para un cuadro en el que no puede diferenciarse F90.0 de F90.1, aunque se cumplen los criterios generales de F90.",
      "Se diferencia de F90.8 porque la limitación principal es la falta de diferenciación o información, no la existencia de una presentación residual ya caracterizada.",
      "Debe completarse posteriormente la clasificación cuando se obtengan datos de desarrollo, contextos, persistencia, deterioro y exclusiones."
    ])
  ];
  cie10.especificadores = [];
  cie10.notas = [
    "Estas son subcategorías CIE-10, no especificadores.",
    "La CIE-10 de la OMS se mantiene separada de ICD-10-CM; cualquier equivalencia estadounidense debe identificarse aparte."
  ];
  cie10.completionStatus = "complete_summary";
  cie10.fuente.sourceVerified = true;
  cie10.review = { reviewed: false, reviewedAt: null, sourceVerified: true, notes: "Síntesis estructurada basada en la publicación oficial de la OMS; revisar la edición aplicable antes del uso diagnóstico." };

  const cie11 = diagnostico.sistemas.cie11;
  cie11.criterios = [
    grupoContenido("Características esenciales", [
      "Patrón persistente de inatención y/o hiperactividad-impulsividad que excede lo esperado para la edad y el nivel de desarrollo.",
      "Las manifestaciones limitan de forma significativa el funcionamiento académico, laboral, social o familiar."
    ]),
    grupoContenido("Requisitos diagnósticos", [
      "La evaluación debe integrar síntomas, historia del desarrollo, información de otras personas y observación clínica cuando sea posible.",
      "Los síntomas deben ser clínicamente significativos y no explicarse mejor por otro trastorno, una sustancia, un medicamento o una enfermedad del sistema nervioso."
    ]),
    grupoContenido("Inicio, duración y múltiples situaciones", [
      "Debe existir evidencia de inicio durante el periodo del desarrollo y persistencia suficiente para distinguirlo de variaciones transitorias.",
      "Las dificultades deben observarse en múltiples situaciones o estar respaldadas por una historia evolutiva consistente; en adultos puede ser necesaria información retrospectiva de la infancia."
    ]),
    grupoContenido("Deterioro funcional y límites con la normalidad", [
      "La actividad, la distracción o la impulsividad aisladas no constituyen el trastorno si no generan limitación funcional relevante.",
      "La valoración debe considerar edad, desarrollo, demandas del entorno, sueño, estrés y oportunidades educativas o laborales."
    ]),
    grupoContenido("Exclusiones y diagnóstico diferencial", [
      "Considerar trastornos del desarrollo intelectual, trastornos del lenguaje, trastorno del espectro autista, trastornos del aprendizaje, tics, ansiedad, depresión, episodios afectivos, alteraciones del sueño, sustancias, medicamentos y enfermedades neurológicas o médicas.",
      "Las dificultades deben explicarse mejor por TDAH que por otra condición primaria."
    ])
  ];
  cie11.subtipos = [
    { codigo: "6A05.0", nombre: "Trastorno por déficit de atención con hiperactividad, presentación predominantemente inatenta", criterios: [grupoContenido("Presentación", ["Se cumplen los requisitos diagnósticos de 6A05 y predominan los síntomas de inatención."])], especificadores: [], notas: [] },
    { codigo: "6A05.1", nombre: "Trastorno por déficit de atención con hiperactividad, presentación predominantemente hiperactiva-impulsiva", criterios: [grupoContenido("Presentación", ["Se cumplen los requisitos diagnósticos de 6A05 y predominan los síntomas de hiperactividad-impulsividad."])], especificadores: [], notas: [] },
    { codigo: "6A05.2", nombre: "Trastorno por déficit de atención con hiperactividad, presentación combinada", criterios: [grupoContenido("Presentación", ["Se cumplen los requisitos diagnósticos de 6A05 y son clínicamente significativas tanto la inatención como la hiperactividad-impulsividad, sin predominio claro de una sola."])], especificadores: [], notas: [] },
    { codigo: "6A05.Y", nombre: "Trastorno por déficit de atención con hiperactividad, otra presentación especificada", criterios: [grupoContenido("Categoría residual", ["Se utiliza cuando la presentación clínica está especificada por el profesional, pero no corresponde a una de las presentaciones principales disponibles."])], especificadores: [], notas: [] },
    { codigo: "6A05.Z", nombre: "Trastorno por déficit de atención con hiperactividad, presentación no especificada", criterios: [grupoContenido("Categoría residual", ["Se utiliza cuando no se dispone de información suficiente para especificar la presentación clínica."])], especificadores: [], notas: [] }
  ];
  cie11.especificadores = ["Presentación clínica predominante: inatenta, hiperactiva-impulsiva o combinada.", "La fuente CDDR consultada denomina estos elementos presentaciones; no se trasladan automáticamente los especificadores de gravedad o remisión del DSM-5-TR."];
  cie11.notas = ["Códigos hijos y nombres comprobados en el CDDR de la OMS consultado.", "La CIE-11 se mantiene y actualiza en el navegador oficial; registrar la versión al actualizar este catálogo."];
  cie11.completionStatus = "complete_summary";
  cie11.fuente.sourceVerified = true;
  cie11.review = { reviewed: false, reviewedAt: null, sourceVerified: true, notes: "Síntesis clínica estructurada basada en el CDDR de la OMS; revisar la versión vigente del navegador antes del uso diagnóstico." };

  const dsm = diagnostico.sistemas.dsm5;
  dsm.codigo = "314.01";
  dsm.codigoCie10Cm = "F90.2";
  dsm.nombre = "Trastorno por déficit de atención con hiperactividad";
  dsm.criterios = [
    { ...grupoContenido("Criterio A", [], "Síntesis clínica no literal del DSM-5-TR; el criterio A se organiza en dos dimensiones."), grupos: [
      grupoContenido("A1. Inatención", ["La dimensión reúne síntomas persistentes de dificultad para mantener la atención, organizar tareas, seguir instrucciones, finalizar actividades, manejar objetos, resistir distractores y recordar obligaciones.", "El umbral resumido es de 6 síntomas en niños y de 5 en adolescentes mayores y adultos, durante al menos 6 meses, en grado inconsistente con el desarrollo y con impacto funcional."]),
      grupoContenido("A2. Hiperactividad e impulsividad", ["La dimensión reúne síntomas persistentes de inquietud, levantarse, correr o sentirse impulsado a estar en movimiento, dificultad para realizar actividades tranquilas, hablar en exceso, responder antes de tiempo, esperar turnos e interrumpir.", "El umbral resumido es de 6 síntomas en niños y de 5 en adolescentes mayores y adultos, durante al menos 6 meses, con impacto funcional."])
    ]},
    grupoContenido("Criterio B. Edad de inicio", ["Varios síntomas de inatención o hiperactividad-impulsividad estaban presentes antes de los 12 años."]),
    grupoContenido("Criterio C. Presencia en contextos", ["Varios síntomas están presentes en dos o más contextos, como casa, escuela, trabajo, relaciones u otras actividades."]),
    grupoContenido("Criterio D. Interferencia funcional", ["Existe evidencia clara de que los síntomas interfieren o reducen la calidad del funcionamiento social, académico u ocupacional."]),
    grupoContenido("Criterio E. Exclusiones", ["Los síntomas no ocurren exclusivamente durante esquizofrenia u otro trastorno psicótico y no se explican mejor por otro trastorno mental, sustancia, medicamento o afección médica."])
  ];
  dsm.subtipos = [
    { codigo: "314.01 (F90.2)", nombre: "Presentación combinada", criterios: [grupoContenido("Presentación", ["Se cumplen los umbrales resumidos de inatención y de hiperactividad-impulsividad durante el periodo de referencia."])], especificadores: [], notas: [] },
    { codigo: "314.00 (F90.0)", nombre: "Presentación predominantemente inatenta", criterios: [grupoContenido("Presentación", ["Se cumple el umbral de inatención y no se cumple el umbral completo de hiperactividad-impulsividad durante el periodo de referencia."])], especificadores: [], notas: [] },
    { codigo: "314.01 (F90.1)", nombre: "Presentación predominantemente hiperactiva/impulsiva", criterios: [grupoContenido("Presentación", ["Se cumple el umbral de hiperactividad-impulsividad y no se cumple el umbral completo de inatención durante el periodo de referencia."])], especificadores: [], notas: [] }
  ];
  dsm.especificadores = ["En remisión parcial: se cumplieron previamente todos los criterios, pero durante los últimos 6 meses no se han cumplido todos, aunque los síntomas restantes continúan causando deterioro.", "Gravedad leve, moderada o grave: se determina por el número de síntomas, su intensidad y el grado de deterioro funcional más allá del mínimo requerido."];
  dsm.notas = ["Resumen clínico no literal del DSM-5-TR; no se almacena ni reproduce el texto protegido del manual.", "Los códigos deben verificarse contra la edición autorizada y las actualizaciones oficiales de la APA antes de una decisión de facturación o codificación."];
  dsm.fuente = { organismo: "American Psychiatric Association", documento: "DSM-5-TR y actualizaciones oficiales de criterios y códigos", edicion: "DSM-5-TR; resumen clínico no literal", url: "https://www.psychiatry.org/psychiatrists/practice/dsm/updates-to-dsm/updates-to-dsm-5-tr-criteria-text", fechaConsulta: FECHA_AUDITORIA, sourceVerified: true, licenseStatus: "summarized" };
  dsm.completionStatus = "complete_summary";
  dsm.review = { reviewed: false, reviewedAt: null, sourceVerified: true, notes: "Resumen clínico no literal; verificar códigos y actualizaciones oficiales APA en la edición autorizada." };
}

completarGrupoF90();

function todosLosGrupos(grupos = []) {
  return grupos.flatMap((grupo) => [grupo, ...todosLosGrupos(grupo.grupos || [])]);
}

function evaluarSistema(sistema, datos) {
  const grupos = todosLosGrupos(datos.criterios || []);
  const texto = grupos.map((grupo) => [grupo.titulo, grupo.introduccion, ...(grupo.items || []).map((item) => item.texto)].filter(Boolean).join(" ")).join(" ").toLowerCase();
  const faltantes = [];
  if (!grupos.length) faltantes.push("criterios");
  if (grupos.some((grupo) => grupo.tipo === "revision_requerida" || grupo.titulo === "Pendiente de clasificación")) faltantes.push("clasificación de grupos");
  if (!datos.fuente?.sourceVerified) faltantes.push("verificación de fuente oficial");
  if (sistema === "cie10") {
    if (!/duraci[oó]n|persistencia|meses|semanas|d[ií]as/.test(texto)) faltantes.push("duración");
    if (!/exclu|descartar|diferencial/.test(texto)) faltantes.push("exclusiones o diagnóstico diferencial");
    if (!/deterioro|malestar|funcional|interferencia/.test(texto)) faltantes.push("deterioro o impacto funcional");
  }
  const estado = faltantes.length ? (grupos.length ? "partial" : "pending_review") : "complete";
  datos.completionStatus = estado;
  datos.review = {
    reviewed: false,
    reviewedAt: null,
    sourceVerified: Boolean(datos.fuente?.sourceVerified),
    notes: faltantes.length ? `Revisión requerida: ${faltantes.join(", ")}.` : "Revisión estructural pendiente de validación clínica final."
  };
  return { faltantes, estado };
}

for (const entidad of diagnosticos) {
  for (const [sistema, datos] of Object.entries(entidad.sistemas)) {
    datos.criterios = datos.criterios.some((grupo) => Array.isArray(grupo?.items) || Array.isArray(grupo?.grupos))
      ? datos.criterios
      : normalizarCriteriosAgrupados(datos.criterios, entidad.id, sistema);
    datos.subtipos = (datos.subtipos || []).map((subtipo, indice) => ({
      ...subtipo,
      criterios: subtipo.criterios?.some((grupo) => Array.isArray(grupo?.items) || Array.isArray(grupo?.grupos))
        ? subtipo.criterios
        : normalizarCriteriosAgrupados(subtipo.criterios, `${entidad.id}-${sistema}-subtipo-${indice + 1}`, sistema)
    }));
    evaluarSistema(sistema, datos);
  }
  if (!entidad.descripcionBreve) {
    const textoBase = entidad.psicoeducacion || entidad.nombre;
    entidad.descripcionBreve = `${textoBase.split(/[.!?]/)[0].trim().replace(/\s+/g, " ")}.`;
  }
  entidad.referencias = entidad.referencias.filter((ref, index, refs) => JSON.stringify(refs.indexOf(ref)) === JSON.stringify(index));
  entidad.sistemas = Object.fromEntries(SISTEMAS.filter((sistema) => entidad.sistemas[sistema]).map((sistema) => [sistema, entidad.sistemas[sistema]]));
}

const duplicados = diagnosticos.filter((entidad, index, lista) => lista.findIndex((item) => item.id === entidad.id) !== index);
function duplicadosPorClave(registros) {
  const conteo = new Map();
  registros.forEach((registro) => {
    const clave = normalizar(registro.nombre || registro.codigo);
    conteo.set(clave, (conteo.get(clave) || 0) + 1);
  });
  return [...conteo.entries()].filter(([, cantidad]) => cantidad > 1).map(([clave, cantidad]) => ({ clave, cantidad }));
}

const duplicadosNombresEntrada = duplicadosPorClave([...CIE10, ...CIE11]);
const duplicadosCodigosCie10 = duplicadosPorClave(CIE10.map((registro) => ({ codigo: registro.codigo })));
const duplicadosCodigosCie11 = duplicadosPorClave(CIE11.map((registro) => ({ codigo: registro.codigo })));
const reporte = {
  fecha: new Date().toISOString(),
  fuentes: ["js/data/cie10.js", "js/data/cie11.js", "js/data/bibliotecaClinica.js", "js/data/diagnosticosClinicosExtendidos.js"],
  totalDiagnosticos: diagnosticos.length,
  duplicadosPorId: duplicados.length,
  duplicadosNombresEntrada,
  duplicadosCodigos: { cie10: duplicadosCodigosCie10, cie11: duplicadosCodigosCie11 },
  conflictos: [],
  advertencia: "Revisar equivalencias aproximadas entre sistemas antes de publicar cambios clínicos."
};
const auditoriaAnsiedad = diagnosticos
  .filter((entidad) => entidad.categoria === "Trastornos de ansiedad")
  .flatMap((entidad) => Object.entries(entidad.sistemas).map(([sistema, datos]) => ({
    diagnosticoId: entidad.id,
    diagnostico: entidad.nombre,
    sistema,
    estado: datos.completionStatus,
    faltantes: String(datos.review?.notes || "").replace(/^Revisión requerida:\s*/, "").replace(/\.$/, "").split(", ").filter(Boolean),
    fuenteActual: datos.fuente || null,
    requiereRevision: datos.completionStatus !== "complete"
  })));
reporte.auditoriaAnsiedad = auditoriaAnsiedad;

const salida = resolve(root, "js/data/diagnosticosBiblioteca.js");
const reportePath = resolve(root, "reports/diagnosticos-biblioteca-migracion.json");
const auditoriaPath = resolve(root, "reports/diagnosticos-biblioteca-auditoria-ansiedad.json");
await mkdir(dirname(salida), { recursive: true });
await mkdir(dirname(reportePath), { recursive: true });
await writeFile(salida, `/* Fuente única activa de Biblioteca clínica. Cada diagnóstico es una entidad y sus sistemas están anidados. */\nexport const DIAGNOSTICOS_BIBLIOTECA = ${JSON.stringify(diagnosticos, null, 2)};\n\nexport const SISTEMAS_DIAGNOSTICOS = ["cie10", "cie11", "dsm5"];\n`, "utf8");
await writeFile(reportePath, JSON.stringify(reporte, null, 2), "utf8");
await writeFile(auditoriaPath, JSON.stringify(auditoriaAnsiedad, null, 2), "utf8");
console.log(JSON.stringify(reporte, null, 2));
