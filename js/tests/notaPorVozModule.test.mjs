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

const vozJs = read("js/nota-por-voz.js");
assert.match(vozJs, /Segmentacion avanzada no disponible\. Se conservo la segmentacion basica\./);
assert.match(vozJs, /externalBlocks > 0/);

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
assert.match(functionsSource, /runGenerateStructuredNoteFromDictation/);
assert.match(functionsSource, /generateStructuredNoteFromDictation/);
assert.match(functionsSource, /evolutionOrSubjective/);
assert.match(functionsSource, /No conviertas "valorar" en "iniciar"/);

const external = new ExternalStructuredNoteGenerationProvider({
  callable: async () => ({
    data: {
      transcriptSessionId: "voz-1",
      patientId: "paciente-voz",
      encounterId: "enc-voz",
      provider: "external",
      model: "gpt-4.1-mini",
      promptVersion: "psychiatric_voice_note_es_mx_v2",
      schemaVersion: "voice_note_evolution_v1",
      sections: {
        evolution: {
          text: "Paciente refiere evolucion cronologica.",
          sourceUtteranceIds: ["utt-1"],
          requiresReview: true,
          warnings: []
        }
      },
      globalWarnings: []
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
  selectedWritingStyle: "formato_fray_narrativo",
  patientContext: { patientId: "paciente-voz", encounterId: "enc-voz" },
  noteConfiguration: { noteType: "evolucion_observacion", styleId: "formato_fray_narrativo", promptVersion: "psychiatric_voice_note_es_mx_v2" },
  transcript: {
    transcriptId: "voz-1",
    segmentationMode: "hybrid",
    utterances: [{ id: "utt-1", text: "Paciente refiere evolucion cronologica.", probableRole: "patient", speechAct: "answer" }]
  }
});

assert.ok(generated.generatedSections.some((section) => section.section === "soap_subjective"));
assert.equal(generated.generatedSections.some((section) => section.fieldTarget === "analysis"), false);
assert.equal(generated.generatedSections.some((section) => section.section === "evaluacion_riesgo"), false);

const audio = new AudioCaptureService();
assert.deepEqual(audio.measure(), { rms: 0, level: 0, warnings: [] });

console.log("notaPorVozModule.test.mjs OK");
