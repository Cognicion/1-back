export const ADHD_PROTOCOL_ID = "cognicion-tdah-multicomponente";
export const ADHD_PROTOCOL_VERSION = "1.1.0";
export const ADHD_PROFILE_ENGINE_VERSION = "1.0.0";
export const ADHD_PROGRAM_ENGINE_VERSION = "1.0.0";
export const ADHD_ADAPTIVE_ENGINE_VERSION = "1.0.0";
export const ADHD_METRICS_ENGINE_VERSION = "1.0.0";
export const ADHD_PERSISTENCE_SCHEMA_VERSION = "1.0.0";

export const ADHD_PROGRAM_NOTICE =
  "Programa de rehabilitación y entrenamiento cognitivo basado en evidencia, destinado a complementar el tratamiento integral del TDAH.";

export const ADHD_VALIDATION_NOTICE =
  "Basado en evidencia no significa que el programa COGNICIÓN haya demostrado eficacia clínica propia. Se requieren estudios prospectivos controlados antes de realizar esa afirmación.";

export const ADHD_AGE_MODALITIES = Object.freeze({
  pediatric: Object.freeze({
    id: "pediatric",
    label: "Pediátrica",
    minAge: 6,
    maxAge: 12,
    sessionMinutes: 20,
    instructionStyle: "breve_con_apoyo",
    functionalContexts: ["escuela", "hogar", "rutinas", "tareas"]
  }),
  adolescent: Object.freeze({
    id: "adolescent",
    label: "Adolescentes",
    minAge: 13,
    maxAge: 17,
    sessionMinutes: 25,
    instructionStyle: "directa_colaborativa",
    functionalContexts: ["escuela", "estudio", "rutinas", "vida_social"]
  }),
  adult: Object.freeze({
    id: "adult",
    label: "Adultos",
    minAge: 18,
    maxAge: null,
    sessionMinutes: 30,
    instructionStyle: "clinica_funcional",
    functionalContexts: ["trabajo", "estudio", "hogar", "administracion_personal"]
  })
});

export const ADHD_DOMAINS = Object.freeze({
  sustainedAttention: Object.freeze({ id: "sustainedAttention", label: "Atención sostenida" }),
  inhibitoryControl: Object.freeze({ id: "inhibitoryControl", label: "Control inhibitorio" }),
  interferenceControl: Object.freeze({ id: "interferenceControl", label: "Interferencia y control ejecutivo" }),
  workingMemory: Object.freeze({ id: "workingMemory", label: "Memoria de trabajo y actualización" }),
  cognitiveFlexibility: Object.freeze({ id: "cognitiveFlexibility", label: "Flexibilidad cognitiva" }),
  responseVariability: Object.freeze({ id: "responseVariability", label: "Variabilidad del tiempo de respuesta" }),
  planning: Object.freeze({ id: "planning", label: "Planificación" }),
  temporalControl: Object.freeze({ id: "temporalControl", label: "Gestión y estimación temporal" }),
  metacognition: Object.freeze({ id: "metacognition", label: "Metacognición y autorregulación" }),
  functionalTransfer: Object.freeze({ id: "functionalTransfer", label: "Transferencia funcional" })
});

export const ADHD_TASK_CATALOG = Object.freeze({
  cpt_x: Object.freeze({
    id: "cpt_x",
    label: "CPT-X",
    kind: "existing",
    url: "cpt.html",
    taskVersion: "1.0.0",
    durationMinutes: 6,
    domains: ["sustainedAttention", "responseVariability", "inhibitoryControl"],
    essential: true
  }),
  go_nogo: Object.freeze({
    id: "go_nogo",
    label: "Go / No-Go",
    kind: "existing",
    url: "go-nogo.html",
    taskVersion: "1.1.0",
    durationMinutes: 4,
    domains: ["inhibitoryControl", "sustainedAttention", "responseVariability"],
    essential: true
  }),
  nback: Object.freeze({
    id: "nback",
    label: "N-Back",
    kind: "existing",
    url: "nback.html",
    taskVersion: "1.1.0",
    durationMinutes: 4,
    domains: ["workingMemory", "responseVariability"],
    essential: true
  }),
  stroop: Object.freeze({
    id: "stroop",
    label: "Stroop",
    kind: "existing",
    url: "stroop.html",
    taskVersion: "1.1.0",
    durationMinutes: 3,
    domains: ["interferenceControl", "inhibitoryControl", "responseVariability"],
    essential: true
  }),
  stop_signal: Object.freeze({
    id: "stop_signal",
    label: "Stop-Signal",
    kind: "native",
    taskVersion: "1.0.0",
    durationMinutes: 5,
    domains: ["inhibitoryControl", "responseVariability"],
    essential: true
  }),
  task_switching: Object.freeze({
    id: "task_switching",
    label: "Cambio de reglas",
    kind: "native",
    taskVersion: "1.0.0",
    durationMinutes: 4,
    domains: ["cognitiveFlexibility", "responseVariability"],
    essential: true
  }),
  temporal_estimation: Object.freeze({
    id: "temporal_estimation",
    label: "Estimación temporal",
    kind: "native",
    taskVersion: "1.0.0",
    durationMinutes: 3,
    domains: ["temporalControl", "responseVariability"],
    essential: true
  }),
  route_planning: Object.freeze({
    id: "route_planning",
    label: "Planificación por rutas",
    kind: "native",
    taskVersion: "1.0.0",
    durationMinutes: 4,
    domains: ["planning", "cognitiveFlexibility"],
    essential: true
  }),
  dichotic_listening: Object.freeze({
    id: "dichotic_listening",
    label: "Escucha dicótica",
    kind: "existing",
    url: "escucha-dicotica.html",
    taskVersion: "0.1.0",
    durationMinutes: 12,
    domains: ["sustainedAttention"],
    essential: false,
    optionalReason: "Módulo complementario de atención auditiva/selectiva cuando exista una razón clínica."
  })
});

export const ADHD_ESSENTIAL_BATTERY = Object.freeze([
  "cpt_x",
  "go_nogo",
  "nback",
  "stroop",
  "stop_signal",
  "task_switching",
  "temporal_estimation",
  "route_planning"
]);

export const ADHD_EXPANDED_BATTERY = Object.freeze([
  ...ADHD_ESSENTIAL_BATTERY,
  "dichotic_listening"
]);

export const ADHD_FUNCTIONAL_DIFFICULTIES = Object.freeze([
  ["taskInitiation", "Iniciar tareas", ["metacognition", "planning"]],
  ["taskCompletion", "Terminar tareas", ["metacognition", "planning"]],
  ["sustainedAttention", "Mantener la atención", ["sustainedAttention", "responseVariability"]],
  ["organization", "Organizar actividades", ["planning", "metacognition"]],
  ["instructions", "Recordar instrucciones", ["workingMemory", "metacognition"]],
  ["timeManagement", "Administrar el tiempo", ["temporalControl", "planning"]],
  ["distractors", "Evitar distracciones", ["sustainedAttention", "interferenceControl"]],
  ["impulsivity", "Controlar respuestas impulsivas", ["inhibitoryControl"]],
  ["switching", "Cambiar entre actividades", ["cognitiveFlexibility"]],
  ["prioritization", "Priorizar tareas", ["planning", "metacognition"]],
  ["routines", "Mantener rutinas", ["metacognition", "functionalTransfer"]],
  ["procrastination", "Reducir procrastinación", ["metacognition", "temporalControl"]],
  ["schedules", "Cumplir horarios", ["temporalControl", "functionalTransfer"]],
  ["schoolWork", "Trabajo o escuela", ["sustainedAttention", "planning", "functionalTransfer"]],
  ["homeOrganization", "Organización doméstica", ["planning", "functionalTransfer"]]
].map(([id, label, domains]) => Object.freeze({ id, label, domains })));

export const ADHD_METACOGNITIVE_MODULES = Object.freeze([
  {
    id: "goal_check",
    title: "Pausa para recuperar el objetivo",
    description: "Una pausa breve para volver a elegir la acción relevante antes de responder o cambiar de actividad.",
    domains: ["metacognition", "inhibitoryControl"],
    minutes: 4,
    steps: [
      { id: "name_goal", label: "Nombra en una frase qué necesitas terminar ahora." },
      { id: "name_action", label: "Elige la siguiente acción visible y concreta." },
      { id: "name_distraction", label: "Identifica qué podría apartarte del objetivo." },
      { id: "choose_cue", label: "Elige una señal breve para volver: palabra, alarma o nota." }
    ],
    strategyPrompt: "Escribe la frase corta que usarás para recuperar el objetivo.",
    applicationPrompt: "¿En qué actividad real usarás esta pausa y cuál será la señal para hacerla?"
  },
  {
    id: "task_breakdown",
    title: "Convertir una tarea en acciones pequeñas",
    description: "Transforma una tarea amplia en un inicio claro y una secuencia que pueda comprobarse.",
    domains: ["planning", "metacognition"],
    minutes: 5,
    steps: [
      { id: "define_done", label: "Describe cómo se verá la tarea cuando esté suficientemente terminada." },
      { id: "first_action", label: "Define una primera acción que pueda hacerse en menos de cinco minutos." },
      { id: "next_actions", label: "Anota dos o tres acciones posteriores en orden." },
      { id: "check_point", label: "Decide en qué punto revisarás si el plan necesita ajuste." }
    ],
    strategyPrompt: "Resume tu secuencia con verbos de acción, sin escribir el proyecto completo.",
    applicationPrompt: "¿Qué tarea real dividirás y cuándo realizarás la primera acción?"
  },
  {
    id: "external_memory",
    title: "Sacar la información de la memoria",
    description: "Usa una ayuda externa para reducir lo que necesitas mantener mentalmente mientras actúas.",
    domains: ["workingMemory", "metacognition"],
    minutes: 4,
    steps: [
      { id: "capture", label: "Elige qué dato o instrucción no conviene depender de recordar." },
      { id: "choose_support", label: "Selecciona un soporte único: lista, calendario, nota o alarma." },
      { id: "place_support", label: "Coloca la ayuda donde aparecerá justo antes de necesitarla." },
      { id: "confirm_use", label: "Define cómo marcarás que la información ya fue atendida." }
    ],
    strategyPrompt: "Anota la ayuda externa concreta que vas a preparar.",
    applicationPrompt: "¿Qué información real registrarás, dónde la consultarás y en qué momento?"
  },
  {
    id: "environment_setup",
    title: "Preparar un inicio con menos fricción",
    description: "Ajusta el entorno inmediato para hacer más visible la tarea y menos accesibles los distractores previsibles.",
    domains: ["sustainedAttention", "metacognition"],
    minutes: 4,
    steps: [
      { id: "choose_space", label: "Elige el lugar y el material que sí necesitas." },
      { id: "remove_one", label: "Aleja al menos un distractor que suele interrumpirte." },
      { id: "prepare_start", label: "Deja abierta o preparada la primera acción de la tarea." },
      { id: "set_boundary", label: "Define una señal de inicio y una pausa prevista." }
    ],
    strategyPrompt: "Describe el cambio de entorno más pequeño que facilitará empezar.",
    applicationPrompt: "¿Dónde aplicarás este ajuste y qué distractor retirarás antes de comenzar?"
  },
  {
    id: "time_estimation",
    title: "Estimar, medir y recalibrar el tiempo",
    description: "Compara una estimación previa con tiempo observado para mejorar la planificación de la siguiente ocasión.",
    domains: ["temporalControl", "metacognition"],
    minutes: 5,
    steps: [
      { id: "define_segment", label: "Delimita una parte concreta de la actividad." },
      { id: "estimate", label: "Haz una estimación antes de mirar el reloj." },
      { id: "measure", label: "Mide el tiempo real sin cambiar la meta a mitad del intento." },
      { id: "adjust", label: "Anota qué margen usarás la próxima vez." }
    ],
    strategyPrompt: "Registra tu estimación y el margen que usarás para recalibrarla.",
    applicationPrompt: "¿Qué actividad real medirás y en qué momento revisarás la diferencia?"
  },
  {
    id: "priorities",
    title: "Elegir una prioridad y protegerla",
    description: "Distingue lo importante de lo solamente visible o urgente para decidir qué atender primero.",
    domains: ["planning", "metacognition"],
    minutes: 5,
    steps: [
      { id: "list_candidates", label: "Escribe hasta tres asuntos que compiten por tu atención." },
      { id: "choose_criterion", label: "Elige un criterio: fecha, consecuencia o compromiso con otra persona." },
      { id: "select_one", label: "Selecciona una prioridad principal usando ese criterio." },
      { id: "park_others", label: "Asigna a lo demás un momento posterior o una lista de espera." }
    ],
    strategyPrompt: "Escribe tu prioridad y el criterio que usaste para elegirla.",
    applicationPrompt: "¿Cuándo comenzarás la prioridad y dónde dejarás anotado lo que pospusiste?"
  },
  {
    id: "task_start",
    title: "Inicio mínimo de cinco minutos",
    description: "Reduce la barrera de inicio comprometiéndote con una acción breve, sin exigir terminar toda la tarea.",
    domains: ["metacognition", "functionalTransfer"],
    minutes: 4,
    steps: [
      { id: "choose_task", label: "Elige una tarea evitada que sea segura y posible hoy." },
      { id: "define_minimum", label: "Define qué harás únicamente durante los primeros cinco minutos." },
      { id: "prepare_timer", label: "Prepara un temporizador y el material de inicio." },
      { id: "choose_after", label: "Al terminar, decide conscientemente si continúas, pausas o reprogramas." }
    ],
    strategyPrompt: "Escribe la acción mínima con la que vas a empezar.",
    applicationPrompt: "¿Qué tarea iniciarás, a qué hora y qué decisión tomarás al sonar el temporizador?"
  },
  {
    id: "error_review",
    title: "Revisión final con una pregunta guía",
    description: "Añade una comprobación breve antes de entregar, enviar o dar por terminada una actividad.",
    domains: ["interferenceControl", "metacognition"],
    minutes: 4,
    steps: [
      { id: "pause", label: "Haz una pausa antes de cerrar o enviar." },
      { id: "choose_risk", label: "Elige el error más probable en esta tarea." },
      { id: "check_once", label: "Comprueba solo ese punto con una regla observable." },
      { id: "close", label: "Marca la revisión como hecha y termina la tarea." }
    ],
    strategyPrompt: "Formula una sola pregunta de revisión que puedas responder sí o no.",
    applicationPrompt: "¿Antes de qué entrega usarás la pregunta y qué error comprobarás?"
  },
  {
    id: "switching_plan",
    title: "Dejar una pista antes de cambiar",
    description: "Conserva el punto de reanudación cuando una transición entre actividades es necesaria.",
    domains: ["cognitiveFlexibility", "metacognition"],
    minutes: 4,
    steps: [
      { id: "close_unit", label: "Completa o detén una unidad pequeña de la actividad actual." },
      { id: "leave_marker", label: "Anota dónde continuarás y cuál es la siguiente acción." },
      { id: "prepare_next", label: "Abre únicamente el material necesario para la nueva actividad." },
      { id: "set_return", label: "Si debes volver, asigna una hora o señal de retorno." }
    ],
    strategyPrompt: "Escribe la pista exacta que dejarás para retomar sin reconstruir todo el contexto.",
    applicationPrompt: "¿Entre qué dos actividades usarás la pista y cuándo volverás a la primera?"
  },
  {
    id: "daily_plan",
    title: "Plan diario de tres compromisos",
    description: "Crea un plan corto que reserve capacidad para imprevistos y haga visible el siguiente paso.",
    domains: ["planning", "temporalControl"],
    minutes: 5,
    steps: [
      { id: "choose_three", label: "Elige como máximo tres compromisos relevantes para el día." },
      { id: "place_one", label: "Asigna al primero una hora y un contexto realistas." },
      { id: "add_margin", label: "Deja un margen entre actividades o para un imprevisto." },
      { id: "review_time", label: "Define una hora breve para revisar y ajustar el plan." }
    ],
    strategyPrompt: "Escribe tus tres compromisos en el orden en que los revisarás.",
    applicationPrompt: "¿Dónde quedará visible el plan y a qué hora harás la revisión breve?"
  }
].map((module) => Object.freeze({
  ...module,
  contentVersion: module.contentVersion || "1.0.0",
  domains: Object.freeze([...module.domains]),
  steps: Object.freeze(module.steps.map((step) => Object.freeze({ ...step })))
})));

export const ADHD_TRANSFER_CHALLENGES = Object.freeze([
  { id: "three_priorities", label: "Organizar las tres tareas principales del día siguiente.", domains: ["planning", "metacognition"] },
  { id: "five_steps", label: "Dividir una tarea grande en cinco pasos observables.", domains: ["planning", "metacognition"] },
  { id: "defined_timer", label: "Usar un temporizador para una actividad definida y registrar el resultado.", domains: ["temporalControl"] },
  { id: "remove_distractors", label: "Preparar el entorno retirando tres distractores antes de iniciar.", domains: ["sustainedAttention", "metacognition"] },
  { id: "five_minute_start", label: "Comenzar una tarea durante cinco minutos aunque la motivación inicial sea baja.", domains: ["metacognition", "functionalTransfer"] },
  { id: "prepare_materials", label: "Preparar los materiales necesarios la noche anterior.", domains: ["planning", "functionalTransfer"] },
  { id: "goal_lapses", label: "Registrar cuándo se perdió el objetivo durante una actividad.", domains: ["metacognition", "responseVariability"] }
].map(Object.freeze));

export const ADHD_DEFAULT_PROGRAM = Object.freeze({
  totalSessions: 24,
  weeks: 6,
  sessionsPerWeek: 4,
  minSessionMinutes: 20,
  maxSessionMinutes: 30,
  intermediateReassessmentSession: 12,
  finalReassessmentSession: 24,
  followUpWeeks: 6,
  adaptiveAccuracyTarget: Object.freeze([0.75, 0.85]),
  telemetryEnabled: false
});

export function resolveAgeModality(age) {
  const numericAge = Number(age);
  if (!Number.isFinite(numericAge) || numericAge < 0) return null;
  if (numericAge < 6) return Object.freeze({
    id: "preschool",
    label: "Menores de 6 años",
    standardProgramAvailable: false,
    notice: "Este programa no se presenta como tratamiento estándar antes de los 6 años. Las intervenciones conductuales con padres/cuidadores y el ambiente tienen mayor respaldo como abordaje no farmacológico en edad preescolar."
  });
  if (numericAge <= 12) return ADHD_AGE_MODALITIES.pediatric;
  if (numericAge <= 17) return ADHD_AGE_MODALITIES.adolescent;
  return ADHD_AGE_MODALITIES.adult;
}

export function getBatteryDefinition(type = "essential") {
  const ids = type === "expanded" ? ADHD_EXPANDED_BATTERY : ADHD_ESSENTIAL_BATTERY;
  return ids.map((id) => ADHD_TASK_CATALOG[id]).filter(Boolean);
}

export function getFunctionalDifficulty(id) {
  return ADHD_FUNCTIONAL_DIFFICULTIES.find((item) => item.id === id) || null;
}

export function getMetacognitiveModule(id) {
  return ADHD_METACOGNITIVE_MODULES.find((module) => module.id === String(id || "")) || null;
}
