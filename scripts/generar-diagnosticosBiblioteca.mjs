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
    datos.criterios = normalizarCriteriosAgrupados(datos.criterios, entidad.id, sistema);
    datos.subtipos = (datos.subtipos || []).map((subtipo, indice) => ({
      ...subtipo,
      criterios: normalizarCriteriosAgrupados(subtipo.criterios, `${entidad.id}-${sistema}-subtipo-${indice + 1}`, sistema)
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
