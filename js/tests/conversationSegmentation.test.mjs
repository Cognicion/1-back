import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { segmentarConversacionClinica } from "../services/clinicalPipeline.js";
import { RuleBasedConversationSegmentationProvider } from "../services/conversationSegmentationProviders.js";

const carlos = `
buenas tardes Carlos me escucha si doctor me puede decir su nombre completo Carlos Eduardo Ramirez Soto cuantos años tiene veintinueve sabe donde se encuentra En el Fray
escucha voces que otras personas no escuchan Antes escuchaba una voz por la noche que le decia Ten cuidado no salgas te van a encontrar
ha pensado en quitarse la vida no tiene intencion de morir actualmente aqui no
durante la entrevista se observa despierto y orientado mantiene actitud vigilante presenta contacto visual intermitente su discurso es claro
voy a resumir para verificar que comprendi antes del ingreso presento discusiones con vecinos y amenazas a familiares
si pero yo no lo llamaria agresion solamente defenderme
por el momento continua presentando ideas delirantes de dano con juicio parcialmente comprometido se considera que requiere vigilancia
se mantendra vigilancia por riesgo heteroagresivo signos vitales por turno continuar risperidona solicitar biometria hematica reevaluar riesgo por la manana
esta de acuerdo con permanecer esta noche no quiero pero entiendo que por ahora no me van a dejar salir hay algo mas que quiera decir no solamente quiero hablar con mi mama
`;

const segmentos = segmentarConversacionClinica(carlos);

assert.ok(segmentos.length >= 24, `Se esperaban multiples turnos; se obtuvieron ${segmentos.length}`);
assert.equal(segmentos.length === 1 && segmentos[0].probableRole === "unknown" && segmentos[0].speechAct === "other", false);

function findByText(pattern) {
  return segmentos.find((item) => pattern.test(item.text) || pattern.test(item.originalText || ""));
}

const saludo = findByText(/me escucha/i);
assert.equal(saludo?.probableRole, "clinician");
assert.equal(saludo?.speechAct, "question");

const respuestaSaludo = segmentos.find((item) => /si doctor/i.test(item.text));
assert.equal(respuestaSaludo?.probableRole, "patient");
assert.equal(respuestaSaludo?.speechAct, "answer");
assert.equal(respuestaSaludo?.linkedUtteranceId, saludo.id);

const nombrePregunta = findByText(/nombre completo/i);
const nombreRespuesta = findByText(/Carlos Eduardo Ramirez Soto/i);
assert.equal(nombrePregunta?.speechAct, "question");
assert.equal(nombreRespuesta?.linkedUtteranceId, nombrePregunta.id);

const vocesPregunta = findByText(/Escucha voces/i);
const vocesRespuesta = findByText(/Antes escuchaba una voz/i);
assert.equal(vocesPregunta?.probableRole, "clinician");
assert.equal(vocesRespuesta?.probableRole, "patient");
assert.equal(vocesRespuesta?.linkedUtteranceId, vocesPregunta.id);

assert.equal(findByText(/Durante la entrevista se observa/i)?.speechAct, "observation");
assert.equal(findByText(/voy a resumir/i)?.speechAct, "clinical_summary");
assert.equal(findByText(/no lo llamaria agresion/i)?.speechAct, "correction");
assert.equal(findByText(/continua presentando ideas delirantes/i)?.speechAct, "clinical_assessment");
assert.equal(findByText(/se mantendra vigilancia/i)?.speechAct, "plan");

const preguntaRiesgo = findByText(/ha pensado en quitarse la vida/i);
const respuestaRiesgo = segmentos.find((item) => item.linkedUtteranceId === preguntaRiesgo?.id);
assert.equal(preguntaRiesgo?.speechAct, "question");
assert.equal(respuestaRiesgo?.speechAct, "answer");
assert.equal(/ha pensado en quitarse la vida/i.test(respuestaRiesgo?.normalizedClinicalText || ""), false);

const truncado = segmentarConversacionClinica("buenas tardes Carlos me escucha si doctor no solamente quiero h");
assert.ok((truncado.warnings || []).some((warning) => warning.code === "possibly_truncated_transcript"));

const provider = new RuleBasedConversationSegmentationProvider();
const result = provider.segment({ transcriptId: "carlos-fixture", text: carlos });
assert.equal(result.segmentationMode, "linguistic");
assert.ok(result.utterances.length >= 24);

const uiSource = readFileSync(new URL("../nota-por-voz.js", import.meta.url), "utf8");
assert.match(uiSource, /data-seg-split/);
assert.match(uiSource, /data-seg-join/);
assert.match(uiSource, /data-seg-role/);
assert.match(uiSource, /data-seg-act/);
assert.match(uiSource, /deshacerSegmentacion/);

console.log("conversationSegmentation.test.mjs OK");
