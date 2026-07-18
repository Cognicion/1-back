import assert from "node:assert/strict";
import fs from "node:fs";
import { segmentarConversacionClinica, ejecutarPipelineClinico } from "../services/clinicalPipeline.js";
import { RuleBasedNoteGenerationProvider } from "../services/noteGenerationProviders.js";

const conversacionVoces = segmentarConversacionClinica("¿Ha escuchado voces? No.");
assert.equal(conversacionVoces[0].isQuestion, true);
assert.equal(conversacionVoces[1].isAnswer, true);
assert.match(conversacionVoces[1].normalizedClinicalText, /Niega alucinaciones auditivas/i);

const pipelineVoces = ejecutarPipelineClinico("¿Ha escuchado voces? No.", { patientId: "paciente-soap", sessionId: "s-soap" });
assert.equal(pipelineVoces.riskStatements.some((risk) => risk.type === "psicosis" && risk.status !== "negado"), false);
assert.ok(pipelineVoces.mentalStatusFindings.every((finding) => finding.text !== "¿Ha escuchado voces?"));

const conversacionRiesgo = segmentarConversacionClinica("¿Tiene intención de morir? Sí, ayer sí. ¿Actualmente? Aquí no.");
assert.ok(conversacionRiesgo.some((item) => /Refiere intención de morir de forma previa/i.test(item.normalizedClinicalText)));
assert.ok(conversacionRiesgo.some((item) => /Niega intención de morir/i.test(item.normalizedClinicalText)));

const provider = new RuleBasedNoteGenerationProvider();
const transcript = `
Paciente Daniela Martinez Lopez, 24 anos. Refiere perdida de empleo hace dos meses y ruptura de pareja.
Desde entonces presenta tristeza, anhedonia, insomnio, hiporexia y deterioro funcional.
Desde hace tres semanas refiere ideas de muerte y desde hace cinco dias ideas suicidas.
Ayer penso en ingerir tabletas con intencion de morir, pero no ingirio medicamentos.
Actualmente dentro del hospital niega intencion de morir, pero refiere que no puede garantizar seguridad en domicilio.
Antecedente de autolesiones sin intencion suicida. Hipotiroidismo con tratamiento irregular con levotiroxina.
Episodio depresivo previo. Consume alcohol reciente, niega cannabis actual y fuma nicotina.
Cuenta con apoyo parcial de madre, pero sin vigilancia continua.
Durante la entrevista se observa contacto visual disminuido, atencion conservada, lenguaje bajo, pensamiento con ideas de muerte, animo triste, afecto restringido, juicio comprometido, introspeccion parcial y control de impulsos disminuido.
Plan: ingreso a Observacion, vigilancia por riesgo suicida, medidas de seguridad, signos vitales por turno, solicitar biometria hematica y perfil tiroideo, corroborar levotiroxina, valorar inicio de antidepresivo, Trabajo Social, entrevistas seriadas y reevaluacion del riesgo.
`;

const result = provider.generate({
  transcriptSessionId: "dictado-daniela",
  userId: "clinico",
  patientId: "paciente-daniela",
  encounterId: "enc-daniela",
  confirmedTranscript: transcript,
  correctedTranscript: transcript,
  selectedDocumentType: "ingreso_observacion",
  selectedWritingStyle: "formato_fray_narrativo",
  existingNoteFields: {},
  authorizedPatientContext: { id: "paciente-daniela", sexo: "femenino", edad: 24, source: "expediente" }
});

assert.ok(result.generatedClinicalText.subjective.text.includes("perdida de empleo"));
assert.ok(result.generatedClinicalText.analysis.text.startsWith("Se trata de paciente"));
assert.match(result.generatedClinicalText.plan.text, /valorar inicio de antidepresivo/i);
assert.equal(/sertralina/i.test(result.generatedClinicalText.plan.text), false);
assert.equal(result.generatedSections.some((section) => section.section === "evaluacion_riesgo"), false);
assert.equal(result.generatedSections.some((section) => /^Se detect[oó]/i.test(section.content)), false);
assert.ok(result.validationIssues.every((issue) => issue.summary || issue.displayTitle || issue.message));

const notaSource = fs.readFileSync(new URL("../nota.js", import.meta.url), "utf8");
assert.match(notaSource, /subjective:\s*\{\s*fieldId:\s*"subjetivo"/);
assert.match(notaSource, /physicalExam:\s*\{\s*fieldId:\s*"obsExploracionFisicaNeurologica"/);
assert.match(notaSource, /mentalStatusExam:\s*\{\s*fieldId:\s*"objetivo"/);
assert.match(notaSource, /analysis:\s*\{\s*fieldId:\s*"analisis"/);
assert.match(notaSource, /plan:\s*\{\s*fieldId:\s*"plan"/);
assert.equal(/evaluacion_riesgo:\s*"analisis"/.test(notaSource), false);

console.log("notaSoapDictado.test.mjs OK");
