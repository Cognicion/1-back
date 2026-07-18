import assert from "node:assert/strict";
import fs from "node:fs";
import { segmentarConversacionClinica } from "../services/clinicalPipeline.js";
import { RuleBasedNoteGenerationProvider } from "../services/noteGenerationProviders.js";
import {
  extraerHechosEvolucionNarrativa,
  validarBloqueoEvolucionNarrativa
} from "../services/notaAutomatica.js";

const provider = new RuleBasedNoteGenerationProvider();

const carlosConversacion = `
buenas tardes Carlos me escucha si doctor me puede decir su nombre completo Carlos Kaju Quintero cuantos anos tiene treinta y cuatro sabe donde se encuentra En el Fray
durante la valoracion fue abordado en cama correspondiente en posicion sedente acepta la entrevista y se muestra cooperador
ha sentido que la television le envia mensajes no desde hace varios dias ya no
escucha voces que otras personas no escuchan no actualmente
ha pensado en quitarse la vida no tiene intencion de morir actualmente aqui no
ha pensado en agredir a su hermano no ya estoy menos enojado
quien es su red de apoyo mi mama
quiere continuar tratamiento si doctor y seguimiento al salir
considera que el consumo de cristal y cannabis y no dormir influyo si puede ser
desde el punto de vista medico dormi siete horas apetito bien diuresis y evacuaciones normales boca seca y somnolencia en la manana tomo risperidona pero no se si sigo con clonazepam
durante la entrevista se observa atencion conservada lenguaje fluente curso del pensamiento lineal juicio parcialmente comprometido introspeccion parcial
por el momento continua presentando ideas delirantes de dano y se justifica observacion
se mantendra vigilancia por riesgo heteroagresivo signos vitales por turno continuar risperidona solicitar biometria hematica reevaluar riesgo por la manana
`;

const segmentosCarlos = segmentarConversacionClinica(carlosConversacion);
const resultCarlos = provider.generate({
  transcriptSessionId: "carlos-bloqueos",
  patientId: "paciente-carlos",
  encounterId: "obs-21",
  confirmedTranscript: carlosConversacion,
  correctedTranscript: carlosConversacion,
  conversationSegments: segmentosCarlos,
  selectedDocumentType: "evolucion_observacion",
  selectedWritingStyle: "evolucion_narrativa_institucional",
  authorizedPatientContext: {
    id: "paciente-carlos",
    nombreCompleto: "Carlos Kaju Quintero",
    sexo: "masculino",
    edad: 34,
    servicio: "OBSERVACION",
    diaEstancia: 21,
    criterio: "sintomatologia psicotica y riesgo de conducta heteroagresiva"
  }
});

const evolucionCarlos = resultCarlos.generatedClinicalText.subjective.text;
assert.match(evolucionCarlos, /^Carlos Kaju Quintero, hombre de 34 años, quien cursa su 21\.er día/);
assert.match(evolucionCarlos, /mensajes dirigidos a través de la televisión/i);
assert.match(evolucionCarlos, /dejaron de presentarse varios días antes/i);
assert.match(evolucionCarlos, /niega actualmente presentar alteraciones de la sensopercepción/i);
assert.match(evolucionCarlos, /niega ideas de muerte, ideación suicida, intención o plan suicida/i);
assert.match(evolucionCarlos, /disminución del enojo hacia su hermano/i);
assert.match(evolucionCarlos, /madre como principal red de apoyo/i);
assert.match(evolucionCarlos, /metanfetamina y cannabis/i);
assert.match(evolucionCarlos, /no puede confirmar si continúa recibiendo clonazepam/i);

assert.doesNotMatch(evolucionCarlos, /buenas tardes|me escucha|me puede decir|ha sentido|quiere continuar/i);
assert.doesNotMatch(evolucionCarlos, /durante la entrevista se observa|contacto visual|psicomotricidad|curso del pensamiento|juicio parcialmente|introspeccion/i);
assert.doesNotMatch(evolucionCarlos, /por el momento continua|se justifica|riesgo dinámico/i);
assert.doesNotMatch(evolucionCarlos, /se mantendra|solicitar|signos vitales por turno|reevaluar/i);
assert.equal(validarBloqueoEvolucionNarrativa(evolucionCarlos, { hechos: resultCarlos.generatedClinicalText.subjective.provenance }).length, 0);

const hechos = extraerHechosEvolucionNarrativa({ transcript: carlosConversacion, utterances: segmentosCarlos });
const referencia = hechos.find((hecho) => hecho.domain === "thought_content.reference");
assert.equal(referencia.status, "absent");
assert.equal(referencia.previousStatus, "present");
assert.equal(referencia.destinationSection, "evolution");
assert.ok(referencia.sourceUtteranceIds.length >= 1);

const truncado = "Carlos refiere mejoria no solamente quiero h";
const resultTruncado = provider.generate({
  confirmedTranscript: truncado,
  correctedTranscript: truncado,
  selectedDocumentType: "evolucion_observacion",
  selectedWritingStyle: "evolucion_narrativa_institucional",
  authorizedPatientContext: { nombreCompleto: "Carlos Kaju Quintero", sexo: "masculino", edad: 34 }
});
assert.equal(resultTruncado.generatedClinicalText.subjective.text, "");
assert.ok(resultTruncado.generatedClinicalText.subjective.validationIssues.some((issue) => /confiable|fragmentos corruptos/i.test(issue.message)));

assert.ok(validarBloqueoEvolucionNarrativa("Paciente refiere mejoria (pendiente de)", { hechos }).some((issue) => issue.severity === "high"));
assert.ok(validarBloqueoEvolucionNarrativa("Durante la entrevista se observa contacto visual y curso del pensamiento lineal.", { hechos }).some((issue) => issue.severity === "high"));

const otraEntrevista = `
Durante la valoracion fue abordada en consultorio, acepta entrevista y se muestra cooperadora.
Refiere mejoria del animo y niega ideas suicidas actualmente.
Identifica a su hermana como apoyo y refiere apetito conservado con sueno de seis horas.
`;
const otra = provider.generate({
  confirmedTranscript: otraEntrevista,
  correctedTranscript: otraEntrevista,
  selectedDocumentType: "evolucion_observacion",
  selectedWritingStyle: "evolucion_narrativa_institucional",
  authorizedPatientContext: { nombreCompleto: "Paciente Diferente", sexo: "femenino", edad: 41, servicio: "OBSERVACION", diaEstancia: 2 }
});
assert.doesNotMatch(otra.generatedClinicalText.subjective.text, /Carlos Kaju Quintero|madre como principal red|clonazepam|metanfetamina/i);
assert.notEqual(otra.generatedClinicalText.subjective.text, evolucionCarlos);

const source = fs.readFileSync(new URL("../services/notaAutomatica.js", import.meta.url), "utf8");
assert.doesNotMatch(source, /Carlos Kaju Quintero, hombre de 34 años, quien cursa su 21\.er día/);
assert.match(source, /EVOLUTION_FACT_SCHEMA_VERSION/);
assert.match(source, /destinationSection/);

console.log("evolucionNarrativaBloqueos.test.mjs OK");
