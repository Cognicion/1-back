import {
  DIAGNOSTICOS_CLINICOS,
  INGREDIENTES_MEDICAMENTOS,
  REGLAS_INTERACCIONES_CLINICAS,
  REGLAS_MEDICAMENTO_DIAGNOSTICO,
  UMBRALES_RIESGO_ACUMULATIVO
} from "../data/reglasClinicasMedicamentosExtendidas.js";

const SEVERIDAD_ORDEN = {
  informativa: 1,
  baja: 2,
  moderada: 3,
  alta: 4,
  critica: 5
};

const ALIAS_CLASES_TERAPEUTICAS = new Map([
  ["ieca", "ieca"],
  ["inhibidor eca", "ieca"],
  ["inhibidor de eca", "ieca"],
  ["inhibidor enzima convertidora angiotensina", "ieca"],
  ["inhibidor de la enzima convertidora de angiotensina", "ieca"],
  ["inhibidores de la enzima convertidora de angiotensina", "ieca"],
  ["ace inhibitor", "ieca"],
  ["ace inhibitors", "ieca"],
  ["ara2", "ara2"],
  ["ara ii", "ara2"],
  ["ara-ii", "ara2"],
  ["ara", "ara2"],
  ["arb", "ara2"],
  ["arbs", "ara2"],
  ["antagonista receptor angiotensina ii", "ara2"],
  ["antagonista del receptor de angiotensina ii", "ara2"],
  ["antagonista receptor de angiotensina ii", "ara2"],
  ["bloqueador receptor angiotensina ii", "ara2"],
  ["bloqueador del receptor de angiotensina ii", "ara2"],
  ["antagonista_receptor_angiotensina_ii", "ara2"],
  ["inhibidor directo renina", "inhibidor_renina"],
  ["inhibidor directo de renina", "inhibidor_renina"],
  ["direct renin inhibitor", "inhibidor_renina"]
]);

export function normalizarTextoClinico(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function distanciaLevenshtein(a = "", b = "") {
  const aa = normalizarTextoClinico(a);
  const bb = normalizarTextoClinico(b);
  if (!aa || !bb) return Math.max(aa.length, bb.length);
  const dp = Array.from({ length: aa.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= bb.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= aa.length; i += 1) {
    for (let j = 1; j <= bb.length; j += 1) {
      dp[i][j] = aa[i - 1] === bb[j - 1]
        ? dp[i - 1][j - 1]
        : Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]) + 1;
    }
  }
  return dp[aa.length][bb.length];
}

function contieneConFuzzy(texto, patron) {
  const normalizado = normalizarTextoClinico(texto);
  const buscado = normalizarTextoClinico(patron);
  if (!normalizado || !buscado) return false;
  if (normalizado.includes(buscado)) return true;
  if (buscado.length < 8) return false;
  const palabras = normalizado.split(" ");
  const piezas = buscado.split(" ");
  if (piezas.length > 1) {
    return piezas.every((pieza) =>
      palabras.some((palabra) => palabra.includes(pieza) || distanciaLevenshtein(palabra, pieza) <= 2)
    );
  }
  return palabras.some((palabra) => Math.abs(palabra.length - buscado.length) <= 2 && distanciaLevenshtein(palabra, buscado) <= 2);
}

function patronNegado(texto, patron) {
  const normalizado = normalizarTextoClinico(texto);
  const buscado = normalizarTextoClinico(patron);
  if (!normalizado || !buscado) return false;
  const expresiones = [
    `sin ${buscado}`,
    `niega ${buscado}`,
    `no ${buscado}`,
    `sin datos de ${buscado}`,
    `sin antecedente de ${buscado}`,
    `no se documenta ${buscado}`
  ];
  if (expresiones.some((expresion) => normalizado.includes(expresion))) return true;
  const primeraPalabra = buscado.split(" ")[0];
  return new RegExp(`\\b(sin|niega|no|sin datos de)\\s+(?:\\w+\\s+){0,3}${primeraPalabra}\\b`, "i").test(normalizado);
}

function textoMedicamento(medicamento) {
  if (!medicamento) return "";
  if (typeof medicamento === "string") return medicamento;
  return [
    medicamento.medicamento,
    medicamento.genericName,
    medicamento.nombreGenerico,
    medicamento.principioActivo,
    medicamento.activeIngredient,
    medicamento.activeIngredients,
    medicamento.ingredienteActivo,
    medicamento.ingredientesActivos,
    medicamento.nombre,
    medicamento.texto,
    medicamento.indicacion,
    medicamento.presentacion
  ].filter(Boolean).join(" ");
}

function normalizarClaseTerapeutica(clase) {
  const normalizada = normalizarTextoClinico(clase);
  return ALIAS_CLASES_TERAPEUTICAS.get(normalizada) || normalizada.replace(/\s+/g, "_");
}

function extraerClasesDeclaradas(medicamento) {
  if (!medicamento || typeof medicamento !== "object") return [];
  return valoresProfundos([
    medicamento.therapeuticClasses,
    medicamento.clasesTerapeuticas,
    medicamento.clases,
    medicamento.claseTerapeutica,
    medicamento.pharmacologicClass,
    medicamento.pharmacologicClasses
  ])
    .map(normalizarClaseTerapeutica)
    .filter(Boolean);
}

export function normalizarMedicamentoClinico(medicamento) {
  const textoOriginal = textoMedicamento(medicamento);
  const texto = normalizarTextoClinico(textoOriginal);
  const ingredientes = INGREDIENTES_MEDICAMENTOS.filter((ingrediente) =>
    ingrediente.sinonimos.some((sinonimo) => texto.includes(normalizarTextoClinico(sinonimo)) || contieneConFuzzy(texto, sinonimo))
  );

  const clases = new Set();
  const riesgos = {};
  extraerClasesDeclaradas(medicamento).forEach((clase) => clases.add(clase));
  ingredientes.forEach((ingrediente) => {
    (ingrediente.clases || []).forEach((clase) => clases.add(clase));
    Object.entries(ingrediente.riesgos || {}).forEach(([riesgo, valor]) => {
      riesgos[riesgo] = (riesgos[riesgo] || 0) + Number(valor || 0);
    });
  });

  return {
    id: medicamento?.id || texto || "medicamento",
    textoOriginal,
    textoNormalizado: texto,
    posologiaNormalizada: normalizarPosologiaMedicamento(medicamento, textoOriginal),
    ingredientes,
    ingredienteIds: ingredientes.map((ingrediente) => ingrediente.id),
    nombresIngredientes: ingredientes.map((ingrediente) => ingrediente.nombre),
    clases: [...clases],
    riesgos,
    datosOriginales: medicamento
  };
}

function normalizarPosologiaMedicamento(medicamento, textoOriginal = "") {
  if (!medicamento || typeof medicamento !== "object") {
    return extraerPosologiaDesdeTexto(textoOriginal);
  }
  const estructurada = normalizarTextoClinico([
    medicamento.dose,
    medicamento.dosis,
    medicamento.dosisUnitaria,
    medicamento.dosisDia,
    medicamento.dosisTotalDia,
    medicamento.unit,
    medicamento.unidad,
    medicamento.frequency,
    medicamento.frecuencia,
    medicamento.vecesDia,
    medicamento.via,
    medicamento.route,
    medicamento.indicacion,
    medicamento.presentacion
  ].filter(Boolean).join(" "));
  return estructurada || extraerPosologiaDesdeTexto(textoOriginal);
}

function extraerPosologiaDesdeTexto(textoOriginal = "") {
  const texto = normalizarTextoClinico(textoOriginal);
  const dosis = texto.match(/\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|ui|iu|unidades?|tabletas?|capsulas?|capsulas|gotas?)\b/g) || [];
  const frecuencia = texto.match(/\b(?:cada\s*)?\d+\s*(?:h|horas?)\b|\b\d+\s*veces?\s*(?:al|por)\s*dia\b|\b(?:diario|noche|mañana|tarde)\b/g) || [];
  return [...dosis, ...frecuencia].join(" ").trim() || texto.replace(/\b[a-záéíóúñ]{4,}\b/g, " ").replace(/\s+/g, " ").trim();
}

function valoresProfundos(objeto, profundidad = 0) {
  if (!objeto || profundidad > 3) return [];
  if (typeof objeto === "string" || typeof objeto === "number") return [String(objeto)];
  if (Array.isArray(objeto)) return objeto.flatMap((item) => valoresProfundos(item, profundidad + 1));
  if (typeof objeto === "object") {
    return Object.entries(objeto)
      .filter(([clave]) => !["uid", "id", "createdAt", "updatedAt"].includes(clave))
      .flatMap(([, valor]) => valoresProfundos(valor, profundidad + 1));
  }
  return [];
}

export function extraerDiagnosticosPaciente(paciente = {}) {
  return extraerDiagnosticosEstructuradosPaciente(paciente).map((diagnostico) => diagnostico.texto);
}

const ESTADOS_DIAGNOSTICO_INACTIVOS = new Set(["descartado", "se_descarta", "resuelto", "remision", "remisión"]);
const ESTADOS_DIAGNOSTICO_PROBABLES = new Set(["probable", "a_descartar", "en_estudio", "diferencial"]);

function normalizarEstadoDiagnostico(estado = "") {
  const texto = normalizarTextoClinico(estado).replace(/\s+/g, "_");
  if (!texto) return "confirmado";
  if (/(descart|se_descarta|no_activo|resuelt|remision)/.test(texto)) return texto.includes("descart") ? "descartado" : "resuelto";
  if (/(probable|a_descartar|estudio|diferencial)/.test(texto)) return texto.includes("diferencial") ? "diferencial" : "probable";
  if (/(antecedente|historico|histórico)/.test(texto)) return "antecedente";
  if (/(seguimiento|activo|confirmado|se_agrega)/.test(texto)) return "confirmado";
  return texto;
}

function diagnosticoDesdeObjeto(item, origen = "expediente") {
  if (!item) return null;
  if (typeof item === "string" || typeof item === "number") {
    const texto = String(item).trim();
    return texto ? { texto, estado: "confirmado", origen } : null;
  }
  if (typeof item !== "object") return null;
  const codigo = item.codigo || item.cie10 || item.cie11 || item.codigoCie10 || item.codigoCie11 || "";
  const nombre = item.nombre || item.diagnostico || item.descripcion || item.texto || item.label || item.visibleText || "";
  const textoVisible = [codigo, nombre].filter(Boolean).join(" - ").trim();
  const texto = textoVisible || valoresProfundos(item).join(" ").trim();
  if (!texto) return null;
  return {
    texto,
    codigo: String(codigo || "").trim(),
    sistema: item.sistema || item.catalogo || item.tipoCatalogo || "",
    estado: normalizarEstadoDiagnostico(item.estado || item.estatus || item.status || item.estadoClinico),
    origen
  };
}

export function extraerDiagnosticosEstructuradosPaciente(paciente = {}) {
  const contextoDirecto = extraerContextoDirectoPaciente(paciente);
  const fuentes = [
    ["diagnostico", paciente.diagnostico],
    ["diagnosticos", paciente.diagnosticos],
    ["historialDiagnosticos", paciente.historialDiagnosticos],
    ["comorbilidades", paciente.comorbilidades],
    ["antecedentes", paciente.antecedentes],
    ["antecedentesMedicos", paciente.antecedentesMedicos],
    ["datosClinicosResumen", paciente.datosClinicosResumen],
    ["contextoDirecto", contextoDirecto.textos.filter((texto) => String(texto || "").trim())]
  ];
  const salida = [];
  fuentes.forEach(([origen, valor]) => {
    const lista = Array.isArray(valor) ? valor : [valor];
    lista.forEach((item) => {
      const diagnostico = diagnosticoDesdeObjeto(item, origen);
      if (diagnostico) salida.push(diagnostico);
    });
  });
  const vistos = new Set();
  return salida.filter((diagnostico) => {
    const clave = `${normalizarTextoClinico(diagnostico.texto)}:${diagnostico.estado}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

function numeroSeguro(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === "") return null;
  const numero = Number(String(valor ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numero) ? numero : null;
}

function calcularEdadLocal(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const fecha = new Date(fechaNacimiento);
  if (Number.isNaN(fecha.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const mes = hoy.getMonth() - fecha.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < fecha.getDate())) edad -= 1;
  return edad >= 0 && edad < 130 ? edad : null;
}

function extraerContextoDirectoPaciente(paciente = {}) {
  const textos = [];
  const edad = numeroSeguro(paciente.edad) ?? calcularEdadLocal(paciente.fechaNacimiento || paciente.fecha_nacimiento);
  const peso = numeroSeguro(paciente.peso || paciente.somatometria?.peso || paciente.signosVitales?.peso);
  const eGFR = numeroSeguro(paciente.eGFR || paciente.egfr || paciente.tfg || paciente.laboratorio?.eGFR || paciente.laboratorio?.tfg);
  const creatinina = numeroSeguro(paciente.creatinina || paciente.laboratorio?.creatinina);
  const childPugh = paciente.childPugh || paciente.child || paciente.funcionHepatica?.childPugh || "";
  const alergias = valoresProfundos([paciente.alergias, paciente.datosInstitucionales?.alergias]).join(" ");
  const embarazo = Boolean(paciente.embarazo || paciente.gestacion || paciente.obstetricia?.embarazo);
  const lactancia = Boolean(paciente.lactancia || paciente.obstetricia?.lactancia);
  const consumo = valoresProfundos([paciente.consumoSustancias, paciente.habitos, paciente.sustancias]).join(" ");

  if (edad !== null && edad >= 65) textos.push("adulto mayor fragilidad");
  if (eGFR !== null && eGFR < 60) textos.push("enfermedad renal cronica filtrado glomerular bajo");
  if (creatinina !== null && creatinina > 1.4) textos.push("insuficiencia renal creatinina elevada");
  if (childPugh) textos.push(`hepatopatia cronica child pugh ${childPugh}`);
  if (embarazo) textos.push("embarazo");
  if (lactancia) textos.push("lactancia");
  if (/alcohol|etanol|bebida/i.test(consumo)) textos.push("consumo de alcohol");

  return { edad, peso, eGFR, creatinina, childPugh, alergias, embarazo, lactancia, textos };
}

function detectarChildPugh(textos = []) {
  const unido = normalizarTextoClinico(textos.join(" "));
  const directo = unido.match(/child[-\s]?pugh\s*([abc])/i);
  if (directo?.[1]) return directo[1].toLowerCase();
  if (/\bchild\s*a\b/.test(unido)) return "a";
  if (/\bchild\s*b\b/.test(unido)) return "b";
  if (/\bchild\s*c\b/.test(unido)) return "c";
  if (/(descompensad|ascitis|encefalopatia hepatica|varices esofagicas)/.test(unido)) return "c";
  return "";
}

export function resolverDiagnosticosClinicos(textos = []) {
  const listaOriginal = Array.isArray(textos) ? textos : [textos];
  const listaEstructurada = listaOriginal
    .map((item) => diagnosticoDesdeObjeto(item, "entrada"))
    .filter(Boolean);
  const listaTextos = listaEstructurada
    .filter((item) => !ESTADOS_DIAGNOSTICO_INACTIVOS.has(item.estado))
    .map((item) => item.texto);
  const encontrados = [];
  const vistos = new Set();
  DIAGNOSTICOS_CLINICOS.forEach((diagnostico) => {
    const patrones = [diagnostico.nombre, ...(diagnostico.sinonimos || [])];
    const coincide = listaTextos.some((texto) =>
      patrones.some((patron) => contieneConFuzzy(texto, patron) && !patronNegado(texto, patron))
    );
    if (!coincide || vistos.has(diagnostico.id)) return;
    vistos.add(diagnostico.id);
    encontrados.push({
      ...diagnostico,
      estado: listaEstructurada.find((item) =>
        patrones.some((patron) => contieneConFuzzy(item.texto, patron) && !patronNegado(item.texto, patron))
      )?.estado || "confirmado",
      evidenciaTexto: listaTextos.find((texto) =>
        patrones.some((patron) => contieneConFuzzy(texto, patron) && !patronNegado(texto, patron))
      ) || ""
    });
  });

  const childPugh = detectarChildPugh(listaTextos);
  return {
    diagnosticos: encontrados,
    diagnosticosEvaluados: listaEstructurada,
    diagnosticosActivos: listaEstructurada.filter((item) => !ESTADOS_DIAGNOSTICO_INACTIVOS.has(item.estado)),
    diagnosticosProbables: listaEstructurada.filter((item) => ESTADOS_DIAGNOSTICO_PROBABLES.has(item.estado)),
    categorias: [...new Set(encontrados.map((diagnostico) => diagnostico.categoria))],
    modificadores: { childPugh }
  };
}

function reglaAplicaAMedicamento(regla, med) {
  if (regla.ingrediente && med.ingredienteIds.includes(regla.ingrediente)) return true;
  if (regla.clase && med.clases.includes(regla.clase)) return true;
  if (Array.isArray(regla.clases) && regla.clases.some((clase) => med.clases.includes(clase))) return true;
  if (regla.riesgo && Number(med.riesgos[regla.riesgo] || 0) > 0) return true;
  return false;
}

function severidadFinal(regla, contexto) {
  const child = contexto.modificadores?.childPugh;
  const escalada = child && regla.escalamiento?.childPugh?.[child];
  return escalada || regla.severidad || "moderada";
}

function crearAlerta(base) {
  const severidad = base.severidad || "moderada";
  const requiereJustificacion = Boolean(
    base.requiereJustificacion ||
    (Array.isArray(base.requiereJustificacionSi) && base.requiereJustificacionSi.includes(severidad))
  );
  return {
    id: base.id,
    tipo: base.tipo || "precaucion",
    severidad,
    prioridad: SEVERIDAD_ORDEN[severidad] || 3,
    titulo: base.titulo,
    medicamentos: base.medicamentos || [],
    diagnosticos: base.diagnosticos || [],
    efecto: base.efecto || "",
    recomendacion: base.recomendacion || "",
    evidencia: base.evidencia || "regla_local",
    fuentes: base.fuentes || [],
    fechaFuente: base.fechaFuente || base.actualizado || "",
    parametrosVigilancia: base.parametrosVigilancia || [],
    permiteOverride: base.permiteOverride !== false,
    requiereJustificacion,
    fuente: "Motor clínico local de Cognición"
  };
}

function clavePrincipioActivo(med) {
  if (med.ingredienteIds?.length) return `ingredientes:${[...med.ingredienteIds].sort().join("+")}`;
  return `texto:${med.textoNormalizado
    .replace(/\b\d+(?:[.,]\d+)?\s*(mg|mcg|g|ml|ui|iu|tabletas?|capsulas?|cápsulas?|cada|horas?|h|dia|día)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()}`;
}

function clavePrescripcionExacta(med) {
  return [
    clavePrincipioActivo(med),
    med.posologiaNormalizada || med.textoNormalizado || "",
    (med.clases || []).sort().join("+")
  ].join("|");
}

function crearAlertaDuplicidad(clave, grupo, exacta = false) {
  const principal = grupo[0] || {};
  const nombre = principal.nombresIngredientes?.join(" + ") || principal.textoOriginal || "medicamento";
  return crearAlerta({
    id: `${exacta ? "duplicidad_exacta" : "duplicidad"}:${clave}`,
    tipo: "duplicidad_terapeutica",
    severidad: exacta ? "baja" : "moderada",
    titulo: exacta ? "Prescripción repetida / duplicidad terapéutica exacta" : "Posible duplicidad terapéutica o de principio activo",
    medicamentos: grupo.map((med) => med.textoOriginal),
    efecto: exacta
      ? `La misma prescripción de ${nombre} aparece más de una vez. Se conserva una sola entrada para el análisis y se registra esta alerta para revisión.`
      : `Se encontraron ${grupo.length} prescripciones relacionadas con ${nombre}. Puede tratarse de duplicidad real, cambio de dosis, rescate o presentaciones distintas del mismo principio activo.`,
    recomendacion: exacta
      ? "Verificar que no haya duplicación accidental antes de guardar o interpretar la prescripción."
      : "Verificar si son prescripciones distintas, cambio de dosis, rescate o duplicación no intencional antes de interpretar seguridad.",
    evidencia: "regla_local",
    fuentes: ["Regla local de deduplicación por prescripción exacta y principio activo."]
  });
}

function deduplicarMedicamentosParaAnalisis(medicamentosNormalizados = []) {
  const gruposExactos = new Map();
  medicamentosNormalizados.forEach((med) => {
    const clave = clavePrescripcionExacta(med);
    const grupo = gruposExactos.get(clave) || [];
    grupo.push(med);
    gruposExactos.set(clave, grupo);
  });

  const medicamentosUnicos = [];
  const alertasDuplicidad = [];
  gruposExactos.forEach((grupo, clave) => {
    const principal = {
      ...grupo[0],
      prescripcionesRelacionadas: grupo.map((med) => med.textoOriginal)
    };
    medicamentosUnicos.push(principal);
    if (grupo.length > 1) {
      alertasDuplicidad.push(crearAlertaDuplicidad(clave, grupo, true));
    }
  });

  const gruposPrincipio = new Map();
  medicamentosUnicos.forEach((med) => {
    const clave = clavePrincipioActivo(med);
    const grupo = gruposPrincipio.get(clave) || [];
    grupo.push(med);
    gruposPrincipio.set(clave, grupo);
  });
  gruposPrincipio.forEach((grupo, clave) => {
    if (grupo.length > 1) alertasDuplicidad.push(crearAlertaDuplicidad(clave, grupo, false));
  });

  return { medicamentosUnicos, alertasDuplicidad };
}
export function evaluarMedicamentoContraDiagnosticos(medicamentosNormalizados = [], contextoDiagnostico) {
  const alertas = [];
  medicamentosNormalizados.forEach((med) => {
    REGLAS_MEDICAMENTO_DIAGNOSTICO.forEach((regla) => {
      if (!reglaAplicaAMedicamento(regla, med)) return;
      const diagnosticosCoincidentes = contextoDiagnostico.diagnosticos.filter((diagnostico) =>
        diagnostico.categoria === regla.diagnosticoCategoria
      );
      if (!diagnosticosCoincidentes.length) return;
      const severidad = severidadFinal(regla, contextoDiagnostico);
      alertas.push(crearAlerta({
        ...regla,
        id: `${regla.id}:${med.ingredienteIds.join("+") || med.id}:${diagnosticosCoincidentes.map((d) => d.id).join("+")}`,
        tipo: severidad === "critica" ? "contraindicacion" : "precaucion_contextual",
        severidad,
        medicamentos: [med.textoOriginal],
        diagnosticos: diagnosticosCoincidentes.map((d) => d.nombre)
      }));
    });
  });
  return alertas;
}

function evaluarAlergiasPaciente(medicamentosNormalizados = [], paciente = {}) {
  const contexto = extraerContextoDirectoPaciente(paciente);
  const alergias = normalizarTextoClinico(contexto.alergias);
  if (!alergias || /negad|no conocida|sin alerg/.test(alergias)) return [];
  const alertas = [];
  medicamentosNormalizados.forEach((med) => {
    const coincide = med.ingredientes.some((ingrediente) =>
      [ingrediente.nombre, ...(ingrediente.sinonimos || [])].some((patron) =>
        alergias.includes(normalizarTextoClinico(patron))
      )
    );
    if (!coincide) return;
    alertas.push(crearAlerta({
      id: `alergia:${med.ingredienteIds.join("+") || med.id}`,
      tipo: "contraindicacion_alergia",
      severidad: "critica",
      titulo: "Medicamento coincide con alergia registrada",
      medicamentos: [med.textoOriginal],
      efecto: "El medicamento contiene un ingrediente que coincide con alergias registradas en datos generales.",
      recomendacion: "No guardar sin verificar alergia, gravedad, reacción previa y alternativa terapéutica.",
      permiteOverride: true,
      requiereJustificacion: true
    }));
  });
  return alertas;
}

function evaluarContextoDirectoPaciente(medicamentosNormalizados = [], paciente = {}) {
  const contexto = extraerContextoDirectoPaciente(paciente);
  const alertas = [];
  medicamentosNormalizados.forEach((med) => {
    if ((contexto.eGFR !== null && contexto.eGFR < 60) || (contexto.creatinina !== null && contexto.creatinina > 1.4)) {
      const requiereRevisionRenal = med.clases.includes("gabapentinoide") ||
        med.clases.includes("ieca") ||
        med.clases.includes("ara2") ||
        Number(med.riesgos.renal || 0) > 0 ||
        Number(med.riesgos.potasio || 0) > 0;
      if (requiereRevisionRenal) {
        alertas.push(crearAlerta({
          id: `funcion_renal:${med.ingredienteIds.join("+") || med.id}`,
          tipo: "precaucion_funcion_renal",
          severidad: contexto.eGFR !== null && contexto.eGFR < 30 ? "alta" : "moderada",
          titulo: "Función renal reducida: revisar medicamento",
          medicamentos: [med.textoOriginal],
          diagnosticos: ["Función renal reducida / eGFR bajo o creatinina elevada"],
          efecto: "El medicamento puede requerir ajuste, monitorización o precaución adicional en función renal reducida.",
          recomendacion: "Revisar eGFR, creatinina, potasio si aplica, dosis, intervalo y alternativas antes de interpretar seguridad.",
          parametrosVigilancia: ["eGFR", "Creatinina", "Potasio si aplica", "Presión arterial si aplica"]
        }));
      }
    }
    if (contexto.peso !== null && contexto.peso < 45 && (med.clases.includes("depresor_snc") || med.clases.includes("antiepileptico"))) {
      alertas.push(crearAlerta({
        id: `peso_bajo:${med.id}`,
        tipo: "precaucion_dosis",
        severidad: "baja",
        titulo: "Peso bajo: revisar dosis",
        medicamentos: [med.textoOriginal],
        efecto: "El peso registrado puede requerir ajuste de dosis o vigilancia de sedación/toxicidad.",
        recomendacion: "Verificar dosis por kg cuando corresponda y registrar vigilancia clínica."
      }));
    }
  });
  return alertas;
}

function cumpleLado(regla, med, sufijo) {
  const ingredientes = regla[`ingredientes${sufijo}`] || [];
  const clases = regla[`clases${sufijo}`] || [];
  return ingredientes.some((id) => med.ingredienteIds.includes(id)) || clases.some((clase) => med.clases.includes(clase));
}

export function evaluarInteraccionesClinicas(medicamentosNormalizados = []) {
  const alertas = [];
  for (let i = 0; i < medicamentosNormalizados.length; i += 1) {
    for (let j = i + 1; j < medicamentosNormalizados.length; j += 1) {
      const medA = medicamentosNormalizados[i];
      const medB = medicamentosNormalizados[j];
      REGLAS_INTERACCIONES_CLINICAS.forEach((regla) => {
        const directa = cumpleLado(regla, medA, "A") && cumpleLado(regla, medB, "B");
        const inversa = cumpleLado(regla, medB, "A") && cumpleLado(regla, medA, "B");
        if (!directa && !inversa) return;
        alertas.push(crearAlerta({
          ...regla,
          id: `${regla.id}:${[medA.textoNormalizado, medB.textoNormalizado].sort().join("|")}`,
          tipo: regla.evidencia === "potencial" ? "interaccion_farmacocinetica_inferida" : "interaccion_medicamento_medicamento",
          medicamentos: [medA.textoOriginal, medB.textoOriginal]
        }));
      });
    }
  }
  return alertas;
}

export function evaluarRiesgosAcumulativos(medicamentosNormalizados = []) {
  const acumulados = {};
  medicamentosNormalizados.forEach((med) => {
    Object.entries(med.riesgos || {}).forEach(([riesgo, valor]) => {
      acumulados[riesgo] = (acumulados[riesgo] || 0) + Number(valor || 0);
    });
  });

  return Object.entries(UMBRALES_RIESGO_ACUMULATIVO)
    .filter(([riesgo, regla]) => Number(acumulados[riesgo] || 0) >= regla.minimo)
    .map(([riesgo, regla]) => crearAlerta({
      id: `riesgo_acumulativo:${riesgo}:${Math.round(acumulados[riesgo])}`,
      tipo: "riesgo_acumulativo",
      severidad: regla.severidad,
      titulo: regla.titulo,
      medicamentos: medicamentosNormalizados
        .filter((med) => Number(med.riesgos[riesgo] || 0) > 0)
        .map((med) => med.textoOriginal),
      efecto: regla.descripcion || "Varios medicamentos seleccionados comparten un efecto farmacodinámico o toxicológico que puede acumularse. El valor interno solo se usa para priorizar la alerta y no representa una escala clínica validada.",
      recomendacion: regla.recomendacion || "Revisar necesidad de cada fármaco, dosis, factores de riesgo y vigilancia clínica.",
      parametrosVigilancia: regla.parametrosVigilancia || [],
      fuentes: regla.fuentes || ["Regla local de riesgo farmacodinámico acumulativo; requiere validación clínica e institucional."]
    }));
}

function validarBloqueosTecnicos(medicamentos = []) {
  const bloqueos = [];
  medicamentos.forEach((medicamento, index) => {
    const texto = textoMedicamento(medicamento);
    const dosisDia = medicamento?.dosisDia || medicamento?.dosisTotalDia || "";
    if (/(^|\s)-\d/.test(String(dosisDia)) || /dosis\s*-\d/i.test(texto)) {
      bloqueos.push({
        id: `bloqueo_tecnico_dosis_negativa_${index}`,
        tipo: "bloqueo_tecnico",
        severidad: "critica",
        titulo: "Dosis inválida",
        detalle: "Se detectó una dosis negativa o imposible. Corrige el dato antes de evaluar seguridad."
      });
    }
  });
  return bloqueos;
}

function deduplicarAlertas(alertas = []) {
  const indice = new Map();
  alertas.forEach((alerta) => {
    const clave = alerta.tipo === "precaucion_contextual" && alerta.diagnosticos?.length
      ? `${alerta.tipo}:${alerta.titulo}:${alerta.efecto}:${(alerta.diagnosticos || []).join("+")}`
      : alerta.id || `${alerta.titulo}:${(alerta.medicamentos || []).join("+")}:${(alerta.diagnosticos || []).join("+")}`;
    const existente = indice.get(clave);
    if (!existente) {
      indice.set(clave, alerta);
      return;
    }
    const fusionada = {
      ...((alerta.prioridad || 0) > (existente.prioridad || 0) ? alerta : existente),
      medicamentos: [...new Set([...(existente.medicamentos || []), ...(alerta.medicamentos || [])])],
      diagnosticos: [...new Set([...(existente.diagnosticos || []), ...(alerta.diagnosticos || [])])],
      fuentes: [...new Set([...(existente.fuentes || []), ...(alerta.fuentes || [])])],
      parametrosVigilancia: [...new Set([...(existente.parametrosVigilancia || []), ...(alerta.parametrosVigilancia || [])])]
    };
    indice.set(clave, fusionada);
  });
  return [...indice.values()].sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0));
}

export function obtenerIndicadorSeguridadMedicamento(alertas = []) {
  const max = Math.max(0, ...alertas.map((alerta) => alerta.prioridad || 0));
  if (max >= 5) return { estado: "bloqueo", etiqueta: "Riesgo crítico", clase: "critico" };
  if (max >= 4) return { estado: "alto", etiqueta: "Revisión obligatoria", clase: "alto" };
  if (max >= 3) return { estado: "precaucion", etiqueta: "Precaución", clase: "precaucion" };
  if (max >= 2) return { estado: "bajo", etiqueta: "Vigilancia", clase: "bajo" };
  return { estado: "sin_alertas", etiqueta: "Sin alertas locales", clase: "ok" };
}

export function evaluarMedicamentosPaciente({ paciente = {}, medicamentos = [], medicamentoNuevo = null } = {}) {
  const listaMedicamentos = medicamentoNuevo ? [...medicamentos, medicamentoNuevo] : [...medicamentos];
  const bloqueosTecnicos = validarBloqueosTecnicos(listaMedicamentos);
  if (bloqueosTecnicos.length) {
    return {
      alertas: bloqueosTecnicos.map((bloqueo) => crearAlerta({
        ...bloqueo,
        id: bloqueo.id,
        tipo: "bloqueo_tecnico",
        efecto: bloqueo.detalle,
        recomendacion: "Corrige el dato antes de guardar o interpretar la prescripción.",
        permiteOverride: false
      })),
      bloqueosTecnicos,
      medicamentosNormalizados: [],
      diagnosticosDetectados: [],
      indicador: { estado: "bloqueo", etiqueta: "Bloqueo técnico", clase: "critico" }
    };
  }

  const medicamentosNormalizadosOriginales = listaMedicamentos
    .map(normalizarMedicamentoClinico)
    .filter((med) => med.textoOriginal);
  const { medicamentosUnicos: medicamentosNormalizados, alertasDuplicidad } = deduplicarMedicamentosParaAnalisis(medicamentosNormalizadosOriginales);
  const diagnosticosEstructurados = extraerDiagnosticosEstructuradosPaciente(paciente);
  const textosDiagnosticos = diagnosticosEstructurados.map((diagnostico) => diagnostico.texto);
  const contextoDiagnostico = resolverDiagnosticosClinicos(diagnosticosEstructurados);
  const alertas = deduplicarAlertas([
    ...alertasDuplicidad,
    ...evaluarMedicamentoContraDiagnosticos(medicamentosNormalizados, contextoDiagnostico),
    ...evaluarInteraccionesClinicas(medicamentosNormalizados),
    ...evaluarRiesgosAcumulativos(medicamentosNormalizados),
    ...evaluarAlergiasPaciente(medicamentosNormalizados, paciente),
    ...evaluarContextoDirectoPaciente(medicamentosNormalizados, paciente)
  ]);

  return {
    alertas,
    bloqueosTecnicos: [],
    medicamentosNormalizados,
    medicamentosOriginalesNormalizados: medicamentosNormalizadosOriginales,
    diagnosticosDetectados: contextoDiagnostico.diagnosticos,
    diagnosticosEvaluados: contextoDiagnostico.diagnosticosEvaluados || diagnosticosEstructurados,
    diagnosticosActivos: contextoDiagnostico.diagnosticosActivos || [],
    diagnosticosProbables: contextoDiagnostico.diagnosticosProbables || [],
    textosDiagnosticosEvaluados: textosDiagnosticos,
    modificadores: contextoDiagnostico.modificadores,
    indicador: obtenerIndicadorSeguridadMedicamento(alertas)
  };
}

export function resumenAlertaMedicamento(alerta) {
  return [
    alerta.titulo,
    alerta.medicamentos?.length ? `Medicamentos: ${alerta.medicamentos.join(" + ")}` : "",
    alerta.diagnosticos?.length ? `Contexto: ${alerta.diagnosticos.join(", ")}` : "",
    alerta.efecto,
    alerta.recomendacion
  ].filter(Boolean).join("\n");
}
