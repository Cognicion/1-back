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
  0: "Sin dificultad observada",
  1: "Dificultad leve",
  2: "Dificultad moderada",
  3: "Dificultad marcada"
});

function limitarEntero(valor, minimo, maximo, respaldo) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return respaldo;
  return Math.min(maximo, Math.max(minimo, Math.round(numero)));
}

function normalizarTexto(valor, maximo = 600) {
  return String(valor || "").replace(/\s+/g, " ").trim().slice(0, maximo);
}

export function normalizarEvaluacionEvc(entrada = {}) {
  const dominios = {};
  DOMINIOS_EVC.forEach((dominio) => {
    const valor = entrada.dominios?.[dominio.id];
    dominios[dominio.id] = valor === "" || valor === null || valor === undefined
      ? null
      : limitarEntero(valor, 0, 3, null);
  });
  return {
    dominios,
    metaPrincipal: normalizarTexto(entrada.metaPrincipal, 500),
    actividadSignificativa: normalizarTexto(entrada.actividadSignificativa, 300),
    observaciones: normalizarTexto(entrada.observaciones, 1200),
    fatiga: limitarEntero(entrada.fatiga, 0, 3, 1),
    apoyo: ["sin-apoyo", "ocasional", "disponible"].includes(entrada.apoyo) ? entrada.apoyo : "ocasional",
    diasSemana: limitarEntero(entrada.diasSemana, 1, 5, 3),
    fechaEvc: normalizarTexto(entrada.fechaEvc, 10),
    nombrePaciente: normalizarTexto(entrada.nombrePaciente, 160)
  };
}

export function nivelDificultadEvc(puntaje) {
  return ETIQUETAS_DIFICULTAD[puntaje] || "No evaluado";
}

function calcularDuracionSesion(evaluacion, puntajeMaximo) {
  const porFatiga = [30, 25, 20, 15][evaluacion.fatiga] || 20;
  const porDificultad = puntajeMaximo >= 3 ? 15 : puntajeMaximo >= 2 ? 20 : 25;
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
  if (puntajeMaximo >= 3) alertas.push("Hay al menos una dificultad marcada: se recomienda evaluación detallada con herramientas validadas antes de cerrar el programa terapéutico.");
  if ((evaluacion.dominios.lenguaje || 0) >= 2) alertas.push("Las dificultades de lenguaje pueden modificar el desempeño en otros dominios; la interpretación debe adaptarse a la comunicación de la persona.");
  if ((evaluacion.dominios.visuoespacial || 0) >= 2) alertas.push("Antes de tareas independientes, valorar el impacto visuoespacial en movilidad, alimentación, vestido y otras actividades de seguridad.");

  return {
    valido: true,
    evaluacion,
    creadoEn: new Date().toISOString(),
    tipo: "borrador_plan_rehabilitacion_cognitiva_post_evc",
    duracionInicialSemanas: 4,
    revisionSemanas: 2,
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
    perfil: evaluadas.map((dominio) => ({ id: dominio.id, nombre: dominio.nombre, puntaje: dominio.puntaje, nivel: nivelDificultadEvc(dominio.puntaje) })),
    actividades,
    apoyos,
    alertas,
    metaFuncional: evaluacion.metaPrincipal || evaluacion.actividadSignificativa || "Definir con la persona una meta funcional observable y significativa.",
    criterioRevision: "Revisar tolerancia, nivel de ayuda, desempeño funcional y prioridades con la persona y su red de apoyo cada 2 semanas."
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
    `Seguimiento: ${plan.criterioRevision}`,
    plan.evaluacion.observaciones ? `Observaciones: ${plan.evaluacion.observaciones}` : "",
    "Este perfil es orientativo y no sustituye una evaluación neuropsicológica ni la indicación del equipo interdisciplinario."
  ];
  return lineas.filter(Boolean).join("\n");
}
