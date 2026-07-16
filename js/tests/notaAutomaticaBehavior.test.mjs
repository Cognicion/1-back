import assert from "node:assert/strict";
import { DictadoStateMachine, ESTADOS_DICTADO } from "../services/dictadoStateMachine.js";
import { TranscriptAssembler } from "../services/transcriptAssembler.js";
import { DraftPersistenceService } from "../services/dictadoPersistence.js";
import {
  detectarContradicciones,
  ejecutarPipelineClinico,
  extraerAfirmacionesClinicas,
  segmentarTranscripcion,
  validarAislamientoContexto
} from "../services/clinicalPipeline.js";
import { generarNotaAutomatica } from "../services/notaAutomatica.js";
import { RuleBasedNoteGenerationProvider } from "../services/noteGenerationProviders.js";
import { WebSpeechTranscriptionProvider } from "../services/transcriptionProviders.js";

function statement(text) {
  return extraerAfirmacionesClinicas(segmentarTranscripcion(text))[0];
}

// Negación, doble negación, no explorado, incertidumbre, temporalidad e informante.
assert.equal(statement("Niega ideación suicida.").assertionStatus, "negado");
assert.equal(statement("No niega ideación suicida.").assertionStatus, "incierto");
assert.equal(statement("No se exploró ideación suicida.").assertionStatus, "no_explorado");
const temporal = ejecutarPipelineClinico("Previamente presentó ideación suicida, actualmente la niega.");
assert.equal(temporal.statements[0].assertionStatus, "historico");
assert.equal(temporal.statements[1].assertionStatus, "negado");
assert.equal(statement("La madre niega que el paciente haya intentado suicidarse.").informant, "madre");
const versiones = ejecutarPipelineClinico("El paciente niega alucinaciones, aunque la madre refiere soliloquios.");
assert.equal(versiones.statements[0].assertionStatus, "negado");
assert.equal(versiones.statements[1].informant, "madre");
assert.ok(versiones.contradictions.length >= 1);
assert.equal(statement("Sin datos de abstinencia.").assertionStatus, "negado");
assert.equal(statement("No se descarta intoxicación.").assertionStatus, "incierto");
assert.equal(statement("Niega alergias conocidas.").assertionStatus, "negado");
assert.equal(statement("No recuerda si es alérgico.").assertionStatus, "incierto");
assert.equal(statement("Suspendió clonazepam.").assertionStatus, "suspendido");
assert.equal(statement("No suspendió clonazepam.").assertionStatus, "negado");

// Contradicciones conservan ambas versiones.
const contradiccion = ejecutarPipelineClinico("El paciente niega alucinaciones. La madre refiere alucinaciones del paciente.");
assert.ok(contradiccion.contradictions.length >= 1);
assert.ok(contradiccion.contradictions[0].statementIds.length >= 2);

// Examen mental solo contiene dominios sustentados, sin normalidad predeterminada.
const mental = ejecutarPipelineClinico("Durante la entrevista se observa lenguaje lento.");
assert.ok(mental.mentalStatusFindings.some((finding) => finding.domain === "lenguaje"));
assert.equal(mental.mentalStatusFindings.some((finding) => finding.domain === "orientacion"), false);

// Medicamentos, fracciones y propuestas no confirmadas.
const medicamentos = ejecutarPipelineClinico("Indicar clonazepam ½ mg por la noche. Solicitar biometría hemática.");
assert.equal(medicamentos.medicationStatements[0].fraction, "½");
assert.ok(medicamentos.orderProposals.some((order) => order.type === "medicamento"));
assert.ok(medicamentos.orderProposals.every((order) => order.confirmed === false));

// Aislamiento deliberado paciente A -> paciente B.
const assembler = new TranscriptAssembler({ sessionId: "sesion-b", patientId: "paciente-b" });
const rejected = assembler.addRecognitionResult({ sessionId: "sesion-a", patientId: "paciente-a", resultIndex: 0, transcript: "dato de A", isFinal: true });
assert.equal(rejected.rejected, true);
assert.equal(assembler.getText(), "");
assert.equal(validarAislamientoContexto({ patientId: "paciente-a", sessionId: "sesion-a" }, { patientId: "paciente-b", sessionId: "sesion-b" }), false);

// La instantánea provisional conserva todos los índices activos y no depende de onend.
const streaming = new TranscriptAssembler({ sessionId: "streaming", patientId: "paciente-a" });
streaming.addRecognitionResult({ sessionId: "streaming", patientId: "paciente-a", streamId: "ciclo-1", streamSequence: 1, resultIndex: 0, transcript: "primer fragmento", isFinal: false });
streaming.addRecognitionResult({ sessionId: "streaming", patientId: "paciente-a", streamId: "ciclo-1", streamSequence: 1, resultIndex: 1, transcript: "segundo fragmento", isFinal: false });
assert.equal(streaming.getProvisional().toLowerCase(), "primer fragmento segundo fragmento");
streaming.addRecognitionResult({ sessionId: "streaming", patientId: "paciente-a", streamId: "ciclo-1", streamSequence: 1, resultIndex: 1, transcript: "segundo fragmento ampliado", isFinal: false });
assert.equal(streaming.getProvisional().toLowerCase(), "primer fragmento segundo fragmento ampliado");
streaming.addRecognitionResult({ sessionId: "streaming", patientId: "paciente-a", streamId: "ciclo-1", streamSequence: 1, resultIndex: 0, transcript: "primer fragmento", isFinal: true });
assert.equal(streaming.getText().toLowerCase(), "primer fragmento");
assert.equal(streaming.getProvisional().toLowerCase(), "segundo fragmento ampliado");
streaming.preserveInterimsAsPending({ streamId: "ciclo-1" });
assert.equal(streaming.getPendingText().toLowerCase(), "segundo fragmento ampliado");
streaming.includePendingInText();
assert.equal(streaming.getText().toLowerCase(), "primer fragmento segundo fragmento ampliado");
streaming.addRecognitionResult({ sessionId: "streaming", patientId: "paciente-a", streamId: "ciclo-2", streamSequence: 2, resultIndex: 0, transcript: "tercer fragmento", isFinal: true });
assert.match(streaming.getText(), /tercer fragmento/i);
const restoredStreaming = new TranscriptAssembler({ sessionId: "otro", patientId: "paciente-a" });
restoredStreaming.restore(streaming.toJSON());
assert.equal(restoredStreaming.getText(), streaming.getText());
assert.equal(restoredStreaming.pendingSegments.length, 1);

// Edición manual, duplicados y secuencia iniciar -> pausar -> reanudar -> finalizar.
assembler.setManualText("Texto manual");
assembler.addRecognitionResult({ sessionId: "sesion-b", patientId: "paciente-b", resultIndex: 1, transcript: "nuevo hallazgo", isFinal: true });
assembler.addRecognitionResult({ sessionId: "sesion-b", patientId: "paciente-b", resultIndex: 2, transcript: "nuevo hallazgo", isFinal: true });
assert.equal((assembler.getText().match(/nuevo hallazgo/gi) || []).length, 1);
const machine = new DictadoStateMachine();
assert.equal(machine.transition(ESTADOS_DICTADO.READY), true);
assert.equal(machine.transition(ESTADOS_DICTADO.REQUESTING_PERMISSION), true);
assert.equal(machine.transition(ESTADOS_DICTADO.LISTENING), true);
assert.equal(machine.transition(ESTADOS_DICTADO.PAUSED), true);
assert.equal(machine.transition(ESTADOS_DICTADO.REQUESTING_PERMISSION), true);
assert.equal(machine.transition(ESTADOS_DICTADO.LISTENING), true);
assert.equal(machine.transition(ESTADOS_DICTADO.STOPPING), true);
assert.equal(machine.transition(ESTADOS_DICTADO.COMPLETED), true);

// Persistencia estrictamente aislada por paciente/encuentro.
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};
new DraftPersistenceService({ userId: "u", patientId: "a", encounterId: "e" }).save({ text: "solo A" });
assert.equal(new DraftPersistenceService({ userId: "u", patientId: "b", encounterId: "e" }).load(), null);
assert.equal(new DraftPersistenceService({ userId: "u", patientId: "a", encounterId: "e" }).load().text, "solo A");

// El proveedor local crea borrador revisable con procedencia, no inserta ni confirma.
const provider = new RuleBasedNoteGenerationProvider();
const note = provider.generate("La madre refiere que el paciente suspendió clonazepam. Niega ideación suicida.", { id: "a" }, { patientId: "a", sessionId: "s" });
assert.equal(note.provider, "rule_based_local");
assert.ok(note.clinicalStatements.length >= 2);
assert.ok(note.clinicalStatements.every((item) => item.provenance?.patientId === "a"));
assert.equal(note.insertionAllowed, false);
assert.ok(note.generatedSections.every((section) => section.accepted === false));
assert.ok(note.provenanceRecords.length >= note.clinicalStatements.length);

// Caso real: fuente breve, medicamento estructurado, riesgo atómico y ningún plan inferido.
const realCase = generarNotaAutomatica(
  "Pareja: luego dice que es que yo tengo muchos dispositivos, que si está la Guardia Nacional afuera. " +
  "Refiere que tomó quetiapina, luego agua e hizo gárgaras y presentó conducta desorganizada. " +
  "En la entrega de guardia mencionan nacimiento del bebé, cannabis, posible cocaína, posible violación y agitación. " +
  "Antecedente de depresión, clonazepam y cita previa.",
  { id: "a" }, { patientId: "a", sessionId: "s" }
);
const sourceSection = realCase.generatedSections.find((section) => section.section === "fuente_confiabilidad");
assert.match(sourceSection.content, /confiabilidad no fue especificada/i);
assert.equal(sourceSection.content.includes("dispositivos"), false);
const medicationSection = realCase.generatedSections.find((section) => section.section === "medicamentos");
assert.match(medicationSection.content, /Quetiapina/i);
assert.match(medicationSection.content, /dosis no especificada/i);
assert.equal(medicationSection.content.includes("gárgaras"), false);
assert.equal(realCase.planItems.length, 0);
assert.equal(realCase.generatedSections.some((section) => section.section === "plan"), false);
assert.ok(realCase.riskStatements.some((risk) => risk.type === "agresion_sexual"));
const riskSection = realCase.generatedSections.find((section) => section.section === "evaluacion_riesgo");
assert.equal(riskSection.content.includes("nacimiento del bebé"), false);
assert.equal(riskSection.content.includes("clonazepam"), false);
assert.ok(realCase.validationIssues.some((issue) => issue.type === "incertidumbre_transcripcion"));
assert.ok(realCase.generatedSections.every((section) => section.confidence === null));

const explicitPlan = generarNotaAutomatica("Solicitar biometría hemática. Citar en una semana.", { id: "a" }, { patientId: "a", sessionId: "s" });
assert.equal(explicitPlan.planItems.length, 2);
assert.ok(explicitPlan.generatedSections.some((section) => section.section === "plan"));

// Generación por secciones y riesgos críticos requieren confirmación.
const riskNote = generarNotaAutomatica("Actualmente presenta ideación suicida con plan.", { id: "a" }, { patientId: "a", sessionId: "s" });
assert.ok(riskNote.generatedSections.some((section) => section.section === "evaluacion_riesgo"));
assert.ok(riskNote.validationIssues.some((issue) => issue.requiresExplicitReview));

// Web Speech configura es-MX, provisionales/continuo y rechaza eventos tardíos tras detenerse.
class FakeRecognition {
  start() { this.started = true; }
  stop() { this.stopped = true; }
  abort() { this.aborted = true; }
}
const fakeWindow = { SpeechRecognition: FakeRecognition, setTimeout, clearTimeout };
let providerResults = 0;
const providerContexts = [];
let endedStreams = 0;
const webProvider = new WebSpeechTranscriptionProvider({
  windowRef: fakeWindow,
  baseBackoffMs: 1,
  onResult: (_event, context) => { providerResults += 1; providerContexts.push(context); },
  onStreamEnd: () => { endedStreams += 1; }
});
webProvider.start({ sessionId: "s", patientId: "a" });
assert.equal(webProvider.recognition.lang, "es-MX");
assert.equal(webProvider.recognition.continuous, true);
assert.equal(webProvider.recognition.interimResults, true);
const lateHandler = webProvider.recognition.onresult;
lateHandler({ resultIndex: 0, results: [] });
assert.equal(providerResults, 1);
const firstRecognition = webProvider.recognition;
firstRecognition.onend();
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(endedStreams, 1);
assert.notEqual(webProvider.recognition.cognicionStreamContext.streamId, firstRecognition.cognicionStreamContext.streamId);
webProvider.stop();
lateHandler({ resultIndex: 0, results: [] });
assert.equal(providerResults, 1);

console.log("notaAutomaticaBehavior: ok");
