import assert from "node:assert/strict";
import fs from "node:fs";
import { RuleBasedNoteGenerationProvider } from "../services/noteGenerationProviders.js";
import { EVOLUTION_NARRATIVE_INSTITUTIONAL_TEMPLATE } from "../services/voiceNoteStyleTemplates.js";

const provider = new RuleBasedNoteGenerationProvider();

const transcript = `
Carlos Kaju Quintero cursa 21 dia de estancia. Servicio Observacion. Seguimiento por sintomatologia psicotica y riesgo de conducta heteroagresiva.
Durante la valoracion fue abordado en cama, en posicion sedente, acepta la entrevista y se muestra cooperador.
Refiere disminucion de ideas de persecucion, dano y referencia. Niega actualmente escuchar voces o ver cosas que otras personas no perciben.
Reconoce parcialmente que el consumo de cristal pudo influir en lo sucedido y refiere intencion de mantenerse abstinente.
Niega actualmente ideacion suicida y niega deseos de agredir a su hermano, aunque persiste incertidumbre sobre la convivencia al egreso.
Identifica como principal red de apoyo a su madre y se muestra dispuesto a continuar tratamiento.
Desde el punto de vista medico refiere sueno conservado, apetito conservado, diuresis y evacuaciones presentes. Niega efectos adversos. Se menciona clonazepam, pero la dosis queda incierta.
Plan: continuar vigilancia, signos vitales por turno y valorar egreso.
Durante la entrevista se observa atencion conservada, lenguaje fluente, curso del pensamiento lineal, afecto eutimico, juicio parcial e introspeccion parcial.
`;

const result = provider.generate({
  transcriptSessionId: "carlos-evolucion",
  userId: "clinico",
  patientId: "paciente-carlos",
  encounterId: "obs-21",
  confirmedTranscript: transcript,
  correctedTranscript: transcript,
  selectedDocumentType: "evolucion_observacion",
  selectedWritingStyle: "evolucion_narrativa_institucional",
  authorizedPatientContext: {
    id: "paciente-carlos",
    nombreCompleto: "Carlos Kaju Quintero",
    sexo: "masculino",
    edad: 34,
    servicio: "OBSERVACIÓN",
    diaEstancia: 21,
    criterio: "sintomatología psicótica y riesgo de conducta heteroagresiva"
  }
});

const evolucion = result.generatedClinicalText.subjective.text;

assert.match(evolucion, /^Carlos Kaju Quintero, hombre de 34 años, quien cursa su 21 día de estancia intrahospitalaria en el servicio especial de OBSERVACIÓN bajo el criterio de sintomatología psicótica y riesgo de conducta heteroagresiva\./);
assert.match(evolucion, /Durante la valoración fue abordado/i);
assert.match(evolucion, /disminucion de ideas de persecucion/i);
assert.match(evolucion, /Niega actualmente escuchar voces/i);
assert.match(evolucion, /consumo de cristal/i);
assert.match(evolucion, /niega actualmente ideaci[oó]n suicida/i);
assert.match(evolucion, /red de apoyo a su madre/i);
assert.match(evolucion, /dispuesto a continuar tratamiento/i);
assert.match(evolucion, /Desde el punto de vista médico/i);
assert.match(evolucion, /clonazepam/i);
assert.doesNotMatch(evolucion, /\?/);
assert.doesNotMatch(evolucion, /signos vitales por turno/i);
assert.doesNotMatch(evolucion, /curso del pensamiento|juicio parcial|introspeccion parcial/i);
assert.ok(evolucion.split(/\n{2,}/).length <= 5);

const generationSource = fs.readFileSync(new URL("../services/voiceNoteGenerationService.js", import.meta.url), "utf8");
assert.match(generationSource, /validarEvolucionNarrativaInstitucional/);
assert.match(generationSource, /evolución contiene preguntas, instrucciones, plan, examen mental completo o texto técnico/i);
assert.match(generationSource, /evolutionOrSubjective/);

const forbidden = EVOLUTION_NARRATIVE_INSTITUTIONAL_TEMPLATE.validation.forbiddenPatterns.map((pattern) => new RegExp(pattern, "i"));
assert.equal(forbidden.some((regex) => regex.test("se muestra dispuesto a continuar tratamiento")), false);
assert.equal(forbidden.some((regex) => regex.test("continuar vigilancia y signos vitales por turno")), true);

console.log("evolucionNarrativaInstitucional.test.mjs OK");
