import { auth, obtenerFunctions } from "./firebase.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { obtenerUsuario, listarPacientes, medicoPuedeVer } from "./services/usuarios.js";
import { usuarioEsPersonalClinico } from "./utils/roles.js";
import { obtenerNombrePacienteParaMostrar } from "./utils/nombresPacientes.js";
import { createNoteGenerationProvider } from "./services/noteGenerationProviders.js?v=20260719-mental-exam-v1";
import { createConversationSegmentationProvider, crearClientRequestId } from "./services/conversationSegmentationProviders.js?v=20260719-evolution-v2-validation";
import { segmentarConversacionClinica } from "./services/clinicalPipeline.js";
import {
  VOICE_NOTE_FIELD_REGISTRY,
  VOICE_NOTE_PROMPT_VERSION,
  VOICE_NOTE_SCHEMA_VERSION,
  VOICE_NOTE_VALIDATOR_VERSION,
  calcularDecadaDeVida,
  crearTransferSections,
  generarNotaVoz,
  guardarDraftGeneradoVozFirestore,
  guardarSesionVozFirestore,
  guardarTranscripcionVozFirestore,
  leerNotaExistente,
  transferirNotaVozABorrador
} from "./services/voiceNoteGenerationService.js?v=20260719-mental-exam-v1";
import { buscarBorradorNotaClinica } from "./services/notas.js?v=20260716-2";
import {
  VOICE_NOTE_SESSION_SCHEMA_VERSION,
  buscarSesionesNotaVozLocales,
  eliminarSesionNotaVozLocal,
  guardarSegmentacionNotaVozLocal,
  guardarSesionNotaVozLocal,
  hashTextoVoz,
  limpiarSesionesNotaVozVencidas,
  obtenerSegmentacionNotaVozLocal
} from "./services/voiceNoteSessionPersistence.js?v=20260718-session-persistence";
import {
  VOICE_NOTE_CATALOG_VERSION,
  VOICE_NOTE_STYLE_CATALOG_VERSION,
  getCompatibleVoiceStyles,
  getDefaultVoiceNoteType,
  getDefaultVoiceStyle,
  getVoiceNoteType,
  getVoiceNoteStyle,
  getVoiceNoteTypesForService
} from "./services/voiceNoteCatalogService.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const params = new URLSearchParams(location.search);
const initialPatientId = params.get("patientId")
  || params.get("id")
  || params.get("pacienteId")
  || params.get("uidPaciente")
  || "";
const state = {
  user: null,
  perfil: null,
  patientId: initialPatientId,
  encounterId: params.get("encounterId") || params.get("atencionId") || params.get("encuentro") || params.get("encuentroId") || "",
  noteId: params.get("noteId") || params.get("notaId") || "",
  returnUrl: params.get("returnUrl") || "",
  patient: null,
  contextReady: false,
  initialPatientLocked: Boolean(initialPatientId),
  provider: null,
  segmentationProvider: null,
  generated: null,
  transferSections: [],
  transferredNoteId: "",
  conversationSegments: [],
  conversationWarnings: [],
  conversationSegmentationMode: "rule_based",
  segmentationMetadata: null,
  conversationUndo: [],
  conversationRedo: [],
  activeSegmentationRequest: null,
  activeGenerationRequest: null,
  isHydratingSession: true,
  persistenceReady: false,
  persistenceTimer: null,
  recoverableSession: null,
  selectedStep: "preparar",
  lastSavedSessionKey: "",
  generationPreferences: {
    quoteMode: "omit",
    includePatientQuotes: false,
    maxPatientQuotes: 1,
    quotePriority: "automatic"
  },
  quoteCandidates: [],
  acceptedQuotes: [],
  manualQuotes: [],
  encounterObservation: {
    modality: "",
    location: "",
    locationOther: "",
    position: "",
    activities: [],
    behaviors: [],
    interactions: [],
    appearance: [],
    psychomotor: [],
    freeText: "",
    freeTextConfirmed: false
  },
  mentalExam: {
    activeConfigId: "safe_default",
    templateId: "safe_default",
    templateConfirmed: false,
    components: {},
    hiddenDrafts: {},
    generatedText: "",
    generatedOriginalText: "",
    editedManually: false,
    history: []
  }
};

const OBSERVATION_DESTINATIONS = [
  ["evolution", "Evolucion"],
  ["mentalStatusExam", "Examen mental"],
  ["both", "Ambos"]
];

const OBSERVATION_GROUPS = {
  activities: [
    ["asleep", "Se encontraba dormido", "evolution"],
    ["resting", "Se encontraba en reposo", "evolution"],
    ["talking_other_person", "Se encontraba conversando con otra persona", "evolution"],
    ["eating", "Se encontraba comiendo", "evolution"],
    ["doing_activity", "Se encontraba realizando una actividad", "evolution"],
    ["walking", "Se encontraba deambulando", "evolution"],
    ["isolated", "Se encontraba aislado", "evolution"],
    ["other_activity", "Otra actividad", "evolution"]
  ],
  behaviors: [
    ["calm", "Tranquilo", "evolution"],
    ["irritable", "Irritable", "evolution"],
    ["restless", "Inquieto", "evolution"],
    ["agitated", "Agitado", "evolution"],
    ["crying", "Llorando", "evolution"],
    ["somnolent", "Somnoliento", "evolution"],
    ["hostile", "Hostil", "evolution"],
    ["suspicious", "Suspicaz", "evolution"],
    ["cooperative", "Cooperador", "evolution"],
    ["poorly_cooperative", "Poco cooperador", "evolution"],
    ["declined_interview", "No acepto la entrevista", "evolution"],
    ["disorganized_behavior", "Conducta desorganizada", "evolution"],
    ["no_particular_behavior", "Sin conducta particular que documentar", "evolution"]
  ],
  interactions: [
    ["alone", "Se encontraba solo", "evolution"],
    ["talking_patient", "Conversaba con otro paciente", "evolution"],
    ["talking_relative", "Conversaba con un familiar", "evolution"],
    ["talking_staff", "Conversaba con personal de salud", "evolution"],
    ["adequate_interaction", "Interactuaba adecuadamente con otros usuarios", "evolution"],
    ["isolated_from_users", "Permanecia aislado de otros usuarios", "evolution"],
    ["other_interaction", "Otra interaccion", "evolution"]
  ],
  appearance: [
    ["institutional_clothing", "Vestimenta institucional", "mentalStatusExam"],
    ["personal_clothing", "Vestimenta particular", "mentalStatusExam"],
    ["adequate_grooming", "Adecuada higiene y alino", "mentalStatusExam"],
    ["partially_poor_grooming", "Higiene y alino parcialmente descuidados", "mentalStatusExam"],
    ["poor_grooming", "Higiene y alino descuidados", "mentalStatusExam"],
    ["visible_crying", "Llanto evidente", "both"],
    ["visible_injury_manual", "Lesion visible descrita manualmente", "mentalStatusExam"],
    ["other_appearance", "Otra observacion", "mentalStatusExam"]
  ],
  psychomotor: [
    ["preserved", "Conservada", "mentalStatusExam"],
    ["psychomotor_agitation", "Agitacion psicomotriz", "mentalStatusExam"],
    ["psychomotor_retardation", "Retardo psicomotor", "mentalStatusExam"],
    ["restlessness", "Inquietud", "mentalStatusExam"],
    ["observable_tremor", "Temblor observable", "mentalStatusExam"],
    ["involuntary_movements", "Movimientos involuntarios", "mentalStatusExam"],
    ["normal_gait_observed", "Marcha observable sin alteraciones", "mentalStatusExam"],
    ["gait_not_assessable", "Marcha no valorable", "mentalStatusExam"],
    ["other_psychomotor", "Otra", "mentalStatusExam"]
  ]
};

const QUOTE_CATEGORIES = [
  ["mood", "Estado de animo"],
  ["death_ideas", "Ideas de muerte"],
  ["suicidal_ideation", "Ideacion suicida"],
  ["suicidal_intent", "Intencion suicida"],
  ["suicidal_plan", "Plan suicida"],
  ["self_harm", "Autolesiones"],
  ["heteroaggression", "Heteroagresividad"],
  ["delusional_ideas", "Ideas delirantes"],
  ["persecution", "Ideas de persecucion"],
  ["reference", "Ideas de referencia"],
  ["hallucinations", "Alteraciones sensoperceptivas"],
  ["illness_awareness", "Conciencia de enfermedad"],
  ["protective_factors", "Factores protectores"],
  ["support_network", "Red de apoyo"],
  ["future_projection", "Proyeccion a futuro"],
  ["treatment_disposition", "Disposicion al tratamiento"],
  ["substance_use", "Consumo de sustancias"],
  ["clinical_relevance", "Relevancia clinica"]
];

const OBSERVATION_SELECT_COMPONENTS = [
  { key: "modality", label: "Modalidad", group: "context", destination: "evolution", options: [["presencial", "Presencial"], ["videollamada", "Videollamada"], ["llamada_telefonica", "Llamada telefonica"], ["other", "Otra..."]] },
  { key: "location", label: "Lugar", group: "context", destination: "evolution", options: [["cama_correspondiente", "Cama correspondiente"], ["consultorio", "Consultorio"], ["sala_entrevista", "Sala de entrevista"], ["area_comun", "Area comun"], ["domicilio", "Domicilio"], ["urgencias", "Urgencias"], ["other", "Otra..."]] },
  { key: "position", label: "Posicion", group: "context", destination: "evolution", options: [["sedente", "Sedente"], ["decubito", "Decubito"], ["bipedestacion", "Bipedestacion"], ["deambulando", "Deambulando"], ["alterna_posiciones", "Alterna posiciones"], ["other", "Otra..."]] },
  { key: "activity", label: "Actividad inicial", group: "activities", destination: "evolution", options: [["asleep", "Se encontraba dormido"], ["resting", "Se encontraba en reposo"], ["talking_other_person", "Conversando con otra persona"], ["eating", "Comiendo"], ["walking", "Deambulando"], ["isolated", "Aislado"], ["other", "Otra..."]] },
  { key: "behavior", label: "Conducta observable", group: "behaviors", destination: "evolution", options: [["calm", "Tranquilo"], ["irritable", "Irritable"], ["restless", "Inquieto"], ["agitated", "Agitado"], ["crying", "Llorando"], ["somnolent", "Somnoliento"], ["hostile", "Hostil"], ["suspicious", "Suspicaz"], ["cooperative", "Cooperador"], ["poorly_cooperative", "Poco cooperador"], ["declined_interview", "No acepto la entrevista"], ["disorganized_behavior", "Conducta desorganizada"], ["other", "Otra..."]] },
  { key: "interaction", label: "Interaccion", group: "interactions", destination: "evolution", options: [["alone", "Se encontraba solo"], ["talking_patient", "Conversaba con otro paciente"], ["talking_relative", "Conversaba con un familiar"], ["talking_staff", "Conversaba con personal de salud"], ["adequate_interaction", "Interactuaba adecuadamente"], ["isolated_from_users", "Permanecia aislado"], ["other", "Otra..."]] },
  { key: "appearance", label: "Apariencia observable", group: "appearance", destination: "mentalStatusExam", options: [["institutional_clothing", "Vestimenta institucional"], ["personal_clothing", "Vestimenta particular"], ["adequate_grooming", "Adecuada higiene y alino"], ["partially_poor_grooming", "Higiene y alino parcialmente descuidados"], ["poor_grooming", "Higiene y alino descuidados"], ["visible_crying", "Llanto evidente"], ["visible_injury_manual", "Lesion visible descrita manualmente"], ["other", "Otra..."]] },
  { key: "psychomotor", label: "Psicomotricidad", group: "psychomotor", destination: "mentalStatusExam", options: [["preserved", "Conservada"], ["increased", "Aumentada"], ["decreased", "Disminuida"], ["psychomotor_agitation", "Agitacion psicomotriz"], ["psychomotor_retardation", "Retardo psicomotor"], ["restlessness", "Inquietud"], ["observable_tremor", "Temblor observable"], ["involuntary_movements", "Movimientos involuntarios"], ["other", "Otra..."]] }
];

const MENTAL_EXAM_GROUPS = [
  ["appearance", "Apariencia"],
  ["context", "Contexto"],
  ["behavior", "Conducta y psicomotricidad"],
  ["consciousness", "Conciencia y cognicion"],
  ["speech", "Habla y discurso"],
  ["thought", "Pensamiento"],
  ["risk", "Riesgo y sensopercepcion"],
  ["affect", "Afecto y animo"],
  ["judgment", "Juicio, advertencia y proyeccion"]
];

const MENTAL_EXAM_COMPONENTS = [
  ["generalAppearance", "Apariencia general", "appearance", [["from_record", "Tomar del expediente"], ["male", "Hombre"], ["female", "Mujer"], ["neutral", "Redaccion neutral"], ["other", "Otra..."]]],
  ["apparentAge", "Edad aparente", "appearance", [["chronological", "Similar a la cronologica"], ["younger", "Menor que la cronologica"], ["older", "Mayor que la cronologica"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["height", "Talla", "appearance", [["low", "Baja"], ["medium", "Media"], ["high", "Alta"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["build", "Complexion", "appearance", [["ectomorphic", "Ectomorfa"], ["mesomorphic", "Mesomorfa"], ["endomorphic", "Endomorfa"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["integrity", "Integridad", "appearance", [["intact", "Integro/a"], ["not_intact", "No integro/a"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["conformation", "Conformacion", "appearance", [["well_formed", "Bien conformado/a"], ["malformed", "Mal conformado/a"], ["altered", "Alterada a expensas de..."], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["clothing", "Vestimenta", "appearance", [["institutional", "Institucional"], ["personal", "Particular"], ["hospital_non_institutional", "Hospitalaria no institucional"], ["inadequate", "Inadecuada para el contexto"], ["other", "Otra..."]]],
  ["hygiene", "Higiene", "appearance", [["adequate", "Adecuada"], ["partially_poor", "Parcialmente descuidada"], ["poor", "Descuidada"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["grooming", "Alino", "appearance", [["adequate", "Adecuado"], ["partially_poor", "Parcialmente descuidado"], ["poor", "Descuidado"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["place", "Lugar de valoracion", "context", [["bed", "Cama correspondiente"], ["numbered_bed", "Cama con numero..."], ["office", "Consultorio"], ["interview_room", "Sala de entrevista"], ["common_area", "Area comun"], ["emergency", "Urgencias"], ["home", "Domicilio"], ["other", "Otra..."]]],
  ["position", "Posicion", "context", [["sitting", "Sedente"], ["supine", "Decubito dorsal"], ["lateral", "Decubito lateral"], ["standing", "Bipedestacion"], ["walking", "Deambulando"], ["alternating", "Alterna posiciones"], ["other", "Otra..."]]],
  ["accompaniment", "Acompanamiento", "context", [["alone", "Solo/a"], ["relative", "Acompanado/a por familiar"], ["user", "Acompanado/a por otro usuario"], ["staff", "Acompanado/a por personal"], ["other", "Otra..."]]],
  ["initialContext", "Contexto del abordaje", "context", [["resting", "En reposo"], ["asleep", "Dormido/a"], ["talking", "Conversando con otra persona"], ["eating", "Comiendo"], ["walking", "Deambulando"], ["crying", "Llorando"], ["other", "Realizando otra actividad..."]]],
  ["facialExpression", "Expresion facial", "behavior", [["calm", "Tranquila"], ["smiling", "Sonriente"], ["sad", "Triste"], ["angry", "Enojada"], ["irritable", "Irritable"], ["fearful", "Temerosa"], ["anxious", "Ansiosa"], ["perplexed", "Perpleja"], ["inexpressive", "Inexpresiva"], ["somnolent", "Somnolienta"], ["tearful", "Llorosa"], ["changing", "Cambiante"], ["other", "Otra..."]]],
  ["emotionalReactivity", "Reactividad emocional", "behavior", [["adequate", "Adecuada"], ["decreased", "Disminuida"], ["increased", "Aumentada"], ["labile", "Label"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["gait", "Marcha", "behavior", [["normal", "Normal"], ["slow", "Lenta"], ["unstable", "Inestable"], ["ataxic", "Ataxica"], ["claudicant", "Claudicante"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["psychomotricity", "Psicomotricidad", "behavior", [["preserved", "Conservada"], ["mild_increased", "Levemente aumentada"], ["increased", "Aumentada"], ["mild_decreased", "Levemente disminuida"], ["decreased", "Disminuida"], ["agitation", "Agitacion psicomotriz"], ["retardation", "Retardo psicomotor"], ["restlessness", "Inquietud a expensas de..."], ["involuntary", "Movimientos involuntarios..."], ["other", "Otra..."]]],
  ["consciousness", "Nivel de conciencia", "consciousness", [["awake", "Despierto/a"], ["somnolent", "Somnoliento/a"], ["obtunded", "Obnubilado/a"], ["stuporous", "Estuporoso/a"], ["fluctuating", "Fluctuante"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["orientation", "Orientacion", "consciousness", [["global", "Orientado/a globalmente"], ["disoriented_global", "Desorientado/a globalmente"], ["partial", "Orientacion parcialmente conservada"], ["not_assessable", "No valorable"], ["custom", "Personalizar"], ["other", "Otra..."]]],
  ["attitude", "Actitud", "behavior", [["cooperative", "Cooperador/a"], ["partially_cooperative", "Parcialmente cooperador/a"], ["poorly_cooperative", "Poco cooperador/a"], ["not_cooperative", "No cooperador/a"], ["approachable", "Abordable"], ["reticent", "Reticente"], ["suspicious", "Suspicaz"], ["irritable", "Irritable"], ["hostile", "Hostil"], ["evasive", "Evasivo/a"], ["other", "Otra..."]]],
  ["attention", "Atencion", "consciousness", [["adequate", "Dirige, fija y mantiene"], ["partial", "Parcialmente conservada"], ["brief", "Mantiene por periodos cortos"], ["fluctuating", "Fluctuante"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["visualContact", "Contacto visual", "behavior", [["adequate", "Adecuado"], ["intermittent", "Intermitente"], ["brief", "Por periodos cortos"], ["scarce", "Escaso"], ["avoidant", "Evitativo"], ["intense", "Intenso"], ["none", "No establece"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["speech", "Habla", "speech", [["preserved", "Bien articulada, fluente, volumen y velocidad conservados"], ["low_volume", "Volumen bajo"], ["high_volume", "Volumen alto"], ["slow", "Velocidad disminuida"], ["fast", "Velocidad aumentada"], ["dysarthric", "Disartrica"], ["not_fluent", "No fluente"], ["other", "Otra..."]]],
  ["discourse", "Discurso", "speech", [["interview_directed", "Emitido a la entrevista"], ["spontaneous", "Espontaneo"], ["partially_spontaneous", "Parcialmente espontaneo"], ["goal_directed", "Dirigido a meta"], ["tangential", "Tangencial"], ["circumstantial", "Circunstancial"], ["disorganized", "Disgregado"], ["incoherent", "Incoherente"], ["other", "Otra..."]]],
  ["latency", "Latencia de respuesta", "speech", [["preserved", "Conservada"], ["increased", "Aumentada"], ["decreased", "Disminuida"], ["variable", "Variable"], ["other", "Otra..."]]],
  ["thoughtCourse", "Curso del pensamiento", "thought", [["linear", "Lineal"], ["coherent", "Coherente"], ["linear_coherent", "Lineal y coherente"], ["circumstantial", "Circunstancial"], ["tangential", "Tangencial"], ["disorganized", "Disgregado"], ["incoherent", "Incoherente"], ["blocking", "Bloqueos"], ["flight", "Fuga de ideas"], ["perseverative", "Perseverante"], ["other", "Otra..."]]],
  ["thoughtSpeed", "Velocidad del pensamiento", "thought", [["normal", "Sin alteraciones"], ["bradypsychia", "Bradipsiquia"], ["tachypsychia", "Taquipsiquia"], ["variable", "Variable"], ["other", "Otra..."]]],
  ["thoughtContent", "Contenido del pensamiento", "thought", [["congruent", "Congruente"], ["partially_congruent", "Parcialmente congruente"], ["incongruent", "Incongruente"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["delusionalIdeas", "Ideas delirantes", "thought", [["not_integrated", "No se integran"], ["persecution", "Persecucion"], ["harm", "Dano"], ["reference", "Referencia"], ["grandiosity", "Grandeza"], ["guilt", "Culpa"], ["somatic", "Somaticas"], ["religious", "Misticas/religiosas"], ["control", "Control"], ["thought_reading", "Lectura del pensamiento"], ["mixed", "Mixtas"], ["other", "Otra..."]]],
  ["overvaluedIdeas", "Ideas sobrevaloradas", "thought", [["not_integrated", "No se integran"], ["guilt", "Culpa"], ["worthlessness", "Minusvalia"], ["hopelessness", "Desesperanza"], ["harm", "Perjuicio"], ["illness", "Enfermedad"], ["body_image", "Apariencia corporal"], ["religious", "Religiosas"], ["other", "Otra..."]]],
  ["deathIdeas", "Ideas de muerte", "risk", [["denies", "Niega"], ["reports", "Refiere"], ["ambivalent", "Ambivalentes"], ["not_explored", "No exploradas"], ["other", "Otra..."]]],
  ["suicidalIdeation", "Ideacion suicida", "risk", [["denies", "Niega"], ["without_plan", "Refiere sin plan"], ["partial_plan", "Refiere con plan parcialmente estructurado"], ["structured_plan", "Refiere con plan estructurado"], ["conditioned", "Condicionada"], ["ambivalent", "Ambivalente"], ["not_explored", "No explorada"], ["other", "Otra..."]]],
  ["suicidalIntent", "Intencion suicida", "risk", [["denies", "Niega"], ["present", "Presente"], ["ambivalent", "Ambivalente"], ["undetermined", "No determinada"], ["not_explored", "No explorada"], ["other", "Otra..."]]],
  ["suicidalPlan", "Plan suicida", "risk", [["denies", "Niega"], ["present", "Presente"], ["partial", "Parcialmente estructurado"], ["structured", "Estructurado"], ["not_explored", "No explorado"], ["other", "Otra..."]]],
  ["preparatoryBehavior", "Conducta preparatoria", "risk", [["denies", "Niega"], ["present", "Presente"], ["undetermined", "No determinada"], ["not_explored", "No explorada"], ["other", "Otra..."]]],
  ["selfHarm", "Autolesiones", "risk", [["denies", "Niega"], ["reports", "Refiere"], ["not_explored", "No exploradas"], ["other", "Otra..."]]],
  ["heteroaggressiveIdeation", "Ideacion heteroagresiva", "risk", [["denies", "Niega ideas heteroagresivas"], ["without_plan", "Refiere ideas sin plan"], ["with_plan", "Refiere ideas con plan"], ["conditioned", "Riesgo condicionado"], ["not_explored", "No explorada"], ["other", "Otra..."]]],
  ["heteroaggressiveIntent", "Intencion heteroagresiva", "risk", [["denies", "Niega"], ["present", "Presente"], ["ambivalent", "Ambivalente"], ["not_explored", "No explorada"], ["other", "Otra..."]]],
  ["homicidalIdeation", "Ideacion homicida", "risk", [["denies", "Niega"], ["reports", "Refiere"], ["not_explored", "No explorada"], ["other", "Otra..."]]],
  ["perceptionReported", "Sensopercepcion referida", "risk", [["denies", "Niega alteraciones"], ["auditory", "Alucinaciones auditivas"], ["visual", "Alucinaciones visuales"], ["tactile", "Alucinaciones tactiles"], ["olfactory", "Alucinaciones olfativas"], ["gustatory", "Alucinaciones gustativas"], ["illusions", "Ilusiones"], ["depersonalization", "Despersonalizacion"], ["derealization", "Desrealizacion"], ["other", "Otra..."]]],
  ["perceptionObserved", "Sensopercepcion observada", "risk", [["no_apparent", "No impresiona alteraciones"], ["internal_stimuli", "Impresiona responder a estimulos internos"], ["hallucinatory_behavior", "Conducta alucinatoria"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["affect", "Afecto", "affect", [["euthymic", "Eutimico"], ["hypothymic", "Hipotimico"], ["hyperthymic", "Hipertimico"], ["dysphoric", "Disforico"], ["irritable", "Irritable"], ["anxious", "Ansioso"], ["labile", "Label"], ["flat", "Aplanado"], ["blunted", "Embotado"], ["restricted", "Restringido"], ["other", "Otra..."]]],
  ["reportedMood", "Estado de animo referido", "affect", [["calm", "Tranquilo"], ["sad", "Triste"], ["angry", "Enojado"], ["irritable", "Irritable"], ["anxious", "Ansioso"], ["fearful", "Temeroso"], ["happy", "Alegre"], ["indifferent", "Indiferente"], ["other", "Otra..."]]],
  ["affectiveCongruence", "Congruencia afectiva", "affect", [["congruent", "Congruente con el estado de animo"], ["partially_congruent", "Parcialmente congruente"], ["incongruent", "Incongruente"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["judgment", "Juicio", "judgment", [["preserved", "Conservado dentro del marco de la realidad"], ["partially_compromised", "Parcialmente comprometido"], ["decreased", "Disminuido"], ["compromised", "Comprometido"], ["outside_reality", "Fuera del marco de la realidad"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["cognitiveFunctions", "Funciones cognitivas", "judgment", [["preserved", "Impresionan conservadas"], ["partially_decreased", "Impresionan parcialmente disminuidas"], ["decreased", "Impresionan disminuidas"], ["not_assessable", "No valorables"], ["indirect_preserved", "Conservadas a valoracion indirecta"], ["other", "Otra..."]]],
  ["intelligence", "Inteligencia", "judgment", [["average", "Impresiona promedio"], ["below_average", "Impresiona inferior al promedio"], ["above_average", "Impresiona superior al promedio"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["illnessAwareness", "Advertencia de padecimiento mental", "judgment", [["adequate", "Adecuada"], ["partial", "Parcial"], ["poor", "Pobre"], ["none", "Nula"], ["fluctuating", "Fluctuante"], ["not_assessable", "No valorable"], ["other", "Otra..."]]],
  ["futureProjection", "Proyeccion a futuro", "judgment", [["present", "Verbaliza proyeccion a futuro"], ["initial", "Proyeccion inicial"], ["limited", "Proyeccion limitada"], ["none", "No verbaliza proyectos a futuro"], ["absent", "Verbaliza no tener proyeccion"], ["not_explored", "No explorada"], ["other", "Otra..."]]]
];

const $ = (id) => document.getElementById(id);

function escaparHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

function normalizarTextoBusqueda(valor = "") {
  return String(valor || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function calcularEdad(fechaNacimiento = "") {
  if (!fechaNacimiento) return null;
  const fecha = new Date(fechaNacimiento);
  if (Number.isNaN(fecha.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const mes = hoy.getMonth() - fecha.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < fecha.getDate())) edad -= 1;
  return Number.isInteger(edad) && edad >= 0 ? edad : null;
}

function obtenerFechaNacimiento(datos = {}) {
  const institucional = datos.datosInstitucionales || {};
  return datos.fechaNacimiento || institucional.fechaNacimiento || datos.fecha_nacimiento || datos.fechaDeNacimiento || datos.fechaNac || datos.nacimiento || "";
}

function obtenerSexoExpediente(datos = {}) {
  const institucional = datos.datosInstitucionales || {};
  return datos.sexo || institucional.sexo || datos.genero || institucional.genero || "";
}

function crearPatientContext(datos = state.patient || {}) {
  const fechaNacimiento = obtenerFechaNacimiento(datos);
  const edad = Number(datos.edad);
  return {
    id: state.patientId,
    nombreCompleto: obtenerNombrePacienteParaMostrar(datos) || datos.nombreCompleto || datos.nombre || "",
    fechaNacimiento,
    edad: Number.isInteger(edad) ? edad : calcularEdad(fechaNacimiento),
    sexo: obtenerSexoExpediente(datos),
    servicio: $("voiceServicio")?.value || obtenerServicioPaciente(datos),
    diagnosticosActivos: datos.historialDiagnosticos || datos.diagnosticos || [],
    medicamentosActivos: datos.tratamientos || datos.tratamiento || [],
    alergias: datos.alergias || datos.datosClinicosResumen?.alergias || []
  };
}

function opcionesSelect(select, opciones, selected = "") {
  if (!select) return;
  const normalizadas = (opciones || []).map((opcion) => Array.isArray(opcion)
    ? { value: opcion[0], label: opcion[1] }
    : { value: opcion.id || opcion.value || "", label: opcion.label || opcion.text || opcion.id || "" }
  ).filter((opcion) => opcion.value);
  select.innerHTML = normalizadas.length
    ? normalizadas.map(({ value, label }) =>
        `<option value="${escaparHTML(value)}" ${value === selected ? "selected" : ""}>${escaparHTML(label)}</option>`
      ).join("")
    : '<option value="">Sin opciones disponibles</option>';
}

function sanitizarObservacionLibre(value = "") {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function defaultEncounterObservation() {
  return {
    modality: "",
    location: "",
    locationOther: "",
    position: "",
    activities: [],
    behaviors: [],
    interactions: [],
    appearance: [],
    psychomotor: [],
    freeText: "",
    freeTextConfirmed: false
  };
}

function crearMentalExamComponentDefaults() {
  return Object.fromEntries(MENTAL_EXAM_COMPONENTS.map(([key]) => [key, {
    state: "omit",
    value: "",
    otherText: "",
    confirmed: false,
    destinationSections: ["mentalStatusExam"]
  }]));
}

function ensureMentalExamDefaults() {
  state.mentalExam.components = {
    ...crearMentalExamComponentDefaults(),
    ...(state.mentalExam.components || {})
  };
}

function labelForOption(options = [], value = "") {
  return options.find(([optionValue]) => optionValue === value)?.[1] || "";
}

function getMentalComponentDefinition(key = "") {
  return MENTAL_EXAM_COMPONENTS.find(([componentKey]) => componentKey === key);
}

function getMentalComponent(key = "") {
  ensureMentalExamDefaults();
  return state.mentalExam.components[key] || crearMentalExamComponentDefaults()[key];
}

function setMentalComponent(key = "", patch = {}) {
  ensureMentalExamDefaults();
  state.mentalExam.components[key] = {
    ...getMentalComponent(key),
    ...patch
  };
}

function normalizarDestinationSections(value = "evolution") {
  if (value === "both") return ["evolution", "mentalStatusExam"];
  if (value === "mentalStatusExam") return ["mentalStatusExam"];
  return ["evolution"];
}

function normalizarObservationItem(item = {}, fallbackDestination = "evolution") {
  if (!item || typeof item !== "object") return null;
  const value = String(item.value || "").trim();
  if (!value) return null;
  return {
    value,
    label: String(item.label || value).trim(),
    destination: item.destination || fallbackDestination,
    destinationSections: Array.isArray(item.destinationSections)
      ? item.destinationSections.filter(Boolean)
      : normalizarDestinationSections(item.destination || fallbackDestination)
  };
}

function normalizarEncounterObservation(value = {}) {
  const base = defaultEncounterObservation();
  const obs = value && typeof value === "object" ? value : {};
  const normalizada = {
    ...base,
    modality: String(obs.modality || "").trim(),
    location: String(obs.location || "").trim(),
    locationOther: sanitizarObservacionLibre(obs.locationOther || "").slice(0, 80),
    position: String(obs.position || "").trim(),
    freeText: sanitizarObservacionLibre(obs.freeText || ""),
    freeTextConfirmed: Boolean(obs.freeTextConfirmed)
  };
  Object.keys(OBSERVATION_GROUPS).forEach((groupKey) => {
    normalizada[groupKey] = Array.isArray(obs[groupKey])
      ? obs[groupKey].map((item) => normalizarObservationItem(item)).filter(Boolean)
      : [];
  });
  return normalizada;
}

function leerPreferenciasGeneracion() {
  const quoteMode = $("voiceQuoteMode")?.value || "omit";
  const includePatientQuotes = quoteMode !== "omit";
  return {
    quoteMode,
    includePatientQuotes,
    maxPatientQuotes: includePatientQuotes ? Math.max(0, Math.min(3, Number($("voiceMaxPatientQuotes")?.value ?? 1))) : 0,
    quotePriority: includePatientQuotes ? ($("voiceQuotePriority")?.value || "automatic") : "automatic"
  };
}

function leerObservacionEncuentro() {
  const obs = {
    freeText: $("voiceFreeObservation")?.value || "",
    freeTextConfirmed: Boolean($("voiceFreeObservationConfirmed")?.checked)
  };
  Object.keys(OBSERVATION_GROUPS).forEach((groupKey) => { obs[groupKey] = []; });
  OBSERVATION_SELECT_COMPONENTS.forEach((component) => {
    const value = $(`voiceObs_${component.key}`)?.value || "";
    if (!value) return;
    const isOther = value === "other";
    const manual = sanitizarObservacionLibre($(`voiceObsOther_${component.key}`)?.value || "").slice(0, 120);
    const label = isOther ? manual : labelForOption(component.options, value);
    if (!label) return;
    if (component.key === "modality") obs.modality = value;
    else if (component.key === "location") {
      obs.location = value;
      obs.locationOther = isOther ? manual : "";
    } else if (component.key === "position") obs.position = value;
    else {
      obs[component.group].push({
        value,
        label,
        destination: $(`voiceObsDest_${component.key}`)?.value || component.destination
      });
    }
  });
  return normalizarEncounterObservation(obs);
}

function contarObservacionesManuales(obs = state.encounterObservation) {
  const observation = normalizarEncounterObservation(obs);
  let count = 0;
  if (observation.modality) count += 1;
  if (observation.location) count += 1;
  if (observation.position) count += 1;
  Object.keys(OBSERVATION_GROUPS).forEach((groupKey) => {
    count += observation[groupKey].length;
  });
  if (observation.freeText && observation.freeTextConfirmed) count += 1;
  return count;
}

function validarObservacionesPrevias(obs = state.encounterObservation, prefs = state.generationPreferences) {
  const observation = normalizarEncounterObservation(obs);
  const issues = [];
  const has = (group, value) => observation[group]?.some((item) => item.value === value);
  if (has("behaviors", "calm") && has("behaviors", "agitated")) issues.push("tranquilo + agitado");
  if (has("behaviors", "cooperative") && has("behaviors", "declined_interview")) issues.push("cooperador + no acepto entrevista");
  if (observation.position && observation.position !== "alterna_posiciones") {
    const positionActivityConflict = observation.position === "sedente" && has("activities", "walking");
    if (positionActivityConflict) issues.push("sedente + deambulando");
  }
  if (has("activities", "asleep") && (has("activities", "talking_other_person") || has("interactions", "talking_relative") || has("interactions", "talking_patient"))) issues.push("dormido + conversando");
  if (has("interactions", "alone") && (has("interactions", "talking_relative") || has("interactions", "talking_patient") || has("interactions", "talking_staff"))) issues.push("solo + conversando");
  if (has("psychomotor", "preserved") && has("psychomotor", "psychomotor_agitation")) issues.push("psicomotricidad conservada + agitacion psicomotriz");
  if (has("appearance", "adequate_grooming") && (has("appearance", "partially_poor_grooming") || has("appearance", "poor_grooming"))) issues.push("higiene adecuada + higiene descuidada");
  if (has("psychomotor", "normal_gait_observed") && has("psychomotor", "gait_not_assessable")) issues.push("marcha normal + marcha no valorable");
  if (observation.freeText && !observation.freeTextConfirmed) issues.push("texto libre sin confirmacion profesional");
  if (observation.modality === "llamada_telefonica") {
    const visualGroups = ["appearance", "psychomotor"];
    if (observation.location || observation.position || visualGroups.some((group) => observation[group]?.length)) {
      issues.push("hallazgos visuales incompatibles con llamada telefonica");
    }
  }
  if (prefs.includePatientQuotes) {
    const literalPatientUtterance = state.conversationSegments.some((utterance) => utterance.probableRole === "patient" && String(utterance.text || "").trim().length > 4);
    if (!literalPatientUtterance) issues.push("sic. Pac. sin utterances literales del paciente");
  }
  leerMentalExamDesdeControles();
  issues.push(...validarMentalExamContradicciones());
  return issues;
}

function validarMentalExamContradicciones() {
  const issues = [];
  const included = (key, value) => {
    const component = getMentalComponent(key);
    return component.state === "include" && component.confirmed && component.value === value;
  };
  if (included("gait", "normal") && included("gait", "not_assessable")) issues.push("marcha normal + no valorable");
  if (included("psychomotricity", "preserved") && included("psychomotricity", "agitation")) issues.push("psicomotricidad conservada + agitacion");
  if (included("attitude", "cooperative") && included("attitude", "not_cooperative")) issues.push("cooperador + no cooperador");
  if (included("orientation", "global") && included("orientation", "disoriented_global")) issues.push("orientado globalmente + desorientacion");
  if (included("suicidalIdeation", "denies") && (included("suicidalPlan", "present") || included("suicidalPlan", "structured"))) issues.push("niega ideacion suicida + plan suicida");
  if (included("perceptionReported", "denies") && ["auditory", "visual", "tactile", "olfactory", "gustatory"].some((value) => included("perceptionReported", value))) issues.push("niega sensopercepcion + alucinaciones actuales");
  if (included("judgment", "preserved") && included("judgment", "outside_reality")) issues.push("juicio conservado + fuera de realidad");
  if (included("illnessAwareness", "adequate") && included("illnessAwareness", "none")) issues.push("adecuada advertencia + nula");
  if (included("futureProjection", "present") && included("futureProjection", "none")) issues.push("proyeccion presente + no verbaliza proyectos");
  return issues;
}

function actualizarVistaPreviaConfiguracion() {
  state.generationPreferences = leerPreferenciasGeneracion();
  state.encounterObservation = leerObservacionEncuentro();
  const includeQuotes = state.generationPreferences.includePatientQuotes;
  const maxSelect = $("voiceMaxPatientQuotes");
  const prioritySelect = $("voiceQuotePriority");
  if (maxSelect) maxSelect.disabled = !includeQuotes;
  if (prioritySelect) prioritySelect.disabled = !includeQuotes;
  setText("voiceQuoteDescription", includeQuotes
    ? "Se podran incluir citas textuales breves, literales y clinicamente relevantes pronunciadas por el paciente."
    : "La informacion se redactara mediante parafrasis clinica, sin citas textuales.");
  OBSERVATION_SELECT_COMPONENTS.forEach((component) => {
    const otherWrap = $(`voiceObsOtherWrap_${component.key}`);
    if (otherWrap) otherWrap.hidden = ($(`voiceObs_${component.key}`)?.value || "") !== "other";
  });
  const counter = $("voiceFreeObservationCounter");
  if (counter) counter.textContent = `${($("voiceFreeObservation")?.value || "").length}/500`;
  const issues = validarObservacionesPrevias();
  const validation = $("voiceObservationValidation");
  if (validation) {
    validation.hidden = !issues.length;
    validation.textContent = issues.length ? `Estas observaciones son incompatibles. Revise la seleccion: ${issues.join("; ")}.` : "";
  }
  setText("voicePreflightSummary", `Se incorporaran ${contarObservacionesManuales()} observaciones manuales. Las citas textuales estan ${includeQuotes ? "activadas" : "desactivadas"}.`);
  renderQuoteCandidates();
  actualizarResumenMentalExam();
}

function invalidarNotaGeneradaPorConfiguracion() {
  if (!state.generated) return;
  state.generated = null;
  state.transferSections = [];
  renderRevision();
  setText("voiceGenerationProgress", "La configuracion previa cambio. La segmentacion se conserva; regenere la Evolucion.");
}

function obtenerServicioPaciente(datos = {}) {
  const institucional = datos.datosInstitucionales || {};
  return datos.servicioInstitucional
    || datos.servicio
    || datos.servicioActual
    || institucional.servicioInstitucional
    || institucional.servicio
    || institucional.servicioActual
    || "";
}

function obtenerExpedientePaciente(datos = {}) {
  const institucional = datos.datosInstitucionales || {};
  return datos.expedienteCognicion
    || institucional.expedienteCognicion
    || datos.expediente
    || datos.numeroExpediente
    || institucional.expediente
    || institucional.numeroExpediente
    || "Sin expediente";
}

function resolverEncounterId(datos = {}, patientId = state.patientId) {
  const institucional = datos.datosInstitucionales || {};
  const actual = String(state.encounterId || "").trim();
  if (actual && actual !== "actual") return actual;
  return datos.encounterId
    || datos.encuentroId
    || datos.atencionId
    || datos.encuentroActivoId
    || datos.atencionActualId
    || datos.ingresoActivoId
    || institucional.encounterId
    || institucional.encuentroId
    || institucional.atencionId
    || datos.ultimaConsulta
    || (patientId ? `paciente:${patientId}` : "");
}

function construirQueryContexto(extra = {}) {
  const qs = new URLSearchParams();
  if (state.patientId) {
    qs.set("patientId", state.patientId);
    qs.set("id", state.patientId);
  }
  if (state.encounterId) qs.set("encounterId", state.encounterId);
  if (state.noteId) qs.set("noteId", state.noteId);
  Object.entries(extra).forEach(([key, value]) => {
    if (value) qs.set(key, value);
  });
  return qs.toString();
}

function actualizarLinks() {
  const qsBase = construirQueryContexto();
  const qsPaciente = state.patientId ? `?id=${encodeURIComponent(state.patientId)}` : "";
  const qsNota = construirQueryContexto(state.noteId ? { notaId: state.noteId } : {});
  $("linkPacienteVoz")?.setAttribute("href", state.patientId ? `paciente.html${qsPaciente}` : "paciente.html");
  $("linkNotaTradicional")?.setAttribute("href", qsNota ? `nota.html?${qsNota}` : "nota.html");
  const versionedVoiceUrl = qsBase ? `nota-por-voz.html?v=20260719-mental-exam-v1&${qsBase}` : "nota-por-voz.html?v=20260719-mental-exam-v1";
  $("linkNotaVoz")?.setAttribute("href", versionedVoiceUrl);
}

function setPreparacionHabilitada(enabled, message = "") {
  state.contextReady = Boolean(enabled);
  ["btnPrepararMicrofono", "btnGenerarNotaVoz", "btnTransferirNotaVoz"].forEach((id) => {
    const button = $(id);
    if (button) button.disabled = !enabled;
  });
  document.querySelectorAll("[data-step-next='grabar'], [data-step-next='generar']").forEach((button) => {
    button.disabled = !enabled;
  });
  if (message) setText("voiceContextStatus", message);
}

function actualizarResumenPlantilla() {
  const typeId = $("voiceDocumentType")?.value || "";
  const styleId = $("voiceWritingStyle")?.value || "";
  const tipo = getVoiceNoteType(typeId);
  const estilo = getVoiceNoteStyle(styleId);
  const destino = tipo?.destinationFields?.length
    ? tipo.destinationFields.map((key) => VOICE_NOTE_FIELD_REGISTRY[key]?.label || key).join(", ")
    : "No transfiere apartados clínicos";
  const summary = [
    tipo ? `Tipo: ${tipo.label}` : "Tipo pendiente",
    estilo ? `Estilo: ${estilo.label}` : "Estilo pendiente",
    tipo?.templateId ? `Plantilla lógica: ${tipo.templateId}` : "",
    `Destino: ${destino}`,
    `Catálogo: ${VOICE_NOTE_CATALOG_VERSION} / ${VOICE_NOTE_STYLE_CATALOG_VERSION}`
  ].filter(Boolean).join(" · ");
  setText("voiceTemplateSummary", summary);
}

function cargarCatalogosVoz(servicio = "") {
  const tipos = getVoiceNoteTypesForService(servicio);
  const tipoActual = $("voiceDocumentType")?.value || state.documentType || "";
  const tipoDefault = tipos.some((tipo) => tipo.id === tipoActual)
    ? tipoActual
    : getDefaultVoiceNoteType(servicio);
  const tipoSeleccionado = tipos.some((tipo) => tipo.id === tipoDefault) ? tipoDefault : tipos[0]?.id || "nota_completa";
  opcionesSelect($("voiceDocumentType"), tipos, tipoSeleccionado);

  const estilos = getCompatibleVoiceStyles(tipoSeleccionado);
  const estiloActual = $("voiceWritingStyle")?.value || state.writingStyle || "";
  const estiloDefault = estilos.some((estilo) => estilo.id === estiloActual)
    ? estiloActual
    : getDefaultVoiceStyle(tipoSeleccionado);
  const estiloSeleccionado = estilos.some((estilo) => estilo.id === estiloDefault) ? estiloDefault : estilos[0]?.id || "institucional_psiquiatrico_detallado";
  opcionesSelect($("voiceWritingStyle"), estilos, estiloSeleccionado);
  state.documentType = tipoSeleccionado;
  state.writingStyle = estiloSeleccionado;
  actualizarResumenPlantilla();
}

function renderPreflightControls() {
  const observationRows = $("voiceObservationSelectRows");
  if (observationRows) {
    observationRows.innerHTML = OBSERVATION_SELECT_COMPONENTS.map((component) => `
      <div class="voice-select-row">
        <label>${escaparHTML(component.label)}
          <select id="voiceObs_${escaparHTML(component.key)}">
            <option value="">Omitir</option>
            ${component.options.map(([value, label]) => `<option value="${escaparHTML(value)}">${escaparHTML(label)}</option>`).join("")}
          </select>
        </label>
        <label id="voiceObsOtherWrap_${escaparHTML(component.key)}" hidden>Descripcion
          <input id="voiceObsOther_${escaparHTML(component.key)}" maxlength="120" placeholder="Describa lo observado">
        </label>
        <label>Destino
          <select id="voiceObsDest_${escaparHTML(component.key)}">
            ${OBSERVATION_DESTINATIONS.map(([value, label]) => `<option value="${escaparHTML(value)}" ${value === component.destination ? "selected" : ""}>${escaparHTML(label)}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="boton-secundario" data-clear-observation="${escaparHTML(component.key)}">Limpiar</button>
      </div>
    `).join("");
  }
  renderMentalExamControls();
  aplicarPreflightStateAControles();
  actualizarVistaPreviaConfiguracion();
}

function renderMentalExamControls() {
  ensureMentalExamDefaults();
  const container = $("voiceMentalExamGroups");
  if (!container) return;
  container.innerHTML = MENTAL_EXAM_GROUPS.map(([groupKey, groupLabel]) => {
    const components = MENTAL_EXAM_COMPONENTS.filter(([, , componentGroup]) => componentGroup === groupKey);
    return `
      <details>
        <summary>${escaparHTML(groupLabel)}</summary>
        <div class="voice-select-rows">
          ${components.map(([key, label, _group, options]) => `
            <div class="voice-select-row" data-mental-row="${escaparHTML(key)}">
              <label>${escaparHTML(label)}
                <select id="mentalState_${escaparHTML(key)}" data-mental-state="${escaparHTML(key)}">
                  <option value="omit">Omitir de esta nota</option>
                  <option value="include">Incluir y configurar</option>
                  <option value="hidden">Ocultar del formulario</option>
                </select>
              </label>
              <label class="mental-value-wrap" id="mentalValueWrap_${escaparHTML(key)}">Valor
                <select id="mentalValue_${escaparHTML(key)}" data-mental-value="${escaparHTML(key)}">
                  <option value="">Omitir</option>
                  ${options.map(([value, optionLabel]) => `<option value="${escaparHTML(value)}">${escaparHTML(optionLabel)}</option>`).join("")}
                </select>
              </label>
              <label id="mentalOtherWrap_${escaparHTML(key)}" hidden>Otra descripcion
                <input id="mentalOther_${escaparHTML(key)}" data-mental-other="${escaparHTML(key)}" maxlength="160" placeholder="Describa el hallazgo">
              </label>
              <label class="voice-inline-control"><input id="mentalConfirmed_${escaparHTML(key)}" data-mental-confirmed="${escaparHTML(key)}" type="checkbox"> Revisado</label>
            </div>
          `).join("")}
        </div>
      </details>
    `;
  }).join("");
}

function aplicarMentalExamStateAControles() {
  ensureMentalExamDefaults();
  if ($("voiceMentalExamTemplate")) $("voiceMentalExamTemplate").value = state.mentalExam.templateId || "safe_default";
  if ($("voiceMentalTemplateConfirmed")) $("voiceMentalTemplateConfirmed").checked = Boolean(state.mentalExam.templateConfirmed);
  for (const [key, _label, _group, options] of MENTAL_EXAM_COMPONENTS) {
    const component = getMentalComponent(key);
    const row = document.querySelector(`[data-mental-row="${key}"]`);
    if (row) row.hidden = component.state === "hidden";
    const stateSelect = $(`mentalState_${key}`);
    const valueSelect = $(`mentalValue_${key}`);
    const otherInput = $(`mentalOther_${key}`);
    const confirmed = $(`mentalConfirmed_${key}`);
    const valueWrap = $(`mentalValueWrap_${key}`);
    const otherWrap = $(`mentalOtherWrap_${key}`);
    if (stateSelect) stateSelect.value = component.state || "omit";
    if (valueSelect) valueSelect.value = component.value || "";
    if (otherInput) otherInput.value = component.otherText || "";
    if (confirmed) confirmed.checked = Boolean(component.confirmed);
    if (valueWrap) valueWrap.hidden = component.state !== "include";
    if (otherWrap) {
      const needsOther = ["other", "altered", "numbered_bed", "restlessness", "involuntary"].includes(component.value);
      otherWrap.hidden = component.state !== "include" || !needsOther;
    }
    if (valueSelect && component.state === "include" && component.value && !options.some(([value]) => value === component.value)) {
      valueSelect.value = "";
    }
  }
  actualizarResumenMentalExam();
}

function leerMentalExamDesdeControles() {
  ensureMentalExamDefaults();
  for (const [key] of MENTAL_EXAM_COMPONENTS) {
    setMentalComponent(key, {
      state: $(`mentalState_${key}`)?.value || "omit",
      value: $(`mentalValue_${key}`)?.value || "",
      otherText: sanitizarObservacionLibre($(`mentalOther_${key}`)?.value || "").slice(0, 160),
      confirmed: Boolean($(`mentalConfirmed_${key}`)?.checked)
    });
  }
  state.mentalExam.templateId = $("voiceMentalExamTemplate")?.value || state.mentalExam.templateId || "safe_default";
  state.mentalExam.templateConfirmed = Boolean($("voiceMentalTemplateConfirmed")?.checked);
  return state.mentalExam;
}

function actualizarResumenMentalExam() {
  ensureMentalExamDefaults();
  const counts = { include: 0, omit: 0, hidden: 0 };
  for (const [key] of MENTAL_EXAM_COMPONENTS) {
    const component = getMentalComponent(key);
    counts[component.state || "omit"] = (counts[component.state || "omit"] || 0) + 1;
  }
  setText("voiceMentalExamSummary", `${counts.include || 0} incluidos · ${counts.omit || 0} omitidos · ${counts.hidden || 0} ocultos`);
}

function detectarCategoriaCita(text = "") {
  const lower = normalizarTextoBusqueda(text);
  if (/suicid|quitarme|morir|matarme/.test(lower)) return "suicidal_ideation";
  if (/dano|agredir|lastimar|matar a/.test(lower)) return "heteroaggression";
  if (/persig|vigila|amenaz|me quieren hacer/.test(lower)) return "persecution";
  if (/voces|escucho|veo cosas|alucin/.test(lower)) return "hallucinations";
  if (/tratamiento|medicamento|pastilla|acepto|no quiero/.test(lower)) return "treatment_disposition";
  if (/mama|madre|familia|apoyo/.test(lower)) return "support_network";
  if (/futuro|trabajar|vivir|seguir|quiero volver/.test(lower)) return "future_projection";
  if (/triste|harta|ansios|enojad|tranquil|mal|bien/.test(lower)) return "mood";
  if (/droga|metanfetamina|cannabis|alcohol|consumo/.test(lower)) return "substance_use";
  if (/seguro|creo|entiendo|enfermedad|paso/.test(lower)) return "illness_awareness";
  return "clinical_relevance";
}

function detectarCitasCandidatas() {
  const candidates = [];
  for (const utterance of state.conversationSegments || []) {
    if (utterance.probableRole !== "patient" || !["answer", "correction"].includes(utterance.speechAct)) continue;
    const text = String(utterance.text || "").trim();
    if (text.length < 8 || text.length > 180) continue;
    const category = detectarCategoriaCita(text);
    if (category === "clinical_relevance" && text.length < 18) continue;
    candidates.push({
      id: `quote-${utterance.id}`,
      text,
      originalText: text,
      category,
      sourceRole: "patient",
      sourceType: "utterance_literal_quote",
      sourceUtteranceIds: [utterance.id],
      confidence: category === "clinical_relevance" ? 0.62 : 0.82,
      destinationSections: ["evolution", "mentalStatusExam"],
      include: false,
      manuallyEdited: false,
      manuallyConfirmed: true
    });
  }
  state.quoteCandidates = candidates.slice(0, 12);
  renderQuoteCandidates();
  programarPersistenciaVoz("quotes-detected");
}

function renderQuoteCandidates() {
  const container = $("voiceQuoteCandidates");
  if (!container) return;
  const mode = state.generationPreferences?.quoteMode || "omit";
  if (mode === "omit") {
    container.textContent = "Citas omitidas.";
    return;
  }
  const candidates = [...(state.quoteCandidates || []), ...(state.manualQuotes || [])];
  if (!candidates.length) {
    container.innerHTML = '<p class="voice-summary-inline">Sin citas candidatas. Puede detectar o agregar una cita manual.</p>';
    return;
  }
  container.innerHTML = candidates.map((quote) => {
    const categoryLabel = QUOTE_CATEGORIES.find(([id]) => id === quote.category)?.[1] || "Relevancia clinica";
    return `
      <article class="voice-quote-item">
        <label class="voice-inline-control"><input type="checkbox" data-quote-include="${escaparHTML(quote.id)}" ${quote.include ? "checked" : ""}> Incluir</label>
        <strong>${escaparHTML(categoryLabel)}</strong>
        <p>“${escaparHTML(quote.text)}”</p>
        <small>Paciente · ${escaparHTML((quote.sourceUtteranceIds || []).join(", ") || quote.sourceType)} · confianza ${Math.round((quote.confidence || 0.7) * 100)}%</small>
        <textarea data-quote-edit="${escaparHTML(quote.id)}" maxlength="220">${escaparHTML(quote.text)}</textarea>
        <label class="voice-inline-control"><input type="checkbox" data-quote-confirm="${escaparHTML(quote.id)}" ${quote.manuallyConfirmed !== false ? "checked" : ""}> Confirmo literalidad</label>
      </article>
    `;
  }).join("");
}

function getAcceptedQuotes() {
  const limit = Number(state.generationPreferences?.maxPatientQuotes ?? 1);
  const quotes = [...(state.quoteCandidates || []), ...(state.manualQuotes || [])]
    .filter((quote) => quote.include && quote.manuallyConfirmed !== false)
    .slice(0, limit || undefined);
  state.acceptedQuotes = quotes;
  return quotes;
}

function generoPacienteParaEem() {
  const sexo = normalizarTextoBusqueda(crearPatientContext().sexo || "");
  if (/mujer|femenino|fem/.test(sexo)) return "f";
  if (/hombre|masculino|masc/.test(sexo)) return "m";
  const appearance = getMentalComponent("generalAppearance").value;
  if (appearance === "female") return "f";
  if (appearance === "male") return "m";
  return "n";
}

function adjGenero(masc = "", fem = "", neutral = "") {
  const g = generoPacienteParaEem();
  if (g === "f") return fem || masc;
  if (g === "m") return masc;
  return neutral || masc;
}

function valorMental(key = "") {
  const def = getMentalComponentDefinition(key);
  if (!def) return "";
  const component = getMentalComponent(key);
  if (component.state !== "include" || !component.confirmed || !component.value) return "";
  if (component.value === "other" || component.value === "altered" || component.value === "numbered_bed" || component.value === "restlessness" || component.value === "involuntary") {
    return component.otherText || "";
  }
  return labelForOption(def[3], component.value);
}

function fraseMental(key = "", map = {}) {
  const component = getMentalComponent(key);
  if (component.state !== "include" || !component.confirmed || !component.value) return "";
  if (map[component.value]) return typeof map[component.value] === "function" ? map[component.value](component) : map[component.value];
  return valorMental(key);
}

function generarExamenMentalLocal() {
  leerMentalExamDesdeControles();
  const sourceObservationIds = [];
  const include = (key) => {
    const component = getMentalComponent(key);
    if (component.state === "include" && component.confirmed && component.value) sourceObservationIds.push(`mental:${key}`);
    return component.state === "include" && component.confirmed && component.value;
  };
  const frases = [];
  const apariencia = [
    fraseMental("generalAppearance", {
      from_record: () => adjGenero("Hombre", "Mujer", "Persona"),
      male: "Hombre",
      female: "Mujer",
      neutral: "Persona"
    }),
    fraseMental("apparentAge", {
      chronological: `de edad aparente similar a la referida como cronologica`,
      younger: "de edad aparente menor a la referida como cronologica",
      older: "de edad aparente mayor a la referida como cronologica",
      not_assessable: "de edad aparente no valorable"
    }),
    fraseMental("height", { low: "talla baja", medium: "talla media", high: "talla alta", not_assessable: "talla no valorable" }),
    fraseMental("build", { ectomorphic: "complexion ectomorfa", mesomorphic: "complexion mesomorfa", endomorphic: "complexion endomorfa", not_assessable: "complexion no valorable" }),
    fraseMental("integrity", { intact: adjGenero("integro", "integra", "integra"), not_intact: adjGenero("no integro", "no integra", "no integra"), not_assessable: "integridad corporal no valorable" }),
    fraseMental("conformation", { well_formed: adjGenero("bien conformado", "bien conformada", "bien conformada"), malformed: adjGenero("mal conformado", "mal conformada", "mal conformada"), not_assessable: "conformacion no valorable" })
  ].filter(Boolean);
  if (apariencia.length) frases.push(`${apariencia.join(", ")}.`);

  const vestido = [];
  if (include("clothing")) vestido.push(`Porta ${valorMental("clothing").toLowerCase()}`);
  const higiene = valorMental("hygiene");
  const grooming = valorMental("grooming");
  if (higiene || grooming) vestido.push(`en ${[higiene && `higiene ${higiene.toLowerCase()}`, grooming && `alino ${grooming.toLowerCase()}`].filter(Boolean).join(" y ")}`);
  if (vestido.length) frases.push(`${vestido.join(", ")}.`);

  const contexto = [];
  if (include("place")) contexto.push(`valorado en ${valorMental("place").toLowerCase()}`);
  if (include("position")) contexto.push(`en posicion ${valorMental("position").toLowerCase()}`);
  if (include("accompaniment")) contexto.push(valorMental("accompaniment").toLowerCase());
  if (include("initialContext")) contexto.push(valorMental("initialContext").toLowerCase());
  if (contexto.length) frases.push(`Es ${adjGenero("valorado", "valorada", "valorada")} ${contexto.join(", ")}.`);

  const conducta = [
    include("facialExpression") && `Expresion facial ${valorMental("facialExpression").toLowerCase()}`,
    include("emotionalReactivity") && `reactividad emocional ${valorMental("emotionalReactivity").toLowerCase()}`,
    include("gait") && `marcha ${valorMental("gait").toLowerCase()}`,
    include("psychomotricity") && `psicomotricidad ${valorMental("psychomotricity").toLowerCase()}`
  ].filter(Boolean);
  if (conducta.length) frases.push(`${conducta.join(". ")}.`);

  const conciencia = [
    include("consciousness") && valorMental("consciousness"),
    include("orientation") && valorMental("orientation"),
    include("attitude") && `actitud ${valorMental("attitude").toLowerCase()}`,
    include("attention") && `atencion ${valorMental("attention").toLowerCase()}`,
    include("visualContact") && `contacto visual ${valorMental("visualContact").toLowerCase()}`
  ].filter(Boolean);
  if (conciencia.length) frases.push(`${conciencia.join(". ")}.`);

  const lenguaje = [
    include("speech") && `Habla ${valorMental("speech").toLowerCase()}`,
    include("discourse") && `discurso ${valorMental("discourse").toLowerCase()}`,
    include("latency") && `latencia de respuesta ${valorMental("latency").toLowerCase()}`
  ].filter(Boolean);
  if (lenguaje.length) frases.push(`${lenguaje.join(". ")}.`);

  const pensamiento = [
    include("thoughtCourse") && `Curso del pensamiento ${valorMental("thoughtCourse").toLowerCase()}`,
    include("thoughtSpeed") && `velocidad del pensamiento ${valorMental("thoughtSpeed").toLowerCase()}`,
    include("thoughtContent") && `contenido del pensamiento ${valorMental("thoughtContent").toLowerCase()}`,
    include("delusionalIdeas") && `ideas delirantes: ${valorMental("delusionalIdeas").toLowerCase()}`,
    include("overvaluedIdeas") && `ideas sobrevaloradas: ${valorMental("overvaluedIdeas").toLowerCase()}`
  ].filter(Boolean);
  if (pensamiento.length) frases.push(`${pensamiento.join(". ")}.`);

  const riesgo = ["deathIdeas", "suicidalIdeation", "suicidalIntent", "suicidalPlan", "preparatoryBehavior", "selfHarm", "heteroaggressiveIdeation", "heteroaggressiveIntent", "homicidalIdeation", "perceptionReported", "perceptionObserved"]
    .filter(include)
    .map((key) => `${getMentalComponentDefinition(key)[1]}: ${valorMental(key).toLowerCase()}`);
  if (riesgo.length) frases.push(riesgo.join(". ") + ".");

  const afecto = [
    include("affect") && `Afecto ${valorMental("affect").toLowerCase()}`,
    include("reportedMood") && `estado de animo referido como ${valorMental("reportedMood").toLowerCase()}`,
    include("affectiveCongruence") && valorMental("affectiveCongruence")
  ].filter(Boolean);
  if (afecto.length) frases.push(`${afecto.join(". ")}.`);

  const juicio = [
    include("judgment") && `Juicio ${valorMental("judgment").toLowerCase()}`,
    include("cognitiveFunctions") && `otras funciones cognitivas ${valorMental("cognitiveFunctions").toLowerCase()}`,
    include("intelligence") && `inteligencia ${valorMental("intelligence").toLowerCase()}`,
    include("illnessAwareness") && `${valorMental("illnessAwareness")} advertencia de padecimiento mental`,
    include("futureProjection") && valorMental("futureProjection")
  ].filter(Boolean);
  if (juicio.length) frases.push(`${juicio.join(". ")}.`);

  const text = frases.join(" ").replace(/\s+/g, " ").trim();
  return {
    text,
    sourceObservationIds,
    sourceUtteranceIds: [],
    selectedQuoteIds: getAcceptedQuotes().map((quote) => quote.id),
    confidence: text ? 0.9 : null,
    requiresReview: true,
    warnings: []
  };
}

function aplicarPlantillaMentalExam(templateId = "safe_default") {
  state.mentalExam.templateId = templateId;
  state.mentalExam.components = crearMentalExamComponentDefaults();
  const set = (key, value) => setMentalComponent(key, { state: "include", value, confirmed: false });
  if (templateId === "normal_institutional") {
    [["apparentAge", "chronological"], ["height", "medium"], ["build", "mesomorphic"], ["integrity", "intact"], ["conformation", "well_formed"], ["hygiene", "adequate"], ["grooming", "adequate"], ["facialExpression", "calm"], ["gait", "normal"], ["psychomotricity", "preserved"], ["consciousness", "awake"], ["orientation", "global"], ["attitude", "cooperative"], ["attention", "adequate"], ["visualContact", "adequate"], ["speech", "preserved"], ["latency", "preserved"], ["thoughtCourse", "linear_coherent"], ["thoughtSpeed", "normal"], ["thoughtContent", "congruent"], ["perceptionObserved", "no_apparent"], ["judgment", "preserved"], ["cognitiveFunctions", "indirect_preserved"], ["intelligence", "average"]].forEach(([key, value]) => set(key, value));
  } else if (templateId === "depressive") {
    [["facialExpression", "sad"], ["psychomotricity", "mild_decreased"], ["speech", "low_volume"], ["affect", "hypothymic"], ["reportedMood", "sad"], ["thoughtCourse", "linear_coherent"], ["deathIdeas", "not_explored"], ["suicidalIdeation", "not_explored"]].forEach(([key, value]) => set(key, value));
  } else if (templateId === "psychotic") {
    [["thoughtCourse", "linear_coherent"], ["thoughtContent", "partially_congruent"], ["delusionalIdeas", "persecution"], ["perceptionReported", "auditory"], ["judgment", "partially_compromised"], ["illnessAwareness", "partial"]].forEach(([key, value]) => set(key, value));
  } else if (templateId === "agitation") {
    [["facialExpression", "irritable"], ["psychomotricity", "agitation"], ["attitude", "irritable"], ["visualContact", "intense"], ["speech", "fast"], ["affect", "irritable"]].forEach(([key, value]) => set(key, value));
  } else if (templateId === "telehealth") {
    [["place", "office"], ["visualContact", "not_assessable"], ["gait", "not_assessable"], ["psychomotricity", "not_assessable"]].forEach(([key, value]) => set(key, value));
  }
  aplicarMentalExamStateAControles();
}

function aplicarPreflightStateAControles() {
  const prefs = state.generationPreferences || {};
  if ($("voiceQuoteMode")) $("voiceQuoteMode").value = prefs.quoteMode || (prefs.includePatientQuotes ? "auto" : "omit");
  if ($("voiceMaxPatientQuotes")) $("voiceMaxPatientQuotes").value = String(prefs.maxPatientQuotes ?? 1);
  if ($("voiceQuotePriority")) $("voiceQuotePriority").value = prefs.quotePriority || "automatic";

  const obs = normalizarEncounterObservation(state.encounterObservation);
  OBSERVATION_SELECT_COMPONENTS.forEach((component) => {
    const select = $(`voiceObs_${component.key}`);
    const other = $(`voiceObsOther_${component.key}`);
    const dest = $(`voiceObsDest_${component.key}`);
    let selected = "";
    let otherText = "";
    let destination = component.destination;
    if (component.key === "modality") selected = obs.modality;
    else if (component.key === "location") {
      selected = obs.location;
      otherText = obs.locationOther;
    } else if (component.key === "position") selected = obs.position;
    else {
      const item = obs[component.group]?.[0] || null;
      selected = item?.value || "";
      otherText = item?.value === "other" ? item.label : "";
      destination = item?.destination || item?.destinationSections?.[0] || component.destination;
    }
    if (select) select.value = selected;
    if (other) other.value = otherText;
    if (dest) dest.value = destination === "mentalStatusExam" ? "mentalStatusExam" : destination === "both" ? "both" : "evolution";
  });
  if ($("voiceFreeObservation")) $("voiceFreeObservation").value = obs.freeText;
  if ($("voiceFreeObservationConfirmed")) $("voiceFreeObservationConfirmed").checked = obs.freeTextConfirmed;
  aplicarMentalExamStateAControles();
}

function hayDatosVoz() {
  const textoDictado = $("textoDictadoClinico")?.value?.trim();
  const textoCorregido = $("voiceCorrectedTranscript")?.value?.trim();
  const dictadoActivo = ["listening", "paused", "reconnecting", "processing", "completed"]
    .includes(window.cognicionDictado?.diagnostico?.().state || "");
  return Boolean(textoDictado || textoCorregido || state.conversationSegments.length || state.generated || dictadoActivo);
}

function contextoPersistenciaVoz() {
  return {
    userId: state.user?.uid || "",
    patientId: state.patientId || "",
    encounterId: $("voiceEncounterId")?.value?.trim() || state.encounterId || ""
  };
}

function configuracionNotaActual() {
  const noteType = $("voiceDocumentType")?.value || state.documentType || getDefaultVoiceNoteType($("voiceServicio")?.value || "");
  const styleId = $("voiceWritingStyle")?.value || state.writingStyle || getDefaultVoiceStyle(noteType);
  const tipo = getVoiceNoteType(noteType);
  return {
    noteType,
    styleId,
    templateId: tipo?.templateId || "",
    promptVersion: VOICE_NOTE_PROMPT_VERSION
  };
}

function generatedNotePersistible() {
  const editedEvolution = state.transferSections?.find((section) => section.key === "evolutionOrSubjective" || section.fieldTarget === "evolutionOrSubjective");
  const editedMental = state.transferSections?.find((section) => section.key === "mentalStatusExam" || section.fieldTarget === "mentalStatusExam");
  const evolution = state.generated?.sections?.evolution
    || state.generated?.generatedClinicalText?.evolutionOrSubjective
    || state.generated?.generatedClinicalText?.subjective
    || null;
  const mental = state.generated?.sections?.mentalExam
    || state.generated?.generatedClinicalText?.objective?.mentalStatusExam
    || null;
  const text = editedEvolution?.content || evolution?.text || "";
  const mentalText = editedMental?.content || mental?.text || state.mentalExam.generatedText || "";
  if (!text && !mentalText) return null;
  return {
    evolution: {
      text,
      sourceUtteranceIds: evolution?.sourceUtteranceIds || evolution?.sourceSegmentIds || [],
      confidence: evolution?.confidence ?? null,
      requiresReview: evolution?.requiresReview !== false,
      warnings: evolution?.warnings || []
    },
    mentalExam: mentalText ? {
      text: mentalText,
      sourceObservationIds: mental?.sourceObservationIds || [],
      sourceUtteranceIds: mental?.sourceUtteranceIds || [],
      selectedQuoteIds: mental?.selectedQuoteIds || [],
      confidence: mental?.confidence ?? null,
      requiresReview: true,
      warnings: mental?.warnings || []
    } : null,
    provider: state.generated?.provider || "",
    model: state.generated?.model || "",
    promptVersion: state.generated?.promptVersion || VOICE_NOTE_PROMPT_VERSION,
    schemaVersion: state.generated?.schemaVersion || VOICE_NOTE_SCHEMA_VERSION,
    generationPreferences: state.generated?.generationPreferences || state.generationPreferences,
    encounterObservation: state.generated?.encounterObservation || state.encounterObservation,
    generatedAt: state.generated?.generatedAt || new Date().toISOString()
  };
}

function construirBorradorSesionVoz() {
  const context = contextoPersistenciaVoz();
  const snapshot = snapshotDictado();
  const corrected = $("voiceCorrectedTranscript")?.value?.trim() || snapshot.correctedTranscript || "";
  const original = $("textoDictadoClinico")?.value?.trim() || snapshot.confirmedTranscript || corrected;
  const transcriptHash = hashTextoVoz(corrected || original);
  const sessionId = snapshot.transcriptSessionId || window.cognicionDictado?.sessionId || "manual";
  return {
    schemaVersion: VOICE_NOTE_SESSION_SCHEMA_VERSION,
    sessionId,
    ...context,
    createdAt: snapshot.provenance?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentStep: state.selectedStep || "preparar",
    noteConfiguration: configuracionNotaActual(),
    generationPreferences: state.generationPreferences || leerPreferenciasGeneracion(),
    encounterObservation: state.encounterObservation || leerObservacionEncuentro(),
    quoteCandidates: state.quoteCandidates || [],
    acceptedQuotes: state.acceptedQuotes || [],
    manualQuotes: state.manualQuotes || [],
    mentalExam: {
      activeConfigId: state.mentalExam.activeConfigId || "safe_default",
      templateId: state.mentalExam.templateId || "safe_default",
      templateConfirmed: Boolean(state.mentalExam.templateConfirmed),
      components: state.mentalExam.components || crearMentalExamComponentDefaults(),
      hiddenDrafts: state.mentalExam.hiddenDrafts || {},
      generatedText: state.mentalExam.generatedText || "",
      generatedOriginalText: state.mentalExam.generatedOriginalText || "",
      editedManually: Boolean(state.mentalExam.editedManually),
      history: state.mentalExam.history || []
    },
    transcript: {
      original,
      corrected,
      transcriptId: snapshot.transcriptSessionId || sessionId,
      transcriptHash,
      sourceSegments: snapshot.transcriptSegments || []
    },
    segmentation: {
      provider: state.segmentationMetadata?.provider || (state.conversationSegments.length ? state.conversationSegmentationMode : ""),
      mode: state.conversationSegmentationMode || "rule_based",
      promptVersion: state.segmentationMetadata?.promptVersion || "",
      model: state.segmentationMetadata?.model || "",
      transcriptHash: state.segmentationMetadata?.transcriptHash || transcriptHash,
      utterances: state.conversationSegments || [],
      warnings: state.conversationWarnings || [],
      completedBlocks: state.segmentationMetadata?.completedBlocks ?? state.segmentationMetadata?.externalBlockCount ?? 0,
      totalBlocks: state.segmentationMetadata?.totalBlocks ?? state.segmentationMetadata?.blockCount ?? 0,
      pendingBlocks: state.segmentationMetadata?.pendingBlocks ?? 0,
      manuallyEdited: Boolean(state.segmentationMetadata?.manuallyEdited),
      generatedAt: state.segmentationMetadata?.generatedAt || ""
    },
    generatedNote: generatedNotePersistible(),
    uiState: {
      selectedStep: state.selectedStep || "preparar",
      expandedWarnings: []
    }
  };
}

function programarPersistenciaVoz(reason = "update") {
  if (state.isHydratingSession || !state.persistenceReady) return;
  if (state.persistenceTimer) window.clearTimeout(state.persistenceTimer);
  state.persistenceTimer = window.setTimeout(() => persistirSesionVoz(reason), 850);
}

async function persistirSesionVoz(reason = "update") {
  if (state.isHydratingSession || !state.persistenceReady || !state.user?.uid || !state.patientId) return null;
  const draft = construirBorradorSesionVoz();
  if (!draft.transcript.corrected && !draft.transcript.original && !draft.segmentation.utterances.length && !draft.generatedNote) return null;
  const saved = await guardarSesionNotaVozLocal(draft);
  state.lastSavedSessionKey = saved?.key || state.lastSavedSessionKey;
  if (draft.segmentation.utterances.length && ["external", "hybrid"].includes(draft.segmentation.provider || draft.segmentation.mode)) {
    await guardarSegmentacionNotaVozLocal({
      ...contextoPersistenciaVoz(),
      transcriptHash: draft.transcript.transcriptHash,
      promptVersion: draft.segmentation.promptVersion || "conversation_segmentation_es_mx_v2_2026-07-18",
      model: draft.segmentation.model || "external_callable",
      segmenterVersion: "conversation_segmentation_client_blocks_v1_2026-07-18",
      provider: draft.segmentation.provider,
      mode: draft.segmentation.mode,
      utterances: draft.segmentation.utterances,
      warnings: draft.segmentation.warnings,
      completedBlocks: draft.segmentation.completedBlocks,
      totalBlocks: draft.segmentation.totalBlocks,
      pendingBlocks: draft.segmentation.pendingBlocks,
      generatedAt: draft.segmentation.generatedAt || new Date().toISOString(),
      reason
    });
  }
  return saved;
}

function flushPersistenciaVoz(reason = "flush") {
  if (state.persistenceTimer) {
    window.clearTimeout(state.persistenceTimer);
    state.persistenceTimer = null;
  }
  return persistirSesionVoz(reason).catch((error) => {
    console.warn("No se pudo guardar la sesion de nota por voz:", error?.name || "error");
    return null;
  });
}

function mostrarPanelRecuperacionSesion(session = null) {
  const panel = $("voiceSessionRecovery");
  if (!panel) return;
  state.recoverableSession = session;
  panel.hidden = !session;
  if (!session) return;
  const transcriptLength = String(session.transcript?.corrected || session.transcript?.original || "").length;
  const utteranceCount = session.segmentation?.utterances?.length || 0;
  const blocks = session.segmentation?.totalBlocks
    ? `${session.segmentation.completedBlocks || 0}/${session.segmentation.totalBlocks} bloques`
    : "bloques no registrados";
  setText("voiceSessionRecoverySummary", [
    `Paciente: ${session.patientId}`,
    `Encuentro: ${session.encounterId}`,
    `Fecha: ${session.updatedAt || session.createdAt || "sin fecha"}`,
    `Etapa: ${session.currentStep || session.uiState?.selectedStep || "sin etapa"}`,
    `Transcripcion: ${transcriptLength} caracteres`,
    `Segmentacion: ${session.segmentation?.provider || session.segmentation?.mode || "pendiente"} · ${utteranceCount} turnos · ${blocks}`,
    session.generatedNote?.evolution?.text ? "Evolucion generada: si" : "Evolucion generada: no"
  ].join(" · "));
}

async function buscarSesionRecuperableVoz() {
  if (!state.user?.uid || !state.patientId || !state.encounterId) return null;
  const sesiones = await buscarSesionesNotaVozLocales(contextoPersistenciaVoz());
  const session = sesiones[0] || null;
  mostrarPanelRecuperacionSesion(session);
  if (session) setText("voiceContextStatus", "Se encontro una sesion local de nota por voz para este paciente y encuentro.");
  return session;
}

function reconstruirGeneratedDesdeSesion(session = {}) {
  const evolution = session.generatedNote?.evolution;
  const mentalExam = session.generatedNote?.mentalExam;
  if (!evolution?.text && !mentalExam?.text) return null;
  return {
    provider: session.generatedNote.provider || "external",
    model: session.generatedNote.model || "",
    promptVersion: session.generatedNote.promptVersion || VOICE_NOTE_PROMPT_VERSION,
    schemaVersion: session.generatedNote.schemaVersion || VOICE_NOTE_SCHEMA_VERSION,
    sections: {
      evolution: evolution?.text ? {
        text: evolution.text,
        sourceUtteranceIds: evolution.sourceUtteranceIds || [],
        confidence: evolution.confidence ?? null,
        requiresReview: evolution.requiresReview !== false,
        warnings: evolution.warnings || []
      } : null,
      mentalExam: mentalExam?.text ? {
        text: mentalExam.text,
        sourceObservationIds: mentalExam.sourceObservationIds || [],
        sourceUtteranceIds: mentalExam.sourceUtteranceIds || [],
        selectedQuoteIds: mentalExam.selectedQuoteIds || [],
        confidence: mentalExam.confidence ?? null,
        requiresReview: true,
        warnings: mentalExam.warnings || []
      } : null
    },
    generatedClinicalText: {
      evolutionOrSubjective: {
        text: evolution?.text || "",
        sourceUtteranceIds: evolution?.sourceUtteranceIds || [],
        sourceSegmentIds: evolution?.sourceUtteranceIds || [],
        warnings: evolution?.warnings || [],
        requiresReview: evolution?.requiresReview !== false
      },
      subjective: {
        text: evolution?.text || "",
        sourceUtteranceIds: evolution?.sourceUtteranceIds || [],
        sourceSegmentIds: evolution?.sourceUtteranceIds || [],
        warnings: evolution?.warnings || [],
        requiresReview: evolution?.requiresReview !== false
      },
      objective: {
        mentalStatusExam: mentalExam?.text || ""
      },
      analysis: {},
      plan: {}
    },
    validationIssues: [...(evolution?.warnings || []), ...(mentalExam?.warnings || [])]
  };
}

async function recuperarSesionVoz(session = state.recoverableSession) {
  if (!session) return;
  state.isHydratingSession = true;
  const context = contextoPersistenciaVoz();
  if (session.userId !== context.userId || session.patientId !== context.patientId || session.encounterId !== context.encounterId) {
    alert("La sesion guardada pertenece a otro paciente o encuentro.");
    state.isHydratingSession = false;
    return;
  }
  const restoredOriginal = session.transcript?.original || session.transcript?.corrected || "";
  const restoredCorrected = session.transcript?.corrected || session.transcript?.original || "";
  const restoredHash = hashTextoVoz(restoredCorrected || restoredOriginal);
  const segmentationHash = session.segmentation?.transcriptHash || session.transcript?.transcriptHash || "";
  const segmentationMatchesTranscript = !session.segmentation?.utterances?.length || !segmentationHash || segmentationHash === restoredHash;
  $("textoDictadoClinico").value = restoredOriginal;
  $("voiceCorrectedTranscript").value = restoredCorrected;
  window.cognicionDictado?.restoreFromSnapshot?.({
    sessionId: session.sessionId,
    transcriptSessionId: session.transcript?.transcriptId || session.sessionId,
    text: restoredOriginal,
    correctedTranscript: restoredCorrected,
    confirmedTranscript: restoredOriginal,
    confirmedSegments: session.transcript?.sourceSegments || [],
    patientId: session.patientId,
    userId: session.userId,
    encounterId: session.encounterId
  });
  if (session.noteConfiguration?.noteType && $("voiceDocumentType")) $("voiceDocumentType").value = session.noteConfiguration.noteType;
  if (session.noteConfiguration?.styleId && $("voiceWritingStyle")) $("voiceWritingStyle").value = session.noteConfiguration.styleId;
  state.documentType = $("voiceDocumentType")?.value || session.noteConfiguration?.noteType || state.documentType;
  state.writingStyle = $("voiceWritingStyle")?.value || session.noteConfiguration?.styleId || state.writingStyle;
  state.generationPreferences = {
    quoteMode: session.generationPreferences?.quoteMode || (session.generationPreferences?.includePatientQuotes ? "auto" : "omit"),
    includePatientQuotes: Boolean(session.generationPreferences?.includePatientQuotes),
    maxPatientQuotes: Number(session.generationPreferences?.maxPatientQuotes) === 0
      ? 0
      : Math.min(3, Math.max(1, Number(session.generationPreferences?.maxPatientQuotes || 1))),
    quotePriority: session.generationPreferences?.quotePriority || "automatic"
  };
  if (!session.generationPreferences && session.generatedNote?.generationPreferences) {
    state.generationPreferences = {
      quoteMode: session.generatedNote.generationPreferences.quoteMode || (session.generatedNote.generationPreferences.includePatientQuotes ? "auto" : "omit"),
      includePatientQuotes: Boolean(session.generatedNote.generationPreferences.includePatientQuotes),
      maxPatientQuotes: Number(session.generatedNote.generationPreferences.maxPatientQuotes) === 0
        ? 0
        : Math.min(3, Math.max(1, Number(session.generatedNote.generationPreferences.maxPatientQuotes || 1))),
      quotePriority: session.generatedNote.generationPreferences.quotePriority || "automatic"
    };
  }
  state.encounterObservation = normalizarEncounterObservation(session.encounterObservation || {});
  if (!session.encounterObservation && session.generatedNote?.encounterObservation) {
    state.encounterObservation = normalizarEncounterObservation(session.generatedNote.encounterObservation);
  }
  state.quoteCandidates = Array.isArray(session.quoteCandidates) ? session.quoteCandidates : [];
  state.acceptedQuotes = Array.isArray(session.acceptedQuotes) ? session.acceptedQuotes : [];
  state.manualQuotes = Array.isArray(session.manualQuotes) ? session.manualQuotes : [];
  state.mentalExam = {
    ...state.mentalExam,
    ...(session.mentalExam || {}),
    components: {
      ...crearMentalExamComponentDefaults(),
      ...(session.mentalExam?.components || {})
    }
  };
  aplicarPreflightStateAControles();
  actualizarVistaPreviaConfiguracion();
  state.conversationSegments = segmentationMatchesTranscript ? (session.segmentation?.utterances || []) : [];
  state.conversationWarnings = segmentationMatchesTranscript
    ? (session.segmentation?.warnings || [])
    : [{ code: "transcript_hash_mismatch", message: "La transcripcion cambio desde la segmentacion guardada. Reprocese los fragmentos afectados." }];
  state.conversationSegmentationMode = segmentationMatchesTranscript
    ? (session.segmentation?.mode || session.segmentation?.provider || "rule_based")
    : "rule_based";
  state.segmentationMetadata = {
    provider: session.segmentation?.provider || state.conversationSegmentationMode,
    mode: state.conversationSegmentationMode,
    promptVersion: session.segmentation?.promptVersion || "",
    model: session.segmentation?.model || "",
    transcriptHash: segmentationMatchesTranscript ? (segmentationHash || restoredHash) : restoredHash,
    completedBlocks: segmentationMatchesTranscript ? (session.segmentation?.completedBlocks || 0) : 0,
    totalBlocks: segmentationMatchesTranscript ? (session.segmentation?.totalBlocks || 0) : 0,
    pendingBlocks: segmentationMatchesTranscript ? (session.segmentation?.pendingBlocks || 0) : 0,
    manuallyEdited: Boolean(session.segmentation?.manuallyEdited),
    generatedAt: session.segmentation?.generatedAt || ""
  };
  state.generated = segmentationMatchesTranscript ? reconstruirGeneratedDesdeSesion(session) : null;
  state.transferSections = state.generated
    ? crearTransferSections(state.generated, $("voiceCorrectedTranscript")?.value || "", crearPatientContext())
    : [];
  state.lastSavedSessionKey = session.key || "";
  actualizarResumenPlantilla();
  renderSegmentosConversacionalesActuales();
  renderRevision();
  setText("voiceSegmentationStatus", state.conversationSegments.length
    ? `Segmentacion recuperada. Proveedor: ${state.segmentationMetadata.provider || "local"} · modo: ${state.conversationSegmentationMode} · turnos: ${state.conversationSegments.length}.`
    : "Transcripcion recuperada. Segmentacion pendiente o invalidada por cambios en el texto.");
  setText("voiceGenerationProgress", state.generated ? "Evolucion recuperada. Revise antes de transferir." : "La generacion no modifica la nota tradicional.");
  mostrarPanelRecuperacionSesion(null);
  state.isHydratingSession = false;
  state.persistenceReady = true;
  mostrarPaso(session.uiState?.selectedStep || session.currentStep || "transcripcion");
  await flushPersistenciaVoz("session-restored");
}

async function descartarSesionVoz(session = state.recoverableSession) {
  if (!session) return;
  const tieneContenido = Boolean(session.transcript?.corrected || session.transcript?.original || session.segmentation?.utterances?.length || session.generatedNote?.evolution?.text);
  if (tieneContenido && !confirm("Se eliminara la sesion local recuperable de este paciente y encuentro. La nota tradicional no se modificara.")) return;
  await eliminarSesionNotaVozLocal(session);
  mostrarPanelRecuperacionSesion(null);
  state.persistenceReady = true;
  state.isHydratingSession = false;
  setText("voiceContextStatus", "Sesion local descartada.");
}

async function iniciarNuevaSesionVoz() {
  mostrarPanelRecuperacionSesion(null);
  state.recoverableSession = null;
  state.persistenceReady = true;
  state.isHydratingSession = false;
  setText("voiceContextStatus", "Nueva sesion lista. El borrador anterior se conserva aislado hasta vencer o descartarse.");
}

function mostrarPaso(step) {
  if (!state.contextReady && step !== "preparar") {
    alert("Primero carga y valida el paciente.");
    return;
  }
  state.selectedStep = step;
  document.querySelectorAll(".voice-step-panel").forEach((panel) => {
    panel.hidden = panel.id !== `step-${step}`;
  });
  document.querySelectorAll("[data-step-target]").forEach((button) => {
    button.classList.toggle("activo", button.dataset.stepTarget === step);
  });
  if (step === "transcripcion") sincronizarTranscripcionRevision();
  if (step === "revisar") renderRevision();
  programarPersistenciaVoz("step-change");
}

function snapshotDictado() {
  const base = window.cognicionDictado?.snapshot?.() || {};
  const corrected = $("voiceCorrectedTranscript")?.value?.trim() || $("textoDictadoClinico")?.value?.trim() || base.correctedTranscript || base.confirmedTranscript || "";
  const encounterId = $("voiceEncounterId")?.value?.trim() || state.encounterId || base.encounterId || "";
  return {
    ...base,
    correctedTranscript: corrected,
    confirmedTranscript: base.confirmedTranscript || corrected,
    patientId: state.patientId || base.patientId,
    encounterId
  };
}

function validarAislamientoSesion(snapshot = snapshotDictado()) {
  if (!state.user?.uid) throw new Error("No se pudo validar la sesión del usuario.");
  if (!state.patientId || !state.patient) throw new Error("Primero carga y valida el paciente.");
  const snapshotPatientId = snapshot.patientId || "";
  const snapshotEncounterId = snapshot.encounterId || "";
  const encounterId = $("voiceEncounterId")?.value?.trim() || state.encounterId || "";
  if (snapshotPatientId && snapshotPatientId !== state.patientId) {
    throw new Error("La sesión de dictado pertenece a otro paciente. Recupera o limpia la transcripción antes de continuar.");
  }
  if (snapshotEncounterId && encounterId && snapshotEncounterId !== encounterId) {
    throw new Error("La sesión de dictado pertenece a otro encuentro. Recupera o limpia la transcripción antes de continuar.");
  }
  return { encounterId };
}

function sincronizarTranscripcionRevision() {
  const textarea = $("voiceCorrectedTranscript");
  const texto = $("textoDictadoClinico")?.value || window.cognicionDictado?.snapshot?.().correctedTranscript || "";
  if (textarea && !textarea.value.trim()) textarea.value = texto;
  const textoRevision = textarea?.value || texto;
  const hashActual = hashTextoVoz(textoRevision);
  if (state.conversationSegments.length && state.segmentationMetadata?.transcriptHash === hashActual) {
    renderSegmentosConversacionalesActuales();
    return;
  }
  renderSegmentosConversacionales(textoRevision);
}

function renderSegmentosConversacionales(texto = "") {
  const contenedor = $("voiceConversationSegments");
  if (!contenedor) return;
  const segmentos = segmentarConversacionClinica(texto);
  state.conversationSegments = Array.from(segmentos);
  state.conversationWarnings = segmentos.warnings || [];
  state.conversationSegmentationMode = "rule_based";
  state.segmentationMetadata = {
    provider: "rule_based",
    mode: "linguistic",
    transcriptHash: hashTextoVoz(texto),
    promptVersion: "",
    model: "",
    generatedAt: new Date().toISOString()
  };
  renderSegmentosConversacionalesActuales();
  programarPersistenciaVoz("local-segmentation");
}

async function obtenerProveedorSegmentacion() {
  if (state.segmentationProvider) return state.segmentationProvider;
  try {
    const functionsInstance = await obtenerFunctions();
    state.segmentationProvider = createConversationSegmentationProvider({
      provider: "external",
      external: {
        callable: httpsCallable(functionsInstance, "segmentClinicalConversation", { timeout: 55000 }),
        fallbackToLocal: true
      }
    });
  } catch {
    state.segmentationProvider = createConversationSegmentationProvider({ provider: "local" });
  }
  return state.segmentationProvider;
}

async function segmentarConProveedor() {
  const texto = $("voiceCorrectedTranscript")?.value || $("textoDictadoClinico")?.value || "";
  if (!texto.trim()) {
    alert("No hay transcripcion para segmentar.");
    return;
  }
  if (state.activeSegmentationRequest) return state.activeSegmentationRequest;
  const clientRequestId = crearClientRequestId();
  const button = $("btnSegmentarConversacionVoz");
  if (button) button.disabled = true;
  setText("voiceSegmentationStatus", "Preparando transcripcion...");
  renderDetalleTecnicoSegmentacion(null);
  const provider = await obtenerProveedorSegmentacion();
  const snapshot = snapshotDictado();
  validarAislamientoSesion(snapshot);
  const transcriptHash = hashTextoVoz(texto);
  const cached = await obtenerSegmentacionNotaVozLocal({
    ...contextoPersistenciaVoz(),
    transcriptHash,
    promptVersion: "conversation_segmentation_es_mx_v2_2026-07-18",
    model: "external_callable",
    segmenterVersion: "conversation_segmentation_client_blocks_v1_2026-07-18"
  });
  if (cached?.utterances?.length) {
    state.conversationSegments = cached.utterances || [];
    state.conversationWarnings = cached.warnings || [];
    state.conversationSegmentationMode = cached.mode || cached.provider || "hybrid";
    state.segmentationMetadata = {
      provider: cached.provider || state.conversationSegmentationMode,
      mode: cached.mode || state.conversationSegmentationMode,
      promptVersion: cached.promptVersion || "conversation_segmentation_es_mx_v2_2026-07-18",
      model: cached.model || "external_callable",
      transcriptHash: cached.transcriptHash || transcriptHash,
      completedBlocks: cached.completedBlocks || 0,
      totalBlocks: cached.totalBlocks || 0,
      pendingBlocks: cached.pendingBlocks || 0,
      generatedAt: cached.generatedAt || cached.updatedAt || new Date().toISOString()
    };
    renderSegmentosConversacionalesActuales();
    setText("voiceSegmentationStatus", `Segmentacion recuperada. Proveedor: ${state.segmentationMetadata.provider || "hybrid"} · modo: ${state.conversationSegmentationMode} · turnos: ${state.conversationSegments.length}. No se consumio proveedor externo.`);
    renderDetalleTecnicoSegmentacion(null, {
      clientRequestId,
      stage: "persistent_cache_hit",
      blockCount: state.segmentationMetadata.totalBlocks || 0,
      completedBlocks: state.segmentationMetadata.completedBlocks || 0,
      pendingBlocks: state.segmentationMetadata.pendingBlocks || 0
    });
    if (button) button.disabled = false;
    programarPersistenciaVoz("segmentation-cache-hit");
    return { provider: state.segmentationMetadata.provider, segmentationMode: state.conversationSegmentationMode, utterances: state.conversationSegments, warnings: state.conversationWarnings, cacheHit: true };
  }
  const progressLabels = {
    preparing: "Preparando transcripcion...",
    cache_hit: "Segmentacion guardada.",
    pending_reuse: "Ya hay una segmentacion en proceso...",
    external_block: "Revisando fragmentos ambiguos..."
  };
  state.activeSegmentationRequest = provider.segment({
    transcriptId: snapshot.transcriptSessionId || "manual",
    transcriptSessionId: snapshot.transcriptSessionId || "manual",
    clientRequestId,
    text: texto,
    correctedTranscript: texto,
    transcriptSegments: snapshot.transcriptSegments || [],
    onProgress(progress = {}) {
      const base = progressLabels[progress.stage] || "Identificando hablantes...";
      const suffix = progress.blockCount
        ? ` Bloques: ${progress.completedBlocks || 0}/${progress.blockCount}.`
        : "";
      setText("voiceSegmentationStatus", `${base}${suffix}`);
      renderDetalleTecnicoSegmentacion(null, {
        clientRequestId: progress.clientRequestId || clientRequestId,
        stage: progress.stage || "preparing",
        blockCount: progress.blockCount || 0,
        completedBlocks: progress.completedBlocks || 0,
        pendingBlocks: progress.pendingBlocks || 0
      });
    }
  });
  try {
    const result = await state.activeSegmentationRequest;
    state.conversationSegments = result.utterances || [];
    state.conversationWarnings = result.warnings || [];
    state.conversationSegmentationMode = result.segmentationMode || result.mode || result.provider || "hybrid";
    state.segmentationMetadata = {
      provider: result.provider || state.conversationSegmentationMode,
      mode: result.segmentationMode || result.mode || state.conversationSegmentationMode,
      promptVersion: result.promptVersion || "conversation_segmentation_es_mx_v2_2026-07-18",
      model: result.model || "external_callable",
      transcriptHash,
      completedBlocks: result.metrics?.externalBlockCount || 0,
      totalBlocks: result.metrics?.blockCount || 0,
      pendingBlocks: Math.max(0, (result.metrics?.blockCount || 0) - (result.metrics?.externalBlockCount || 0)),
      generatedAt: new Date().toISOString()
    };
    state.segmentationFailure = result.providerFailure || null;
    renderSegmentosConversacionalesActuales();
    renderDetalleTecnicoSegmentacion(state.segmentationFailure, result.metrics || { clientRequestId });
    if (result.providerFailure) {
      const externalBlocks = Number(result.metrics?.externalBlockCount || 0);
      if (externalBlocks > 0) {
        setText("voiceSegmentationStatus", `Segmentacion avanzada parcialmente disponible. Proveedor: ${result.provider || "hybrid"} · turnos: ${state.conversationSegments.length}`);
      } else {
        setText("voiceSegmentationStatus", "Segmentacion avanzada no disponible. Se conservo la segmentacion basica.");
      }
    } else {
      const cacheText = result.cacheHit ? " Segmentacion guardada reutilizada." : "";
      setText("voiceSegmentationStatus", `Segmentacion completada. Proveedor: ${result.provider || "external"} · modo: ${result.segmentationMode || result.mode || "linguistic"} · turnos: ${state.conversationSegments.length}.${cacheText}`);
    }
    programarPersistenciaVoz("segmentation-complete");
    return result;
  } finally {
    state.activeSegmentationRequest = null;
    if (button) button.disabled = false;
  }
}

const ROLE_LABELS = {
  clinician: "Profesional",
  patient: "Paciente",
  relative: "Familiar",
  unknown: "Desconocido"
};

const ACT_LABELS = {
  question: "Pregunta",
  answer: "Respuesta",
  observation: "Observacion",
  clinical_summary: "Resumen",
  clinical_assessment: "Analisis",
  plan: "Plan",
  correction: "Correccion",
  other: "Otro"
};

function renderDetalleTecnicoSegmentacion(failure = null, metrics = null) {
  const panel = $("voiceSegmentationTechnicalDetail");
  if (!panel) return;
  if (!failure && !metrics) {
    panel.hidden = true;
    panel.open = false;
    return;
  }
  const details = failure?.details || {};
  panel.hidden = false;
  setText("voiceSegmentationTechnicalCode", failure?.code || failure?.name || (metrics?.cacheHit ? "cache_hit" : "ok"));
  setText("voiceSegmentationTechnicalStage", failure?.stage || details.stage || metrics?.stage || "completada");
  setText("voiceSegmentationTechnicalRequestId", failure?.requestId || details.requestId || metrics?.clientRequestId || "no_disponible");
  setText("voiceSegmentationTechnicalRetryable", (failure?.retryable || details.retryable) ? "si" : "no");
  setText("voiceSegmentationTechnicalDuration", Number.isFinite(Number(metrics?.elapsedMs)) ? `${Math.round(Number(metrics.elapsedMs))} ms` : "-");
  setText("voiceSegmentationTechnicalBlocks", Number.isFinite(Number(metrics?.blockCount)) ? `${metrics.externalBlockCount || metrics.completedBlocks || 0}/${metrics.blockCount}` : "-");
}

function etiquetaRolActo(segmento = {}) {
  return `${ROLE_LABELS[segmento.probableRole] || segmento.probableRole || "Desconocido"} · ${ACT_LABELS[segmento.speechAct] || segmento.speechAct || "Otro"}`;
}

function guardarHistorialSegmentacion() {
  state.conversationUndo.push(JSON.stringify(state.conversationSegments));
  if (state.conversationUndo.length > 30) state.conversationUndo.shift();
  state.conversationRedo = [];
  state.segmentationMetadata = { ...(state.segmentationMetadata || {}), manuallyEdited: true };
}

function normalizarSegmentosConversacion() {
  state.conversationSegments.forEach((segmento, index) => {
    segmento.sequence = index + 1;
    segmento.id ||= `utt-${index + 1}`;
    segmento.utteranceId ||= segmento.id;
    segmento.isQuestion = segmento.speechAct === "question";
    segmento.isAnswer = ["answer", "correction"].includes(segmento.speechAct);
  });
}

function opcionesSegmentacion(options, value) {
  return Object.entries(options).map(([key, label]) =>
    `<option value="${escaparHTML(key)}" ${key === value ? "selected" : ""}>${escaparHTML(label)}</option>`
  ).join("");
}

function renderSegmentosConversacionalesActuales() {
  const contenedor = $("voiceConversationSegments");
  if (!contenedor) return;
  normalizarSegmentosConversacion();
  const segmentos = state.conversationSegments.slice(0, 120);
  const advertencias = state.conversationWarnings || [];
  contenedor.innerHTML = `
    <div class="voice-segmentation-summary">
      <span>${segmentos.length} turnos</span>
      <span>Modo: ${escaparHTML(state.conversationSegmentationMode || "linguistico")}</span>
      <span>${advertencias.length ? "Revisar advertencias" : "Segmentacion basica. Revise los hablantes."}</span>
      <button type="button" data-seg-undo ${state.conversationUndo.length ? "" : "disabled"}>Deshacer</button>
      <button type="button" data-seg-redo ${state.conversationRedo.length ? "" : "disabled"}>Rehacer</button>
    </div>
    ${advertencias.length ? `<div class="voice-segmentation-warnings">${advertencias.map((warning) => `<p>${escaparHTML(warning.message || "Requiere revision.")}</p>`).join("")}</div>` : ""}
    ${segmentos.length ? segmentos.map((segmento, index) => `
      <article class="voice-segment voice-segment-${escaparHTML(segmento.probableRole || "unknown")}">
        <header>
          <strong>${escaparHTML(etiquetaRolActo(segmento))}</strong>
          <span>#${segmento.sequence}</span>
        </header>
        <p>${escaparHTML(segmento.text || segmento.originalText || "")}</p>
        ${segmento.linkedUtteranceId || segmento.linkedQuestionId ? `<small>Vinculado con: ${escaparHTML(segmento.linkedUtteranceId || segmento.linkedQuestionId)}</small>` : ""}
        <div class="voice-segment-controls">
          <label>Rol
            <select data-seg-role="${index}">${opcionesSegmentacion(ROLE_LABELS, segmento.probableRole || "unknown")}</select>
          </label>
          <label>Acto
            <select data-seg-act="${index}">${opcionesSegmentacion(ACT_LABELS, segmento.speechAct || "other")}</select>
          </label>
          <button type="button" data-seg-split="${index}">Dividir</button>
          <button type="button" data-seg-join="${index}" ${index === 0 ? "disabled" : ""}>Unir con anterior</button>
        </div>
      </article>
    `).join("") : "Sin segmentos."}
  `;

  contenedor.querySelector("[data-seg-undo]")?.addEventListener("click", deshacerSegmentacion);
  contenedor.querySelector("[data-seg-redo]")?.addEventListener("click", rehacerSegmentacion);
  contenedor.querySelectorAll("[data-seg-role]").forEach((select) => {
    select.addEventListener("change", () => {
      guardarHistorialSegmentacion();
      state.conversationSegments[Number(select.dataset.segRole)].probableRole = select.value;
      renderSegmentosConversacionalesActuales();
      programarPersistenciaVoz("manual-role-edit");
    });
  });
  contenedor.querySelectorAll("[data-seg-act]").forEach((select) => {
    select.addEventListener("change", () => {
      guardarHistorialSegmentacion();
      state.conversationSegments[Number(select.dataset.segAct)].speechAct = select.value;
      renderSegmentosConversacionalesActuales();
      programarPersistenciaVoz("manual-act-edit");
    });
  });
  contenedor.querySelectorAll("[data-seg-split]").forEach((button) => {
    button.addEventListener("click", () => dividirSegmentoConversacional(Number(button.dataset.segSplit)));
  });
  contenedor.querySelectorAll("[data-seg-join]").forEach((button) => {
    button.addEventListener("click", () => unirSegmentoConversacional(Number(button.dataset.segJoin)));
  });
}

function dividirSegmentoConversacional(index) {
  const segmento = state.conversationSegments[index];
  if (!segmento) return;
  const base = segmento.text || segmento.originalText || "";
  const palabras = base.split(/\s+/).filter(Boolean);
  if (palabras.length < 4) return;
  guardarHistorialSegmentacion();
  const mitad = Math.max(2, Math.floor(palabras.length / 2));
  const primero = palabras.slice(0, mitad).join(" ");
  const segundo = palabras.slice(mitad).join(" ");
  const idNuevo = `utt-manual-${Date.now()}`;
  state.conversationSegments.splice(index, 1,
    { ...segmento, text: primero, originalText: primero },
    { ...segmento, id: idNuevo, utteranceId: idNuevo, text: segundo, originalText: segundo, requiresReview: true }
  );
  renderSegmentosConversacionalesActuales();
  programarPersistenciaVoz("manual-split");
}

function unirSegmentoConversacional(index) {
  if (index <= 0 || !state.conversationSegments[index]) return;
  guardarHistorialSegmentacion();
  const anterior = state.conversationSegments[index - 1];
  const actual = state.conversationSegments[index];
  anterior.text = `${anterior.text || anterior.originalText || ""} ${actual.text || actual.originalText || ""}`.trim();
  anterior.originalText = `${anterior.originalText || ""} ${actual.originalText || actual.text || ""}`.trim();
  anterior.requiresReview = true;
  state.conversationSegments.splice(index, 1);
  renderSegmentosConversacionalesActuales();
  programarPersistenciaVoz("manual-merge");
}

function deshacerSegmentacion() {
  const previo = state.conversationUndo.pop();
  if (!previo) return;
  state.conversationRedo.push(JSON.stringify(state.conversationSegments));
  state.conversationSegments = JSON.parse(previo);
  renderSegmentosConversacionalesActuales();
  state.segmentationMetadata = { ...(state.segmentationMetadata || {}), manuallyEdited: true };
  programarPersistenciaVoz("manual-undo");
}

function rehacerSegmentacion() {
  const siguiente = state.conversationRedo.pop();
  if (!siguiente) return;
  state.conversationUndo.push(JSON.stringify(state.conversationSegments));
  state.conversationSegments = JSON.parse(siguiente);
  renderSegmentosConversacionalesActuales();
  state.segmentationMetadata = { ...(state.segmentationMetadata || {}), manuallyEdited: true };
  programarPersistenciaVoz("manual-redo");
}

async function cargarPaciente(patientId) {
  state.persistenceReady = false;
  state.isHydratingSession = true;
  setPreparacionHabilitada(false, "Validando paciente...");
  if (!patientId || !state.user?.uid) {
    state.patient = null;
    setText("voicePatientSummary", "Selecciona un paciente para iniciar.");
    setPreparacionHabilitada(false, "Paciente pendiente.");
    state.isHydratingSession = false;
    return;
  }
  if (!(await medicoPuedeVer(state.user.uid, patientId))) {
    alert("No tienes permiso para acceder a este paciente.");
    location.href = "medico.html";
    return;
  }
  const datos = await obtenerUsuario(patientId);
  if (!datos) {
    state.patient = null;
    setText("voicePatientSummary", "No se encontró el paciente solicitado o no está disponible.");
    setPreparacionHabilitada(false, "Paciente no disponible.");
    state.isHydratingSession = false;
    return;
  }
  state.patient = datos || {};
  state.patientId = patientId;
  state.encounterId = resolverEncounterId(datos, patientId);
  const selector = $("uidPaciente");
  if (selector && !Array.from(selector.options).some((option) => option.value === patientId)) {
    const option = document.createElement("option");
    option.value = patientId;
    option.textContent = obtenerNombrePacienteParaMostrar(datos || {}) || patientId;
    selector.appendChild(option);
  }
  if (selector) selector.value = patientId;
  const ctx = crearPatientContext(datos || {});
  const decada = Number.isInteger(ctx.edad) ? calcularDecadaDeVida(ctx.edad) : null;
  const servicio = $("voiceServicio");
  const servicioPaciente = obtenerServicioPaciente(datos);
  if (servicio) servicio.value = servicio.value || servicioPaciente || "";
  if ($("voiceEncounterId")) $("voiceEncounterId").value = state.encounterId;
  const borrador = await buscarBorradorNotaClinica(patientId, { atencionId: state.encounterId, usuarioId: state.user.uid }).catch(() => null);
  if (!state.noteId && borrador?.id) state.noteId = borrador.id;
  if ($("voiceNoteId")) $("voiceNoteId").value = state.noteId || "";
  cargarCatalogosVoz(servicio?.value || servicioPaciente);
  setText("voicePatientSummary", [
    ctx.nombreCompleto || "Paciente sin nombre",
    Number.isInteger(ctx.edad) ? `${ctx.edad} anos (${decada}a decada)` : "edad pendiente",
    ctx.sexo ? `sexo expediente: ${ctx.sexo}` : "sexo pendiente en expediente",
    `expediente: ${obtenerExpedientePaciente(datos)}`,
    servicio?.value ? `servicio: ${servicio.value}` : "servicio pendiente",
    `encuentro: ${state.encounterId}`,
    state.noteId ? `borrador destino: ${state.noteId}` : "sin borrador destino"
  ].join(" · "));
  setPreparacionHabilitada(true, "Paciente validado. Puedes preparar el micrófono.");
  actualizarLinks();
  await limpiarSesionesNotaVozVencidas();
  const recuperable = await buscarSesionRecuperableVoz();
  if (!recuperable) {
    state.persistenceReady = true;
    state.isHydratingSession = false;
    programarPersistenciaVoz("context-ready");
  }
}

async function cargarListaPacientes() {
  const selector = $("uidPaciente");
  if (!selector) return;
  selector.innerHTML = '<option value="">Seleccionar paciente</option>';
  const snap = await listarPacientes(state.user.uid);
  snap.forEach((docPaciente) => {
    const datos = docPaciente.data();
    const option = document.createElement("option");
    option.value = docPaciente.id;
    option.textContent = obtenerNombrePacienteParaMostrar(datos || {}) || datos.nombre || docPaciente.id;
    selector.appendChild(option);
  });
  if (state.patientId) selector.value = state.patientId;
}

async function obtenerProveedor() {
  if (state.provider) return state.provider;
  const functionsInstance = await obtenerFunctions();
  state.provider = createNoteGenerationProvider({
    provider: "external",
    external: {
      callable: httpsCallable(functionsInstance, "generateStructuredNoteFromDictation"),
      fallbackToLocal: false
    }
  });
  const capability = state.provider.capability();
  setText("voiceProviderStatus", `Proveedor: ${capability.isExternalAI ? "externo" : "local"} · fallback disponible`);
  setText("voicePromptVersion", `Prompt: listo · ${VOICE_NOTE_PROMPT_VERSION}`);
  setText("voiceSchemaStatus", `Esquema: listo · ${VOICE_NOTE_SCHEMA_VERSION}`);
  return state.provider;
}

async function generarNota() {
  if (state.activeGenerationRequest) return state.activeGenerationRequest;
  if (!state.patientId) {
    alert("Selecciona un paciente.");
    return;
  }
  const snapshot = snapshotDictado();
  const { encounterId } = validarAislamientoSesion(snapshot);
  if (!snapshot.correctedTranscript?.trim()) {
    alert("Revisa la transcripcion antes de generar.");
    return;
  }
  state.generationPreferences = leerPreferenciasGeneracion();
  state.encounterObservation = leerObservacionEncuentro();
  leerMentalExamDesdeControles();
  const selectedPatientQuotes = getAcceptedQuotes();
  const preflightIssues = validarObservacionesPrevias(state.encounterObservation, state.generationPreferences);
  actualizarVistaPreviaConfiguracion();
  if (preflightIssues.length) {
    alert(`Estas observaciones son incompatibles. Revise la seleccion: ${preflightIssues.join("; ")}.`);
    return;
  }
  const provider = await obtenerProveedor();
  const documentType = $("voiceDocumentType")?.value || getDefaultVoiceNoteType($("voiceServicio")?.value || "");
  const writingStyle = $("voiceWritingStyle")?.value || getDefaultVoiceStyle(documentType);
  const tipo = getVoiceNoteType(documentType);
  const estilo = getVoiceNoteStyle(writingStyle);
  const clientRequestId = crearClientRequestId("note");
  const options = {
    clientRequestId,
    patientId: state.patientId,
    encounterId,
    noteId: $("voiceNoteId")?.value || state.noteId,
    documentType,
    writingStyle,
    templateId: tipo?.templateId || "",
    promptVersion: estilo?.promptVersion || "",
    service: $("voiceServicio")?.value || "",
    conversationSegments: state.conversationSegments || [],
    segmentationMode: state.conversationSegmentationMode || "hybrid",
    segmentationWarnings: state.conversationWarnings || [],
    generationPreferences: state.generationPreferences,
    encounterObservation: state.encounterObservation,
    selectedPatientQuotes,
    mentalExamConfiguration: state.mentalExam,
    existingNoteFields: await obtenerCamposDestinoExistentes()
  };
  const button = $("btnGenerarNotaVoz");
  if (button) button.disabled = true;
  const startedAt = Date.now();
  setText("voiceProviderStatus", "Proveedor: externo · redactando");
  setText("voicePromptVersion", `Prompt: listo · ${VOICE_NOTE_PROMPT_VERSION}`);
  setText("voiceSchemaStatus", `Esquema: listo · ${VOICE_NOTE_SCHEMA_VERSION}`);
  setText("voiceGenerationProgress", `Redactando Evolucion... Solicitud ${clientRequestId}. No se modifica la nota tradicional.`);
  state.activeGenerationRequest = generarNotaVoz({
    provider,
    snapshot,
    patientContext: crearPatientContext(),
    options,
    userId: state.user.uid
  });
  let generated;
  try {
    generated = await state.activeGenerationRequest;
  } catch (error) {
    const details = error?.details || {};
    const code = error?.code || details.code || "sin_codigo";
    const validationCodes = Array.isArray(details.validationCodes) ? details.validationCodes : [];
    const validationText = validationCodes.length ? ` Codigos: ${validationCodes.join(", ")}.` : "";
    const attemptText = details.attempt ? ` Intento ${details.attempt}/2.` : "";
    setText("voiceProviderStatus", `Proveedor: externo · error: ${code}`);
    setText("voiceSchemaStatus", `Esquema: no validado · ${VOICE_NOTE_SCHEMA_VERSION}`);
    setText("voiceGenerationProgress", `No fue posible validar la Evolucion. Segmentacion conservada. RequestId: ${details.requestId || clientRequestId}. Etapa: ${details.stage || "no_especificada"}.${attemptText}${validationText} Validador: ${details.validatorVersion || VOICE_NOTE_VALIDATOR_VERSION}. Puedes reintentar generacion.`);
    return;
  } finally {
    state.activeGenerationRequest = null;
    if (button) button.disabled = false;
  }
  state.generated = generated;
  state.generated.generationPreferences = state.generationPreferences;
  state.generated.encounterObservation = state.encounterObservation;
  const mentalExam = generarExamenMentalLocal();
  if (mentalExam.text) {
    state.mentalExam.generatedText = mentalExam.text;
    state.mentalExam.generatedOriginalText = mentalExam.text;
    state.mentalExam.history = [...(state.mentalExam.history || []), { at: new Date().toISOString(), text: mentalExam.text, source: "local" }].slice(-10);
    state.generated.sections = { ...(state.generated.sections || {}), mentalExam };
    state.generated.generatedClinicalText = {
      ...(state.generated.generatedClinicalText || {}),
      objective: {
        ...(state.generated.generatedClinicalText?.objective || {}),
        mentalStatusExam: mentalExam.text
      }
    };
  }
  state.transferSections = crearTransferSections(generated, snapshot.correctedTranscript, crearPatientContext());
  const externalFailure = generated.metadata?.externalProviderFailure;
  setText("voiceProviderStatus", `Proveedor: ${generated.provider || "desconocido"} · estado: ${generated.providerStatus || generated.metadata?.generatedStatus || "en revision"}${externalFailure ? ` · causa fallback: ${externalFailure.code || externalFailure.name || "sin codigo"}` : ""}`);
  setText("voicePromptVersion", `Prompt: ${generated.promptVersion || generated.metadata?.promptVersion || "fallback local"}`);
  setText("voiceSchemaStatus", `Esquema validado: ${state.transferSections.length ? generated.schemaVersion || VOICE_NOTE_SCHEMA_VERSION : "pendiente"} · ${generated.validatorVersion || VOICE_NOTE_VALIDATOR_VERSION}`);
  await guardarSesionVozFirestore({
    userId: state.user.uid,
    patientId: state.patientId,
    encounterId: options.encounterId,
    sessionId: snapshot.transcriptSessionId || "manual",
    status: "generated",
    data: {
      provider: generated.provider || "",
      promptVersion: generated.promptVersion || "",
      documentType: options.documentType,
      writingStyle: options.writingStyle,
      templateId: options.templateId,
      catalogVersion: VOICE_NOTE_CATALOG_VERSION,
      styleCatalogVersion: VOICE_NOTE_STYLE_CATALOG_VERSION
    }
  });
  await guardarTranscripcionVozFirestore({ userId: state.user.uid, sessionId: snapshot.transcriptSessionId || "manual", transcript: snapshot });
  await guardarDraftGeneradoVozFirestore({ userId: state.user.uid, patientId: state.patientId, sessionId: snapshot.transcriptSessionId || "manual", generated });
  setText("voiceGenerationProgress", generated.metadata?.processingDisclosure || `Evolucion generada en ${Math.round((Date.now() - startedAt) / 1000)} s. Revise el apartado antes de transferir.`);
  await flushPersistenciaVoz("generation-complete");
  renderRevision();
  mostrarPaso("revisar");
}

async function obtenerCamposDestinoExistentes() {
  const noteId = $("voiceNoteId")?.value || state.noteId;
  const nota = await leerNotaExistente(state.patientId, noteId).catch(() => null);
  const observacion = nota?.observacionFray || {};
  return {
    evolutionOrSubjective: { ...VOICE_NOTE_FIELD_REGISTRY.evolutionOrSubjective, value: nota?.subjetivo || "" },
    physicalNeurologicalExam: { ...VOICE_NOTE_FIELD_REGISTRY.physicalNeurologicalExam, value: observacion.exploracionFisicaNeurologica || "" },
    mentalStatusExam: { ...VOICE_NOTE_FIELD_REGISTRY.mentalStatusExam, value: nota?.objetivo || "" },
    results: { ...VOICE_NOTE_FIELD_REGISTRY.results, value: observacion.resultadosEstudios || "" },
    analysis: { ...VOICE_NOTE_FIELD_REGISTRY.analysis, value: nota?.analisis || "" },
    plan: { ...VOICE_NOTE_FIELD_REGISTRY.plan, value: nota?.plan || "" }
  };
}

function renderRevision() {
  renderWarnings();
  const contenedor = $("voiceReviewCards");
  if (!contenedor) return;
  const sections = state.transferSections || [];
  contenedor.innerHTML = sections.length ? sections.map((section, index) => `
    <article class="voice-review-card">
      <header>
        <div>
          <small>Destino: ${escaparHTML(section.field?.label || "")}</small>
          <h3>${escaparHTML(section.title)}</h3>
        </div>
        <label><input type="checkbox" data-section-include="${index}" ${section.include ? "checked" : ""} ${section.blocked ? "disabled" : ""}> Incluir</label>
      </header>
      ${section.blocked ? `<p class="voice-summary">No se puede transferir hasta corregir las advertencias criticas de este apartado.</p>` : ""}
      <label>Modo de transferencia
        <select data-section-mode="${index}">
          <option value="insert_if_empty" ${section.mode === "insert_if_empty" ? "selected" : ""}>Insertar si esta vacio</option>
          <option value="combine" ${section.mode === "combine" ? "selected" : ""}>Combinar</option>
          <option value="replace" ${section.mode === "replace" ? "selected" : ""}>Reemplazar con confirmacion</option>
          <option value="exclude" ${section.mode === "exclude" ? "selected" : ""}>Excluir</option>
        </select>
      </label>
      <textarea data-section-content="${index}">${escaparHTML(section.content)}</textarea>
      <details>
        <summary>Ver fuentes y advertencias</summary>
        <p>Fragmentos: ${section.sourceSegmentIds?.length || "sin marcas especificas"}</p>
        <ul>${(section.warnings || []).map((issue) => `<li>${escaparHTML(issue.message || issue.summary || "")}</li>`).join("")}</ul>
      </details>
    </article>
  `).join("") : "<p>No hay apartados clinicos transferibles.</p>";

  contenedor.querySelectorAll("[data-section-include]").forEach((input) => {
    input.addEventListener("change", () => {
      state.transferSections[Number(input.dataset.sectionInclude)].include = input.checked;
      programarPersistenciaVoz("review-include-change");
    });
  });
  contenedor.querySelectorAll("[data-section-mode]").forEach((select) => {
    select.addEventListener("change", () => {
      const section = state.transferSections[Number(select.dataset.sectionMode)];
      section.mode = select.value;
      if (select.value === "exclude") section.include = false;
      programarPersistenciaVoz("review-mode-change");
      renderRevision();
    });
  });
  contenedor.querySelectorAll("[data-section-content]").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      state.transferSections[Number(textarea.dataset.sectionContent)].content = textarea.value;
      programarPersistenciaVoz("generated-note-edit");
    });
  });
}

function renderWarnings() {
  const contenedor = $("voiceWarningsList");
  if (!contenedor) return;
  const warnings = state.generated?.validationIssues || [];
  contenedor.innerHTML = warnings.length ? warnings.map((warning) => `
    <article class="voice-warning-item">
      <strong>${escaparHTML(warning.category || warning.displayTitle || warning.concept || "Dato incierto")}</strong>
      <p>${escaparHTML(warning.summary || warning.message || "Requiere revision profesional.")}</p>
    </article>
  `).join("") : "<p>Sin advertencias agrupadas; la revision profesional sigue siendo obligatoria.</p>";
}

async function transferir() {
  if (!state.generated) {
    alert("Primero genera y revisa la nota.");
    return;
  }
  const snapshot = snapshotDictado();
  const { encounterId } = validarAislamientoSesion(snapshot);
  const selectedTarget = document.querySelector("input[name='voiceTransferTarget']:checked")?.value || "new";
  if (selectedTarget === "later") {
    setText("voiceTransferSummary", "Sesion conservada. Puedes volver despues desde este paciente.");
    return;
  }
  const sections = state.transferSections.filter((section) => section.include && !section.blocked && section.mode !== "exclude");
  if (!sections.length) {
    alert("Selecciona al menos un apartado revisado para transferir.");
    return;
  }
  const replaceSections = sections.filter((section) => section.mode === "replace");
  if (replaceSections.length && !confirm(`Se reemplazara contenido en: ${replaceSections.map((s) => s.field?.label).join(", ")}. Confirma para continuar.`)) return;
  const noteId = selectedTarget === "existing" ? ($("voiceNoteId")?.value || state.noteId) : "";
  const confirmado = await transferirNotaVozABorrador({
    patientId: state.patientId,
    noteId,
    patient: state.patient,
    user: {
      uid: state.user.uid,
      email: state.user.email,
      nombre: state.perfil?.nombre || state.perfil?.nombreCompleto || state.user.displayName || state.user.email
    },
    sections,
    documentType: $("voiceDocumentType")?.value || getDefaultVoiceNoteType($("voiceServicio")?.value || ""),
    draftMetadata: {
      sessionId: snapshot.transcriptSessionId || "",
      encounterId,
      provider: state.generated.provider || "",
      promptVersion: state.generated.promptVersion || "",
      documentType: $("voiceDocumentType")?.value || "",
      writingStyle: $("voiceWritingStyle")?.value || "",
      source: "nota_por_voz_y_automatica"
    }
  });
  state.transferredNoteId = confirmado.id;
  state.noteId = confirmado.id;
  $("voiceNoteId").value = confirmado.id;
  await guardarDraftGeneradoVozFirestore({
    userId: state.user.uid,
    patientId: state.patientId,
    sessionId: snapshotDictado().transcriptSessionId || "manual",
    generated: state.generated,
    transferredNoteId: confirmado.id
  });
  setText("voiceTransferSummary", `Borrador ${confirmado.id} transferido y verificado. No se firmo ni se guardo como definitivo.`);
  await eliminarSesionNotaVozLocal(construirBorradorSesionVoz());
}

function abrirNotaTradicional() {
  const qs = new URLSearchParams();
  if (state.patientId) qs.set("id", state.patientId);
  if (state.encounterId) qs.set("encounterId", state.encounterId);
  if (state.transferredNoteId || $("voiceNoteId")?.value) qs.set("notaId", state.transferredNoteId || $("voiceNoteId").value);
  location.href = `nota.html?${qs.toString()}`;
}

function conectarEventos() {
  document.querySelectorAll("[data-step-target]").forEach((button) => {
    button.addEventListener("click", () => mostrarPaso(button.dataset.stepTarget));
  });
  document.querySelectorAll("[data-step-next]").forEach((button) => {
    button.addEventListener("click", () => mostrarPaso(button.dataset.stepNext));
  });
  $("uidPaciente")?.addEventListener("change", async (event) => {
    const nuevoPaciente = event.target.value;
    if (nuevoPaciente !== state.patientId && hayDatosVoz()) {
      const continuar = confirm("Cambiar de paciente cerrará el contexto actual del dictado. Limpia o guarda la transcripción antes de continuar. ¿Deseas cambiar de todos modos?");
      if (!continuar) {
        event.target.value = state.patientId || "";
        return;
      }
      await flushPersistenciaVoz("patient-change");
      state.generated = null;
      state.transferSections = [];
      state.conversationSegments = [];
      state.conversationWarnings = [];
      state.segmentationMetadata = null;
    }
    state.patientId = nuevoPaciente;
    state.encounterId = "";
    state.noteId = "";
    await cargarPaciente(state.patientId);
  });
  $("voiceDocumentType")?.addEventListener("change", () => {
    const typeId = $("voiceDocumentType")?.value || "";
    const estilos = getCompatibleVoiceStyles(typeId);
    const actual = $("voiceWritingStyle")?.value || "";
    const selected = estilos.some((style) => style.id === actual) ? actual : getDefaultVoiceStyle(typeId);
    opcionesSelect($("voiceWritingStyle"), estilos, selected);
    state.documentType = typeId;
    state.writingStyle = $("voiceWritingStyle")?.value || selected;
    actualizarResumenPlantilla();
    programarPersistenciaVoz("document-type-change");
  });
  $("voiceWritingStyle")?.addEventListener("change", () => {
    state.writingStyle = $("voiceWritingStyle")?.value || "";
    actualizarResumenPlantilla();
    programarPersistenciaVoz("style-change");
  });
  $("voiceServicio")?.addEventListener("change", () => {
    cargarCatalogosVoz($("voiceServicio")?.value || "");
    programarPersistenciaVoz("service-change");
  });
  $("voiceEncounterId")?.addEventListener("input", () => {
    state.encounterId = $("voiceEncounterId")?.value?.trim() || "";
    actualizarLinks();
    programarPersistenciaVoz("encounter-change");
  });
  $("voiceNoteId")?.addEventListener("input", () => {
    state.noteId = $("voiceNoteId")?.value?.trim() || "";
    actualizarLinks();
    programarPersistenciaVoz("note-change");
  });
  document.querySelectorAll(
    "#voiceQuoteMode, #voiceMaxPatientQuotes, #voiceQuotePriority, #voiceFreeObservation, #voiceFreeObservationConfirmed"
  ).forEach((node) => {
    const eventName = (node.tagName === "TEXTAREA" || (node.tagName === "INPUT" && node.type === "text")) ? "input" : "change";
    node.addEventListener(eventName, () => {
      actualizarVistaPreviaConfiguracion();
      invalidarNotaGeneradaPorConfiguracion();
      programarPersistenciaVoz("preflight-change");
    });
  });
  document.querySelectorAll("[id^='voiceObs_'], [id^='voiceObsDest_'], [id^='voiceObsOther_']").forEach((node) => {
    const eventName = node.tagName === "INPUT" ? "input" : "change";
    node.addEventListener(eventName, () => {
      actualizarVistaPreviaConfiguracion();
      invalidarNotaGeneradaPorConfiguracion();
      programarPersistenciaVoz("preflight-observation-change");
    });
  });
  document.querySelectorAll("[data-clear-observation]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.clearObservation;
      if ($(`voiceObs_${key}`)) $(`voiceObs_${key}`).value = "";
      if ($(`voiceObsOther_${key}`)) $(`voiceObsOther_${key}`).value = "";
      actualizarVistaPreviaConfiguracion();
      invalidarNotaGeneradaPorConfiguracion();
      programarPersistenciaVoz("preflight-observation-clear");
    });
  });
  $("btnDetectVoiceQuotes")?.addEventListener("click", () => detectarCitasCandidatas());
  $("btnAddManualVoiceQuote")?.addEventListener("click", () => {
    const text = prompt("Texto literal expresado por el paciente:");
    if (!text?.trim()) return;
    const confirmed = confirm("Confirme que corresponde literalmente a lo expresado por el paciente.");
    if (!confirmed) return;
    state.manualQuotes.push({
      id: `manual-quote-${Date.now().toString(36)}`,
      text: sanitizarObservacionLibre(text).slice(0, 220),
      originalText: sanitizarObservacionLibre(text).slice(0, 220),
      category: "clinical_relevance",
      sourceRole: "patient",
      sourceType: "manual_literal_quote",
      sourceUtteranceIds: [],
      confidence: 1,
      destinationSections: ["evolution", "mentalStatusExam"],
      include: true,
      manuallyConfirmed: true
    });
    renderQuoteCandidates();
    invalidarNotaGeneradaPorConfiguracion();
    programarPersistenciaVoz("manual-quote-added");
  });
  $("voiceQuoteCandidates")?.addEventListener("change", (event) => {
    const target = event.target;
    const quoteId = target.dataset.quoteInclude || target.dataset.quoteConfirm;
    if (!quoteId) return;
    const quote = [...state.quoteCandidates, ...state.manualQuotes].find((item) => item.id === quoteId);
    if (!quote) return;
    if (target.dataset.quoteInclude) quote.include = target.checked;
    if (target.dataset.quoteConfirm) quote.manuallyConfirmed = target.checked;
    getAcceptedQuotes();
    invalidarNotaGeneradaPorConfiguracion();
    programarPersistenciaVoz("quote-change");
  });
  $("voiceQuoteCandidates")?.addEventListener("input", (event) => {
    const quoteId = event.target.dataset.quoteEdit;
    if (!quoteId) return;
    const quote = [...state.quoteCandidates, ...state.manualQuotes].find((item) => item.id === quoteId);
    if (!quote) return;
    quote.text = sanitizarObservacionLibre(event.target.value).slice(0, 220);
    quote.manuallyEdited = quote.text !== quote.originalText;
    quote.manuallyConfirmed = false;
    getAcceptedQuotes();
    invalidarNotaGeneradaPorConfiguracion();
    programarPersistenciaVoz("quote-edit");
  });
  document.querySelectorAll("[data-mental-state], [data-mental-value], [data-mental-other], [data-mental-confirmed], #voiceMentalExamTemplate, #voiceMentalTemplateConfirmed").forEach((node) => {
    const eventName = node.tagName === "INPUT" && node.type === "text" ? "input" : "change";
    node.addEventListener(eventName, () => {
      leerMentalExamDesdeControles();
      aplicarMentalExamStateAControles();
      invalidarNotaGeneradaPorConfiguracion();
      programarPersistenciaVoz("mental-exam-change");
    });
  });
  $("btnOmitAllMentalComponents")?.addEventListener("click", () => {
    state.mentalExam.components = crearMentalExamComponentDefaults();
    aplicarMentalExamStateAControles();
    invalidarNotaGeneradaPorConfiguracion();
    programarPersistenciaVoz("mental-omit-all");
  });
  $("btnRestoreHiddenMentalComponents")?.addEventListener("click", () => {
    for (const [key] of MENTAL_EXAM_COMPONENTS) {
      if (getMentalComponent(key).state === "hidden") setMentalComponent(key, { state: "omit" });
    }
    aplicarMentalExamStateAControles();
    programarPersistenciaVoz("mental-restore-hidden");
  });
  $("btnUseSafeMentalConfig")?.addEventListener("click", () => {
    if (hayDatosVoz() && !confirm("Se restablecera solo la configuracion del Examen mental. La transcripcion, segmentacion y Evolucion se conservan.")) return;
    state.mentalExam = { ...state.mentalExam, activeConfigId: "safe_default", templateId: "safe_default", templateConfirmed: false, components: crearMentalExamComponentDefaults(), hiddenDrafts: {} };
    aplicarMentalExamStateAControles();
    invalidarNotaGeneradaPorConfiguracion();
    programarPersistenciaVoz("mental-safe-default");
  });
  $("btnApplyMentalTemplate")?.addEventListener("click", () => {
    const templateId = $("voiceMentalExamTemplate")?.value || "safe_default";
    if (templateId !== "safe_default" && !$("voiceMentalTemplateConfirmed")?.checked) {
      alert("Confirme que revisara y validara individualmente los hallazgos antes de aplicar la plantilla.");
      return;
    }
    aplicarPlantillaMentalExam(templateId);
    invalidarNotaGeneradaPorConfiguracion();
    programarPersistenciaVoz("mental-template-applied");
  });
  $("btnSaveMentalConfig")?.addEventListener("click", () => {
    const name = prompt("Nombre de la configuracion:");
    if (!name?.trim()) return;
    leerMentalExamDesdeControles();
    const config = {
      id: `mental-config-${Date.now().toString(36)}`,
      userId: state.user?.uid || "",
      name: sanitizarObservacionLibre(name).slice(0, 80),
      version: 1,
      context: "cualquier_contexto",
      type: "estructura_y_visibilidad",
      isDefault: false,
      componentStates: Object.fromEntries(Object.entries(state.mentalExam.components || {}).map(([key, value]) => [key, { state: value.state || "omit" }])),
      containsClinicalDefaults: Object.values(state.mentalExam.components || {}).some((component) => component.value),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.mentalExam.savedConfigs = [...(state.mentalExam.savedConfigs || []), config];
    const select = $("voiceMentalExamSavedConfig");
    if (select) {
      const option = document.createElement("option");
      option.value = config.id;
      option.textContent = config.name;
      select.appendChild(option);
      select.value = config.id;
    }
    programarPersistenciaVoz("mental-config-saved");
  });
  $("btnResetVoiceObservation")?.addEventListener("click", () => {
    state.generationPreferences = {
      quoteMode: "omit",
      includePatientQuotes: false,
      maxPatientQuotes: 1,
      quotePriority: "automatic"
    };
    state.encounterObservation = defaultEncounterObservation();
    aplicarPreflightStateAControles();
    actualizarVistaPreviaConfiguracion();
    invalidarNotaGeneradaPorConfiguracion();
    programarPersistenciaVoz("preflight-reset");
  });
  $("textoDictadoClinico")?.addEventListener("input", () => {
    programarPersistenciaVoz("dictation-input");
  });
  $("voiceCorrectedTranscript")?.addEventListener("input", (event) => {
    renderSegmentosConversacionales(event.target.value);
    programarPersistenciaVoz("transcript-edit");
  });
  $("btnSegmentarConversacionVoz")?.addEventListener("click", () => segmentarConProveedor().catch((error) => {
    console.error("No se pudo segmentar la conversacion:", error);
    setText("voiceSegmentationStatus", "No se pudo segmentar con proveedor. Revise la transcripcion.");
  }));
  $("btnPrepararMicrofono")?.addEventListener("click", () => window.probarMicrofono?.());
  $("btnGenerarNotaVoz")?.addEventListener("click", () => generarNota().catch((error) => {
    console.error("No se pudo generar nota por voz:", error);
    setText("voiceGenerationProgress", error.message || "No se pudo generar la nota.");
  }));
  $("btnTransferirNotaVoz")?.addEventListener("click", () => transferir().catch((error) => {
    console.error("No se pudo transferir la nota:", error);
    alert(error.message || "No se pudo transferir la nota.");
  }));
  $("btnAbrirNotaTradicional")?.addEventListener("click", abrirNotaTradicional);
  $("btnRecuperarSesionVoz")?.addEventListener("click", () => recuperarSesionVoz().catch((error) => {
    console.error("No se pudo recuperar la sesion de voz:", error);
    alert(error.message || "No se pudo recuperar la sesion.");
  }));
  $("btnDescartarSesionVoz")?.addEventListener("click", () => descartarSesionVoz().catch((error) => {
    console.error("No se pudo descartar la sesion de voz:", error);
  }));
  $("btnNuevaSesionVoz")?.addEventListener("click", () => iniciarNuevaSesionVoz().catch((error) => {
    console.error("No se pudo iniciar nueva sesion de voz:", error);
  }));
  $("btnVolverVoz")?.addEventListener("click", async () => {
    await flushPersistenciaVoz("internal-navigation");
    if (state.returnUrl) location.href = state.returnUrl;
    else if (state.patientId) location.href = `paciente.html?id=${encodeURIComponent(state.patientId)}`;
    else location.href = "medico.html";
  });
  window.addEventListener("pagehide", () => {
    flushPersistenciaVoz("pagehide");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPersistenciaVoz("visibility-hidden");
  });
}

async function init() {
  iniciarMonitoreoSesion("Nota por voz y automatica");
  setPreparacionHabilitada(false, "Cargando contexto del paciente...");
  cargarCatalogosVoz("");
  renderPreflightControls();
  if ($("voiceEncounterId")) $("voiceEncounterId").value = state.encounterId;
  if ($("voiceNoteId")) $("voiceNoteId").value = state.noteId;
  conectarEventos();
  actualizarLinks();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      location.href = "login.html";
      return;
    }
    state.user = user;
    const perfil = await obtenerUsuario(user.uid);
    if (!perfil || (perfil.rol !== "admin" && !usuarioEsPersonalClinico(perfil.rol))) {
      alert("Acceso restringido al personal clinico.");
      location.href = "dashboard.html";
      return;
    }
    state.perfil = perfil;
    if (state.patientId) {
      await cargarPaciente(state.patientId);
    } else {
      await cargarListaPacientes();
      setPreparacionHabilitada(false, "Selecciona un paciente para iniciar.");
    }
    window.setTimeout(() => obtenerProveedor().catch(() => {
      setText("voiceProviderStatus", "Proveedor: local o pendiente");
    }), 0);
  });
}

init();

window.cognicionNotaPorVoz = {
  get state() { return state; },
  renderSegmentosConversacionales,
  generarNota,
  transferir
};
