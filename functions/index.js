const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const OpenAI = require("openai");
const admin = require("firebase-admin");
const { runSegmentClinicalConversation } = require("./segmentationHandler");
const { runGenerateStructuredNoteFromDictation } = require("./noteGenerationHandler");
const { discoverTextPatterns } = require("./patternDiscoveryHandler");
const calendar = require("./calendar/googleCalendar");

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
if (!admin.apps.length) admin.initializeApp();
const adminDb = admin.firestore();

const ADMIN_UID = "NQ0CU5PSDBUgVrk56sjPEVhOs2D3";
const TIPOS_COLABORADOR_VALIDOS = new Set(["colaborador", "destacado", "estrella"]);
const ROLES_ADMIN_VALIDOS = new Set(["admin", "administrador", "superadmin", "adminprincipal", "administradorprincipal"]);

function normalizarRolAdmin(valor = "") {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s_-]+/g, "").trim();
}

function datosUsuarioEsAdmin(datos = {}) {
  const roles = Array.isArray(datos.roles) ? datos.roles : Object.entries(datos.roles || {}).filter(([, activo]) => activo).map(([rol]) => rol);
  const permisos = Array.isArray(datos.permisos) ? datos.permisos : Object.entries(datos.permisos || {}).filter(([, activo]) => activo).map(([permiso]) => permiso);
  return [datos.rol, datos.role, datos.tipoRol, datos.tipoUsuario, datos.perfil, datos.cargoSistema, ...roles, ...permisos]
    .some((valor) => ROLES_ADMIN_VALIDOS.has(normalizarRolAdmin(valor)))
    || datos.admin === true || datos.esAdmin === true || datos.isAdmin === true || datos.claims?.admin === true;
}

function contieneUidPaciente(valor, uidPaciente, clave = "") {
  if (valor === uidPaciente && /(paciente|patient|usuario).*(uid|id)|(uid|id).*(paciente|patient|usuario)/i.test(clave)) return true;
  if (Array.isArray(valor)) return valor.some((item) => contieneUidPaciente(item, uidPaciente, clave));
  if (valor && typeof valor === "object") return Object.entries(valor).some(([subClave, subValor]) => contieneUidPaciente(subValor, uidPaciente, subClave));
  return false;
}

function documentoPerteneceAPaciente(ruta, datos, uidPaciente) {
  const segmentos = ruta.split("/");
  if ((segmentos[0] === "usuarios" || segmentos[0] === "pacientes") && segmentos[1] === uidPaciente) return true;
  if (segmentos[0] === "auditoria") return false;
  return Object.entries(datos || {}).some(([clave, valor]) => contieneUidPaciente(valor, uidPaciente, clave));
}

async function eliminarDocumentoYDescendientes(ref) {
  await adminDb.recursiveDelete(ref);
}

async function eliminarDocumentosRelacionadosEnColecciones(uidPaciente, resumen) {
  const coleccionesRaiz = await adminDb.listCollections();
  async function visitarColeccion(coleccion) {
    for (const ref of await coleccion.listDocuments()) {
      const snap = await ref.get();
      if (!snap.exists) continue;
      if (documentoPerteneceAPaciente(ref.path, snap.data(), uidPaciente)) {
        await eliminarDocumentoYDescendientes(ref);
        resumen.documentosRelacionados = (resumen.documentosRelacionados || 0) + 1;
        continue;
      }
      for (const subcoleccion of await ref.listCollections()) await visitarColeccion(subcoleccion);
    }
  }
  for (const coleccion of coleccionesRaiz) if (coleccion.id !== "auditoria") await visitarColeccion(coleccion);
}

async function eliminarArchivosPaciente(uidPaciente, resumen) {
  const [archivos] = await admin.storage().bucket().getFiles();
  const uidEscapado = uidPaciente.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patron = new RegExp(`(?:^|/|-)${uidEscapado}(?:/|$|[._-])`);
  const relacionados = archivos.filter((archivo) => patron.test(archivo.name));
  if (relacionados.length) await Promise.all(relacionados.map((archivo) => archivo.delete()));
  resumen.archivosStorage = relacionados.length;
}

exports.eliminarPacienteDefinitivamente = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const adminUid = request.auth.uid;
  const uidPaciente = String(request.data?.pacienteUid || "").trim();
  const solicitudId = String(request.data?.solicitudId || "").trim();
  const motivo = String(request.data?.motivo || "").trim();
  if (!uidPaciente || !solicitudId) throw new HttpsError("invalid-argument", "La eliminación debe originarse en una solicitud válida.");

  const adminSnap = await adminDb.doc(`usuarios/${adminUid}`).get();
  if (adminUid !== ADMIN_UID && (!adminSnap.exists || !datosUsuarioEsAdmin(adminSnap.data()))) {
    throw new HttpsError("permission-denied", "No tienes permisos administrativos para eliminar pacientes.");
  }
  const solicitudSnap = await adminDb.doc(`reportesUsuarios/${solicitudId}`).get();
  const solicitud = solicitudSnap.exists ? solicitudSnap.data() : null;
  if (!solicitud || (solicitud.tipo !== "solicitud_eliminacion" && solicitud.categoria !== "solicitud_eliminacion") || solicitud.recursoTipo !== "paciente" || solicitud.pacienteUid !== uidPaciente) {
    throw new HttpsError("failed-precondition", "La solicitud de eliminación no es válida para este paciente.");
  }
  const pacienteSnap = await adminDb.doc(`usuarios/${uidPaciente}`).get();
  const paciente = pacienteSnap.exists ? pacienteSnap.data() : {};
  const nombrePaciente = paciente.nombre || paciente.nombreCompleto || request.data?.pacienteNombre || "Paciente sin nombre";
  const resumen = { uidPaciente, nombrePaciente };
  await eliminarDocumentoYDescendientes(adminDb.doc(`usuarios/${uidPaciente}`));
  await eliminarDocumentoYDescendientes(adminDb.doc(`pacientes/${uidPaciente}`));
  await eliminarDocumentosRelacionadosEnColecciones(uidPaciente, resumen);
  await eliminarArchivosPaciente(uidPaciente, resumen);
  if (solicitudId) await adminDb.doc(`reportesUsuarios/${solicitudId}`).delete().catch(() => {});
  await adminDb.collection("auditoria").add({
    accion: "Paciente eliminado definitivamente",
    modulo: "Panel administracion",
    descripcion: "El administrador eliminó definitivamente un paciente y toda su información asociada.",
    usuarioUid: adminUid,
    usuarioNombre: request.auth.token?.email || adminUid,
    usuarioRol: "admin",
    pacienteUid: uidPaciente,
    pacienteNombre: nombrePaciente,
    exito: true,
    detalles: { motivo, solicitudId, ...resumen },
    fecha: admin.firestore.FieldValue.serverTimestamp(),
    fechaTexto: new Date().toISOString()
  });
  return { ok: true, ...resumen };
});

exports.actualizarReconocimientoColaborador = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const adminUid = request.auth.uid;
  const usuarioId = String(request.data?.usuarioId || "").trim();
  const tipo = request.data?.tipo ? String(request.data.tipo).trim() : null;
  if (!usuarioId) throw new HttpsError("invalid-argument", "Falta el usuario objetivo.");
  if (usuarioId === adminUid) throw new HttpsError("permission-denied", "No puedes asignarte este reconocimiento.");
  if (tipo !== null && !TIPOS_COLABORADOR_VALIDOS.has(tipo)) throw new HttpsError("invalid-argument", "Tipo de colaborador no permitido.");

  const adminSnap = await adminDb.doc(`usuarios/${adminUid}`).get();
  if (adminUid !== ADMIN_UID && (!adminSnap.exists || !datosUsuarioEsAdmin(adminSnap.data()))) {
    throw new HttpsError("permission-denied", "No tienes permisos administrativos para esta operación.");
  }

  const usuarioRef = adminDb.doc(`usuarios/${usuarioId}`);
  const usuarioSnap = await usuarioRef.get();
  if (!usuarioSnap.exists) throw new HttpsError("not-found", "Usuario objetivo no encontrado.");
  const anterior = usuarioSnap.data()?.colaborador || {};
  const valorAnterior = { activo: anterior.activo === true, tipo: anterior.activo === true ? anterior.tipo || null : null };
  const activo = Boolean(tipo);
  const valorNuevo = { activo, tipo: activo ? tipo : null };
  const marcaTiempo = activo ? admin.firestore.FieldValue.serverTimestamp() : null;
  const nuevoColaborador = {
    activo,
    tipo: valorNuevo.tipo,
    fechaAsignacion: marcaTiempo,
    asignadoPor: activo ? adminUid : null
  };
  const auditoriaRef = adminDb.collection("auditoria").doc();
  const batch = adminDb.batch();
  batch.update(usuarioRef, { colaborador: nuevoColaborador });
  batch.set(auditoriaRef, {
    accion: "actualizar_tipo_colaborador",
    modulo: "Panel administracion",
    usuarioObjetivoId: usuarioId,
    valorAnterior,
    valorNuevo,
    realizadoPor: adminUid,
    exito: true,
    fecha: admin.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();
  return { ok: true, valorAnterior, valorNuevo };
});

exports.discoverTextPatterns = onCall({ timeoutSeconds: 300, memory: "1GiB" }, async (request) => {
  return discoverTextPatterns({ request, db: adminDb });
});

exports.chatSofia = onCall(
  {
    secrets: [OPENAI_API_KEY],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const mensaje = request.data?.mensaje;

    if (!mensaje || typeof mensaje !== "string") {
      throw new HttpsError("invalid-argument", "Mensaje inválido.");
    }

    const client = new OpenAI({
      apiKey: OPENAI_API_KEY.value(),
    });

    const response = await client.responses.create({
  model: "gpt-5.5",
  instructions: `
Eres SOFÍA (Sistema de Orientación, Formación e Inteligencia Asistida), el motor de inteligencia artificial de Cognición.

Actualmente te encuentras en fase Alpha de investigación y desarrollo.

Tu propósito es asistir a profesionales de la salud, investigadores y, progresivamente, pacientes.

No eres un chatbot genérico.

Formas parte de la plataforma Cognición y debes responder de acuerdo con sus principios científicos, clínicos y éticos.

Principios:

- Prioriza información basada en evidencia científica.
- Nunca inventes datos clínicos.
- Nunca inventes referencias científicas.
- Si no sabes una respuesta, dilo claramente.
- Diferencia siempre entre hechos, hipótesis y opiniones.
- No sustituyes el juicio clínico.
- Explica conceptos complejos con claridad.
- Mantén un lenguaje profesional, respetuoso y humano.
- Sé concisa cuando la pregunta sea simple y detallada cuando el usuario lo solicite.
- Si la información es insuficiente, indica qué datos faltan antes de sacar conclusiones.

Actualmente todavía no tienes acceso a expedientes clínicos, memoria conversacional permanente, escalas ni herramientas clínicas. No afirmes disponer de información que aún no ha sido proporcionada.

Tu objetivo es potenciar el razonamiento del profesional de la salud, no reemplazarlo.
`,
  input: mensaje,
});

    return {
      respuesta: response.output_text || "No pude generar respuesta.",
    };
  }
);

const STRUCTURED_NOTE_PROMPT_VERSION = "voice_note_fray_aldo_evolucion_v2_2026-07-18";
const STRUCTURED_NOTE_PROMPT = `
Version del prompt: voice_note_fray_aldo_evolucion_v2_2026-07-18.
Eres un asistente especializado en documentacion psiquiatrica institucional.

Recibiras la transcripcion de una conversacion entre profesional, paciente y posiblemente familiares, sin etiquetas fiables. Distingue preguntas, respuestas, observaciones, recapitulaciones y plan. Las preguntas del profesional no constituyen hallazgos clinicos ni deben atribuirse al paciente.

Genera una propuesta para una nota psiquiatrica de alta calidad en estilo Formato Fray - Aldo:
1. Evolucion o padecimiento actual.
2. Exploracion fisica/neurologica, examen mental y resultados.
3. Comentario y analisis.
4. Plan.

ESTILO OBLIGATORIO PARA EVOLUCION NARRATIVA INSTITUCIONAL:
La Evolucion no debe redactarse como resumen exhaustivo por dominios, interrogatorio reconstruido ni acumulacion de respuestas. Debe imitar el estilo narrativo institucional de Observacion/UCEP.

Para evolucion intrahospitalaria, redacta entre tres y cinco parrafos fluidos:
1. Inicio con nombre, sexo, edad, dia de estancia, servicio y criterio clinico solo si estan disponibles en expediente o transcripcion. Si no hay criterio documentado, usa "bajo seguimiento por [problema clinico documentado]". Si no hay turno, usa "Durante la valoracion..." o "Durante el periodo evaluado...".
2. Describe brevemente donde y como fue abordado el paciente, posicion si fue dictada, aceptacion de entrevista, cooperacion, actitud y conducta general durante el turno. Esto debe ocupar solo una o dos oraciones.
3. Integra solo cambios y sintomas clinicamente relevantes: evolucion intrahospitalaria, sintomas principales, riesgo, respuesta al tratamiento, funcionamiento, red de apoyo, conciencia de enfermedad y proyeccion a futuro cuando existan.
4. Diferencia antecedentes de situacion actual. Conserva negaciones, incertidumbre, temporalidad y procedencia. Incluye solo citas breves de valor clinico con "sic. Pac." o "sic. Fam.".
5. Cierra con sueño, alimentacion, diuresis, evacuaciones, sintomas fisicos, efectos adversos y eventualidades medicas, si fueron documentados. Puede cerrar con "Sin otras eventualidades medicas reportadas durante el turno" solo si corresponde.

No incluyas en Evolucion: preguntas copiadas, dialogos, "sabe aproximadamente que fecha es", "quiero preguntarle", "voy a resumir", instrucciones del profesional, ordenes del plan, analisis diagnostico extenso, examen mental completo, atencion/memoria/lenguaje/curso formal/afecto completo/juicio/introspeccion/funciones cognitivas/inteligencia, etiquetas tecnicas, advertencias automaticas, fragmentos truncados, parentesis rotos ni frases inconclusas.

Para ingreso adapta a padecimiento actual cronologico, pero para documentType de evolucion usa siempre la evolucion narrativa institucional selectiva.

El examen mental debe ser narrativo y seguir este orden cuando los datos existan: sexo y edad aparente, talla, complexion, integridad y conformacion, vestimenta, higiene y alino, lugar, posicion, aceptacion de entrevista, expresion facial, marcha, psicomotricidad, conciencia, orientacion, actitud, atencion, contacto visual, habla, semantica, prosodia y sintaxis, discurso, espontaneidad, latencia, curso del pensamiento, velocidad, contenido, ideas delirantes, ideas de muerte, ideacion suicida, plan e intencion, heteroagresividad, sensopercepcion, animo, afecto, juicio, funciones cognitivas, inteligencia, advertencia de padecimiento, introspeccion, control de impulsos y proyeccion a futuro.

El Comentario debe comenzar con "Se trata de paciente..." e integrar sindrome, curso, antecedentes, riesgo, juicio, conducta, sustancias, confiabilidad, diferenciales y justificacion de manejo, sin repetir la Evolucion. Usa cautela clinica: "continua cursando predominantemente con", "debe interpretarse con cautela", "resulta indispensable continuar corroborando", "continua beneficiandose de manejo intrahospitalario" cuando corresponda.

El Plan debe contener unicamente acciones futuras confirmadas. No conviertas "valorar" en "iniciar". No conviertas tratamientos previos en actuales.

Reglas innegociables:
No inventes informacion. No completes hallazgos normales. No cambies negaciones. No cambies medicamentos, dosis, cifras, fechas ni nombres. No infieras sexo por nombre; usa el expediente o deja pendiente. No confundas riesgo historico con actual. No copies la transcripcion. No incluyas alertas tecnicas en el texto clinico. Conserva citas textuales y utiliza "sic. Pac." o "sic. Fam." segun informante. Devuelve JSON valido conforme al esquema.

Devuelve JSON estricto con:
{
  "transcriptSessionId": "",
  "patientId": "",
  "encounterId": "",
  "documentType": "",
  "writingStyle": "",
  "schemaVersion": "voice_note_soap_v1",
  "evolutionOrSubjective": { "text": "", "sourceSegmentIds": [] },
  "objective": {
    "vitalSigns": [],
    "physicalNeurologicalExam": "",
    "mentalStatusExam": "",
    "results": "",
    "sourceSegmentIds": []
  },
  "analysis": {
    "text": "",
    "riskAssessment": {
      "deathIdeation": {},
      "suicidalIdeation": {},
      "plan": {},
      "intent": {},
      "meansAccess": {},
      "attempts": {},
      "selfHarm": {},
      "protectiveFactors": {},
      "currentRiskUncertainty": {}
    },
    "diagnosticReasoning": "",
    "differentialDiagnoses": [],
    "medicalConditionsToRuleOut": [],
    "sourceSegmentIds": []
  },
  "plan": { "text": "", "items": [], "sourceSegmentIds": [] },
  "unresolvedItems": [],
  "validationIssues": [],
  "speakerAssignments": [],
  "diagnosisProposals": [],
  "indicationProposals": []
}
`;

function extraerJson(texto = "") {
  const limpio = String(texto || "").trim();
  if (!limpio) return null;
  try { return JSON.parse(limpio); } catch {}
  const match = limpio.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return JSON.parse(match[0]);
}

exports.segmentClinicalConversation = onCall(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 60,
    memory: "512MiB"
  },
  async (request) => {
    return runSegmentClinicalConversation({
      data: request.data || {},
      auth: request.auth || null,
      apiKey: OPENAI_API_KEY.value(),
      env: process.env,
      OpenAIClass: OpenAI,
      HttpsErrorClass: HttpsError,
      logger: console
    });
  }
);

exports.generateStructuredNoteFromDictation = onCall(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 90,
    memory: "512MiB"
  },
  async (request) => {
    return runGenerateStructuredNoteFromDictation({
      data: request.data || {},
      auth: request.auth || null,
      apiKey: OPENAI_API_KEY.value(),
      env: process.env,
      OpenAIClass: OpenAI,
      HttpsErrorClass: HttpsError,
      logger: console,
      adminDb
    });
  }
);

Object.assign(exports, calendar);
