import {
  DIAGNOSTICOS_CLINICOS,
  INGREDIENTES_MEDICAMENTOS,
  REGLAS_INTERACCIONES_CLINICAS,
  REGLAS_MEDICAMENTO_DIAGNOSTICO,
  UMBRALES_RIESGO_ACUMULATIVO
} from "../data/reglasClinicasMedicamentos.js";

const SEVERIDAD_ORDEN = {
  informativa: 1,
  baja: 2,
  moderada: 3,
  alta: 4,
  critica: 5
};

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

function textoMedicamento(medicamento) {
  if (!medicamento) return "";
  if (typeof medicamento === "string") return medicamento;
  return [
    medicamento.medicamento,
    medicamento.nombre,
    medicamento.texto,
    medicamento.indicacion,
    medicamento.presentacion
  ].filter(Boolean).join(" ");
}

export function normalizarMedicamentoClinico(medicamento) {
  const textoOriginal = textoMedicamento(medicamento);
  const texto = normalizarTextoClinico(textoOriginal);
  const ingredientes = INGREDIENTES_MEDICAMENTOS.filter((ingrediente) =>
    ingrediente.sinonimos.some((sinonimo) => texto.includes(normalizarTextoClinico(sinonimo)))
  );

  const clases = new Set();
  const riesgos = {};
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
    ingredientes,
    ingredienteIds: ingredientes.map((ingrediente) => ingrediente.id),
    nombresIngredientes: ingredientes.map((ingrediente) => ingrediente.nombre),
    clases: [...clases],
    riesgos,
    datosOriginales: medicamento
  };
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
  const campos = [
    paciente.diagnostico,
    paciente.diagnosticos,
    paciente.historialDiagnosticos,
    paciente.antecedentes,
    paciente.antecedentesMedicos,
    paciente.antecedentesPersonales,
    paciente.historiaClinica,
    paciente.alergias,
    paciente.comorbilidades,
    paciente.observaciones,
    paciente.datosClinicosResumen
  ];
  return valoresProfundos(campos)
    .map((texto) => String(texto || "").trim())
    .filter(Boolean);
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
  const listaTextos = Array.isArray(textos) ? textos : [textos];
  const encontrados = [];
  const vistos = new Set();
  DIAGNOSTICOS_CLINICOS.forEach((diagnostico) => {
    const coincide = listaTextos.some((texto) =>
      [diagnostico.nombre, ...(diagnostico.sinonimos || [])].some((patron) => contieneConFuzzy(texto, patron))
    );
    if (!coincide || vistos.has(diagnostico.id)) return;
    vistos.add(diagnostico.id);
    encontrados.push({
      ...diagnostico,
      evidenciaTexto: listaTextos.find((texto) =>
        [diagnostico.nombre, ...(diagnostico.sinonimos || [])].some((patron) => contieneConFuzzy(texto, patron))
      ) || ""
    });
  });

  const childPugh = detectarChildPugh(listaTextos);
  return {
    diagnosticos: encontrados,
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
    permiteOverride: base.permiteOverride !== false,
    requiereJustificacion,
    fuente: "Motor clínico local de Cognición"
  };
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
      efecto: `La suma de medicamentos alcanza una carga ${riesgo} de ${acumulados[riesgo]}.`,
      recomendacion: "Revisar necesidad de cada fármaco, dosis, factores de riesgo y vigilancia clínica."
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
    const clave = alerta.id || `${alerta.titulo}:${(alerta.medicamentos || []).join("+")}:${(alerta.diagnosticos || []).join("+")}`;
    const existente = indice.get(clave);
    if (!existente || (alerta.prioridad || 0) > (existente.prioridad || 0)) indice.set(clave, alerta);
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

  const medicamentosNormalizados = listaMedicamentos
    .map(normalizarMedicamentoClinico)
    .filter((med) => med.textoOriginal);
  const textosDiagnosticos = extraerDiagnosticosPaciente(paciente);
  const contextoDiagnostico = resolverDiagnosticosClinicos(textosDiagnosticos);
  const alertas = deduplicarAlertas([
    ...evaluarMedicamentoContraDiagnosticos(medicamentosNormalizados, contextoDiagnostico),
    ...evaluarInteraccionesClinicas(medicamentosNormalizados),
    ...evaluarRiesgosAcumulativos(medicamentosNormalizados)
  ]);

  return {
    alertas,
    bloqueosTecnicos: [],
    medicamentosNormalizados,
    diagnosticosDetectados: contextoDiagnostico.diagnosticos,
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
