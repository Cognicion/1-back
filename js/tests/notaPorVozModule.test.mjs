import assert from "node:assert/strict";
import fs from "node:fs";
import { ExternalStructuredNoteGenerationProvider } from "../services/noteGenerationProviders.js";
import { AudioCaptureService } from "../services/audioCaptureService.js";

const root = new URL("../../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

const notaHtml = read("nota.html");
assert.equal(/css\/dictado\.css/.test(notaHtml), false, "nota.html no debe cargar CSS de dictado");
assert.equal(/btnIniciarDictado/.test(notaHtml), false, "nota.html no debe contener controles activos de dictado");
assert.match(notaHtml, /abrirModuloNotaPorVoz/);

const notaJs = read("js/nota.js");
assert.equal(/import\("\.\/dictado\.js/.test(notaJs), false, "nota.js no debe importar dictado en la carga inicial");
assert.match(notaJs, /nota-por-voz\.html/);
assert.match(notaJs, /abrirNotaIndicadaEnUrl/);

const vozHtml = read("nota-por-voz.html");
assert.match(vozHtml, /VERSIÓN ALFA · EN DESARROLLO/);
assert.match(vozHtml, /js\/dictado\.js/);
assert.match(vozHtml, /js\/nota-por-voz\.js/);

const serviceSource = read("js/services/voiceNoteGenerationService.js");
assert.match(serviceSource, /Math\.floor\(edad \/ 10\) \+ 1/);
assert.match(serviceSource, /voiceNoteSessions/);
assert.match(serviceSource, /voiceTranscripts/);
assert.match(serviceSource, /generatedNoteDrafts/);
assert.match(serviceSource, /obsExploracionFisicaNeurologica/);
assert.match(serviceSource, /No se pudo identificar al paciente/);

const persistenceSource = read("js/services/dictadoPersistence.js");
assert.match(persistenceSource, /indexedDB/);
assert.match(persistenceSource, /cognicionVoiceNoteDrafts/);

const functionsSource = read("functions/index.js");
assert.match(functionsSource, /voice_note_fray_aldo_evolucion_v2_2026-07-18/);
assert.match(functionsSource, /evolutionOrSubjective/);
assert.match(functionsSource, /No conviertas "valorar" en "iniciar"/);

const external = new ExternalStructuredNoteGenerationProvider({
  callable: async () => ({
    data: {
      transcriptSessionId: "voz-1",
      patientId: "paciente-voz",
      encounterId: "enc-voz",
      schemaVersion: "voice_note_soap_v1",
      evolutionOrSubjective: { text: "Paciente refiere evolucion cronologica.", sourceSegmentIds: ["s1"] },
      objective: {
        physicalNeurologicalExam: "",
        mentalStatusExam: "Hombre despierto, cooperador, con lenguaje fluente.",
        results: "",
        sourceSegmentIds: ["s2"]
      },
      analysis: { text: "Se trata de paciente masculino de la cuarta decada de la vida.", riskAssessment: {}, sourceSegmentIds: ["s3"] },
      plan: { text: "Continuar vigilancia y entrevistas seriadas.", items: ["vigilancia"], sourceSegmentIds: ["s4"] },
      validationIssues: []
    }
  }),
  fallbackToLocal: false
});

const generated = await external.generate({
  transcriptSessionId: "voz-1",
  userId: "clinico",
  patientId: "paciente-voz",
  encounterId: "enc-voz",
  correctedTranscript: "Paciente refiere evolucion cronologica. Plan: continuar vigilancia.",
  confirmedTranscript: "Paciente refiere evolucion cronologica. Plan: continuar vigilancia.",
  selectedDocumentType: "evolucion_observacion",
  selectedWritingStyle: "formato_fray_narrativo"
});

assert.ok(generated.generatedSections.some((section) => section.section === "soap_subjective"));
assert.ok(generated.generatedSections.some((section) => section.fieldTarget === "analysis"));
assert.equal(generated.generatedSections.some((section) => section.section === "evaluacion_riesgo"), false);

const audio = new AudioCaptureService();
assert.deepEqual(audio.measure(), { rms: 0, level: 0, warnings: [] });

console.log("notaPorVozModule.test.mjs OK");
