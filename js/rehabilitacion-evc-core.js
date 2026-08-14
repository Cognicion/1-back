export const DOMINIOS_EVC = Object.freeze([
  {
    id: "atencion",
    nombre: "Atención",
    descripcion: "Mantener el foco, seleccionar estímulos relevantes y cambiar la atención cuando la tarea lo requiere.",
    objetivo: "Aumentar la atención sostenida y reducir omisiones durante tareas funcionales.",
    estrategias: ["Trabajar en un ambiente con pocos distractores.", "Dar una instrucción a la vez y usar pausas breves."],
    actividades: ["cpt", "busqueda-visual"]
  },
  {
    id: "memoria",
    nombre: "Memoria y aprendizaje",
    descripcion: "Registrar, retener y recuperar información nueva para las actividades cotidianas.",
    objetivo: "Mejorar el aprendizaje funcional y el uso autónomo de apoyos externos.",
    estrategias: ["Usar aprendizaje sin error y repetición espaciada.", "Incorporar calendario, listas, alarmas y rutinas visibles."],
    actividades: ["memoria-funcional", "nback"]
  },
  {
    id: "ejecutivas",
    nombre: "Funciones ejecutivas",
    descripcion: "Iniciar, planificar, organizar, inhibir respuestas, resolver problemas y supervisar el propio desempeño.",
    objetivo: "Completar una tarea cotidiana mediante pasos visibles y revisión del resultado.",
    estrategias: ["Dividir cada tarea en pasos cortos y verificables.", "Usar la secuencia parar, planear, hacer y revisar."],
    actividades: ["planificacion-funcional", "go-nogo", "stroop"]
  },
  {
    id: "lenguaje",
    nombre: "Lenguaje y comunicación",
    descripcion: "Comprender mensajes, encontrar palabras, nombrar y expresar necesidades de forma funcional.",
    objetivo: "Aumentar la eficacia de la comunicación en una situación cotidiana prioritaria.",
    estrategias: ["Usar frases breves, preguntas cerradas y tiempo adicional para responder.", "Añadir apoyos con imágenes, escritura o gestos cuando sean útiles."],
    actividades: ["comunicacion-funcional", "denominacion"]
  },
  {
    id: "velocidad",
    nombre: "Velocidad de procesamiento",
    descripcion: "Comprender y responder a información sin perder precisión por lentificación cognitiva.",
    objetivo: "Aumentar gradualmente la eficiencia sin sacrificar precisión ni provocar fatiga.",
    estrategias: ["Eliminar presión de tiempo al inicio.", "Aumentar la velocidad solo cuando la precisión sea estable."],
    actividades: ["busqueda-visual", "cpt"]
  },
  {
    id: "visuoespacial",
    nombre: "Función visuoespacial y perceptual",
    descripcion: "Explorar el espacio, localizar objetos y organizar información visual, incluida la posible inatención lateral.",
    objetivo: "Mejorar el escaneo visual y la seguridad durante una tarea funcional relevante.",
    estrategias: ["Entrenar el barrido visual sistemático hacia el lado omitido.", "Usar claves visuales de alto contraste en tareas reales."],
    actividades: ["escaneo-funcional", "busqueda-visual"]
  }
]);

export const ACTIVIDADES_EVC = Object.freeze({
  cpt: {
    id: "cpt",
    nombre: "Atención sostenida · CPT",
    descripcion: "Ronda breve para trabajar vigilancia, omisiones y control de respuesta.",
    url: "cpt.html",
    minutos: 8,
    tipo: "Entrenamiento en plataforma"
  },
  "busqueda-visual": {
    id: "busqueda-visual",
    nombre: "Búsqueda y escaneo visual",
    descripcion: "Localizar estímulos con un barrido ordenado, priorizando precisión sobre velocidad.",
    url: "busqueda-visual.html",
    minutos: 8,
    tipo: "Entrenamiento en plataforma"
  },
  nback: {
    id: "nback",
    nombre: "Memoria de trabajo · 1-Back",
    descripcion: "Comparar el estímulo actual con el anterior, comenzando en dificultad baja.",
    url: "nback.html",
    minutos: 7,
    tipo: "Entrenamiento en plataforma"
  },
  "memoria-funcional": {
    id: "memoria-funcional",
    nombre: "Memoria funcional con ayudas externas",
    descripcion: "Practicar una cita, una lista o una rutina usando calendario, alarma y repetición espaciada.",
    minutos: 10,
    tipo: "Actividad funcional"
  },
  "planificacion-funcional": {
    id: "planificacion-funcional",
    nombre: "Planificación paso a paso",
    descripcion: "Elegir una tarea real, anticipar materiales, ordenar pasos y revisar el resultado.",
    minutos: 12,
    tipo: "Actividad funcional"
  },
  "go-nogo": {
    id: "go-nogo",
    nombre: "Control de respuesta · Go / No-Go",
    descripcion: "Practicar inicio y detención de respuestas con ritmo cómodo y supervisión cuando sea necesaria.",
    url: "go-nogo.html",
    minutos: 7,
    tipo: "Entrenamiento en plataforma"
  },
  stroop: {
    id: "stroop",
    nombre: "Inhibición · Stroop",
    descripcion: "Trabajar control inhibitorio priorizando exactitud y tolerancia a la frustración.",
    url: "stroop.html",
    minutos: 7,
    tipo: "Entrenamiento en plataforma"
  },
  "comunicacion-funcional": {
    id: "comunicacion-funcional",
    nombre: "Conversación funcional apoyada",
    descripcion: "Practicar una necesidad cotidiana con frases breves, imágenes, escritura o gestos.",
    minutos: 10,
    tipo: "Actividad funcional"
  },
  denominacion: {
    id: "denominacion",
    nombre: "Denominación con claves",
    descripcion: "Nombrar objetos significativos y usar claves semánticas o fonológicas sin apresurar la respuesta.",
    minutos: 8,
    tipo: "Actividad funcional"
  },
  "escaneo-funcional": {
    id: "escaneo-funcional",
    nombre: "Escaneo en una actividad cotidiana",
    descripcion: "Buscar objetos en una mesa, leer una lista o revisar una bandeja siguiendo un recorrido sistemático.",
    minutos: 10,
    tipo: "Actividad funcional"
  }
});

const ETIQUETAS_DIFICULTAD = Object.freeze({
  0: "Sin apoyo adicional en esta tarea",
  1: "Apoyo ligero sugerido",
  2: "Apoyo moderado sugerido",
  3: "Apoyo alto sugerido"
});

function limitarEntero(valor, minimo, maximo, respaldo) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return respaldo;
  return Math.min(maximo, Math.max(minimo, Math.round(numero)));
}

function normalizarTexto(valor, maximo = 600) {
  return String(valor || "").replace(/\s+/g, " ").trim().slice(0, maximo);
}

function normalizarResultadoPrueba(resultado, dominioId) {
  if (!resultado || typeof resultado !== "object") return null;
  const noEvaluable = Boolean(resultado.noEvaluable);
  const nivelApoyo = noEvaluable
    ? null
    : limitarEntero(resultado.nivelApoyo, 0, 3, null);
  if (!noEvaluable && nivelApoyo === null) return null;
  const metricas = resultado.metricas && typeof resultado.metricas === "object"
    ? Object.fromEntries(Object.entries(resultado.metricas).slice(0, 30).map(([clave, valor]) => [
      normalizarTexto(clave, 60),
      Array.isArray(valor)
        ? valor.slice(0, 20).map((item) => Number.isFinite(Number(item)) ? Number(item) : normalizarTexto(item, 80))
        : Number.isFinite(Number(valor)) && valor !== "" ? Number(valor) : normalizarTexto(valor, 160)
    ]))
    : {};
  return {
    dominio: dominioId,
    pruebaId: normalizarTexto(resultado.pruebaId, 80),
    pruebaNombre: normalizarTexto(resultado.pruebaNombre, 160),
    versionBateria: normalizarTexto(resultado.versionBateria, 30),
    completada: !noEvaluable,
    noEvaluable,
    nivelApoyo,
    etiqueta: noEvaluable ? "No evaluable" : nivelDificultadEvc(nivelApoyo),
    resumen: normalizarTexto(resultado.resumen, 400),
    metricas,
    advertencias: Array.isArray(resultado.advertencias)
      ? resultado.advertencias.slice(0, 8).map((item) => normalizarTexto(item, 300)).filter(Boolean)
      : [],
    interpretacion: normalizarTexto(resultado.interpretacion, 400),
    completadaEn: normalizarTexto(resultado.completadaEn, 40)
  };
}

export function normalizarEvaluacionEvc(entrada = {}) {
  const dominios = {};
  const pruebas = {};
  DOMINIOS_EVC.forEach((dominio) => {
    const resultadoPrueba = normalizarResultadoPrueba(entrada.pruebas?.[dominio.id], dominio.id);
    if (resultadoPrueba) pruebas[dominio.id] = resultadoPrueba;
    const valor = entrada.dominios?.[dominio.id] ?? resultadoPrueba?.nivelApoyo;
    dominios[dominio.id] = valor === "" || valor === null || valor === undefined
      ? null
      : limitarEntero(valor, 0, 3, null);
  });
  return {
    dominios,
    pruebas,
    metaPrincipal: normalizarTexto(entrada.metaPrincipal, 500),
    actividadSignificativa: normalizarTexto(entrada.actividadSignificativa, 300),
    observaciones: normalizarTexto(entrada.observaciones, 1200),
    fatiga: limitarEntero(entrada.fatiga, 0, 3, 1),
    apoyo: ["sin-apoyo", "ocasional", "disponible"].includes(entrada.apoyo) ? entrada.apoyo : "ocasional",
    diasSemana: limitarEntero(entrada.diasSemana, 1, 5, 3),
    fechaEvc: normalizarTexto(entrada.fechaEvc, 10),
    nombrePaciente: normalizarTexto(entrada.nombrePaciente, 160),
    instrumentoReferencia: ["no-aplicado", "ocs-sin-alertas", "ocs-con-alertas", "otra-evaluacion", "no-evaluable"].includes(entrada.instrumentoReferencia)
      ? entrada.instrumentoReferencia
      : "no-aplicado",
    factoresInterferencia: Array.isArray(entrada.factoresInterferencia)
      ? entrada.factoresInterferencia.slice(0, 8).map((item) => normalizarTexto(item, 80)).filter(Boolean)
      : []
  };
}

export function nivelDificultadEvc(puntaje) {
  return ETIQUETAS_DIFICULTAD[puntaje] || "No evaluado";
}

function calcularDuracionSesion(evaluacion, puntajeMaximo) {
  const porFatiga = [30, 25, 20, 15][evaluacion.fatiga] || 20;
  const porDificultad = puntajeMaximo >= 3 ? 15 : puntajeMaximo >= 2 ? 20 : puntajeMaximo >= 1 ? 25 : 30;
  return Math.min(porFatiga, porDificultad);
}

function construirPrioridades(evaluacion) {
  return DOMINIOS_EVC
    .map((dominio, indice) => ({ ...dominio, puntaje: evaluacion.dominios[dominio.id], indice }))
    .filter((dominio) => dominio.puntaje !== null)
    .sort((a, b) => b.puntaje - a.puntaje || a.indice - b.indice);
}

function actividadesUnicas(prioridades) {
  const ids = [];
  prioridades.forEach((dominio) => dominio.actividades.forEach((id) => {
    if (!ids.includes(id)) ids.push(id);
  }));
  return ids.slice(0, 6).map((id) => ACTIVIDADES_EVC[id]).filter(Boolean);
}

function construirProtocolo(evaluacion, minutosSesion) {
  const frecuenciaObjetivo = evaluacion.diasSemana;
  const etiquetaFrecuencia = `${frecuenciaObjetivo} ${frecuenciaObjetivo === 1 ? "sesión" : "sesiones"} por semana`;
  const minutosInicio = Math.min(20, minutosSesion);
  const bloqueCognitivo = Math.max(6, Math.round(minutosSesion * 0.45));
  const bloqueFuncional = Math.max(4, Math.round(minutosSesion * 0.3));
  return {
    nombre: "Protocolo COGNICIÓN-EVC de autorrehabilitación asistida",
    alcance: "Síntesis operativa de estudios de entrenamiento cognitivo y rehabilitación domiciliaria post-EVC; no es un protocolo clínico validado como producto independiente.",
    duracionSemanas: 6,
    fases: [
      {
        periodo: "Semana 1",
        dosis: `3 sesiones de ${minutosInicio} min`,
        objetivo: "Aprender las actividades, comprobar comprensión, tolerancia y apoyos necesarios con supervisión."
      },
      {
        periodo: "Semanas 2–4",
        dosis: `${etiquetaFrecuencia} de hasta ${minutosSesion} min`,
        objetivo: "Práctica adaptativa en uno o dos dominios prioritarios y transferencia inmediata a una tarea cotidiana."
      },
      {
        periodo: "Semanas 5–6",
        dosis: `${etiquetaFrecuencia} de hasta ${minutosSesion} min`,
        objetivo: "Generalizar estrategias a la meta funcional, reducir ayudas de forma gradual y preparar mantenimiento."
      }
    ],
    estructuraSesion: [
      "2 minutos: revisar síntomas nuevos, fatiga, dolor, sueño y disposición para la sesión.",
      `${bloqueCognitivo} minutos: una actividad cognitiva prioritaria con dificultad adaptada.`,
      `${bloqueFuncional} minutos: aplicar la estrategia a una actividad real relacionada con la meta.`,
      "2 minutos: registrar precisión, ayuda requerida, fatiga de 0 a 10 y qué funcionó."
    ],
    progresion: [
      "Cambiar una sola variable a la vez: duración, número de estímulos, distractores o nivel de ayuda.",
      "Aumentar dificultad solo después de dos sesiones toleradas, con precisión estable cercana o superior a 80% dentro de la misma actividad.",
      "Si la precisión cae 15 puntos o más, la fatiga supera 5/10 o aumenta la ayuda, volver al nivel previo y revisar con el profesional."
    ],
    seguimiento: "Contacto clínico o de telerehabilitación al menos semanal y reevaluación de las mismas tareas, factores de interferencia y meta funcional al finalizar la semana 6.",
    criteriosSuspension: [
      "Suspender y solicitar atención urgente ante signos neurológicos súbitos compatibles con un nuevo EVC.",
      "Detener la sesión ante cefalea nueva o intensa, mareo importante, visión súbitamente distinta, dolor torácico, falta de aire, caída o empeoramiento neurológico.",
      "Pausar y avisar al equipo si hay deterioro reproducible durante dos sesiones, frustración intensa o fatiga que no vuelve al nivel habitual con descanso."
    ],
    limites: [
      "No realizar tareas con riesgo físico, conducción, cocina con fuego, manejo de dinero o medicación sin valoración de seguridad.",
      "No usar tDCS, estimulación eléctrica u otra neuroestimulación como autorrehabilitación sin un protocolo médico y supervisión especializada."
    ]
  };
}

export function generarPlanEvc(entrada = {}) {
  const evaluacion = normalizarEvaluacionEvc(entrada);
  const evaluadas = construirPrioridades(evaluacion);
  if (!evaluadas.length) {
    return { valido: false, errores: ["Evalúa al menos un dominio cognitivo antes de crear el plan."], evaluacion };
  }

  const conDificultad = evaluadas.filter((dominio) => dominio.puntaje > 0);
  const prioridades = (conDificultad.length ? conDificultad : evaluadas).slice(0, 3);
  const puntajeMaximo = Math.max(...evaluadas.map((dominio) => dominio.puntaje || 0));
  const minutosSesion = calcularDuracionSesion(evaluacion, puntajeMaximo);
  const actividades = actividadesUnicas(prioridades);
  const apoyos = [
    "Realizar una pausa antes de que aparezca agotamiento, cefalea o frustración.",
    "Registrar precisión, nivel de ayuda y transferencia a una tarea cotidiana; no valorar solo velocidad."
  ];
  if (evaluacion.fatiga >= 2) apoyos.push("Dividir la sesión en bloques de 5 a 8 minutos con descanso entre bloques.");
  if (evaluacion.apoyo === "disponible") apoyos.push("Incluir al cuidador como apoyo para claves, registro y práctica en casa, evitando resolver la tarea por la persona.");
  if (evaluacion.apoyo === "sin-apoyo") apoyos.push("Priorizar ayudas externas simples y revisar la seguridad antes de indicar práctica independiente.");
  if ((evaluacion.dominios.lenguaje || 0) >= 2) apoyos.push("Adaptar instrucciones y coordinar el componente de comunicación con terapia de lenguaje.");
  if ((evaluacion.dominios.visuoespacial || 0) >= 2) apoyos.push("Revisar inatención visual y seguridad funcional con terapia ocupacional o el profesional correspondiente.");

  const alertas = [];
  if (puntajeMaximo >= 3) alertas.push("Hay al menos una tarea con necesidad alta de apoyo: se recomienda evaluación detallada con herramientas validadas antes de cerrar el programa terapéutico.");
  if ((evaluacion.dominios.lenguaje || 0) >= 2) alertas.push("Las dificultades de lenguaje pueden modificar el desempeño en otros dominios; la interpretación debe adaptarse a la comunicación de la persona.");
  if ((evaluacion.dominios.visuoespacial || 0) >= 2) alertas.push("Antes de tareas independientes, valorar el impacto visuoespacial en movilidad, alimentación, vestido y otras actividades de seguridad.");
  const noEvaluables = DOMINIOS_EVC.filter((dominio) => evaluacion.pruebas[dominio.id]?.noEvaluable);
  if (noEvaluables.length) alertas.push(`Dominios no evaluables con esta batería: ${noEvaluables.map((dominio) => dominio.nombre).join(", ")}. Deben adaptarse o valorarse con otro método.`);
  if (evaluacion.factoresInterferencia.length) alertas.push("Hay factores de interferencia registrados; deben considerarse antes de atribuir el resultado a un dominio cognitivo.");
  if (evaluacion.diasSemana < 3) alertas.push("La frecuencia seleccionada es menor que la utilizada habitualmente en los estudios domiciliarios citados; conservarla puede ser apropiado por tolerancia, pero debe revisarse con el profesional.");

  const protocolo = construirProtocolo(evaluacion, minutosSesion);

  return {
    valido: true,
    evaluacion,
    creadoEn: new Date().toISOString(),
    tipo: "borrador_plan_rehabilitacion_cognitiva_post_evc",
    duracionInicialSemanas: protocolo.duracionSemanas,
    revisionSemanas: 1,
    diasSemana: evaluacion.diasSemana,
    minutosSesion,
    prioridades: prioridades.map((dominio) => ({
      id: dominio.id,
      nombre: dominio.nombre,
      puntaje: dominio.puntaje,
      nivel: nivelDificultadEvc(dominio.puntaje),
      objetivo: dominio.objetivo,
      estrategias: [...dominio.estrategias]
    })),
    perfil: DOMINIOS_EVC.map((dominio) => ({
      id: dominio.id,
      nombre: dominio.nombre,
      puntaje: evaluacion.dominios[dominio.id],
      nivel: evaluacion.pruebas[dominio.id]?.noEvaluable ? "No evaluable" : nivelDificultadEvc(evaluacion.dominios[dominio.id]),
      prueba: evaluacion.pruebas[dominio.id] || null
    })),
    actividades,
    apoyos,
    alertas,
    protocolo,
    metaFuncional: evaluacion.metaPrincipal || evaluacion.actividadSignificativa || "Definir con la persona una meta funcional observable y significativa.",
    criterioRevision: "Realizar seguimiento al menos semanal y reevaluar con las mismas tareas y condiciones al finalizar la semana 6."
  };
}

export function resumirPlanEvc(plan) {
  if (!plan?.valido) return "No hay un plan válido para resumir.";
  const lineas = [
    "BORRADOR DE REHABILITACIÓN COGNITIVA POST-EVC",
    plan.evaluacion.nombrePaciente ? `Paciente: ${plan.evaluacion.nombrePaciente}` : "",
    plan.evaluacion.fechaEvc ? `Fecha del EVC: ${plan.evaluacion.fechaEvc}` : "",
    `Meta funcional: ${plan.metaFuncional}`,
    `Dosificación inicial: ${plan.diasSemana} días por semana, hasta ${plan.minutosSesion} minutos por sesión, durante ${plan.duracionInicialSemanas} semanas.`,
    `Prioridades: ${plan.prioridades.map((item) => `${item.nombre} (${item.nivel})`).join("; ")}.`,
    "Actividades:",
    ...plan.actividades.map((actividad) => `- ${actividad.nombre}: ${actividad.descripcion}`),
    "Estrategias y apoyos:",
    ...plan.apoyos.map((apoyo) => `- ${apoyo}`),
    "Progresión:",
    ...plan.protocolo.progresion.map((regla) => `- ${regla}`),
    "Criterios de suspensión:",
    ...plan.protocolo.criteriosSuspension.map((regla) => `- ${regla}`),
    `Seguimiento: ${plan.criterioRevision}`,
    plan.evaluacion.observaciones ? `Observaciones: ${plan.evaluacion.observaciones}` : "",
    "Este perfil es orientativo y no sustituye una evaluación neuropsicológica ni la indicación del equipo interdisciplinario."
  ];
  return lineas.filter(Boolean).join("\n");
}
