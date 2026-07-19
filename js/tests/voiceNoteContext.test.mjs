import assert from "node:assert/strict";
import fs from "node:fs";
import {
  FORMAT_PERMISSION_FRAY,
  FORMAT_PERMISSION_NAVARRO,
  getCompatibleVoiceStyles,
  getDefaultVoiceNoteType,
  getDefaultVoiceStyle,
  getVoiceNoteType,
  getVoiceNoteTypesForService,
  noteTypeOptions,
  writingStyleOptions
} from "../services/voiceNoteCatalogService.js";

const root = new URL("../../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

const usuarioFray = {
  rol: "medico",
  institucion: "Hospital Psiquiatrico Fray Bernardino Alvarez",
  permisosFormatos: { [FORMAT_PERMISSION_FRAY]: true }
};
const usuarioNavarro = {
  rol: "medico",
  institucion: "Navarro",
  permisosFormatos: { [FORMAT_PERMISSION_NAVARRO]: true }
};

const tipos = noteTypeOptions();
const estilos = writingStyleOptions();

assert.ok(tipos.length >= 12, "El selector de tipo de nota debe tener catalogo local suficiente.");
assert.ok(estilos.length >= 6, "El selector de estilo debe tener catalogo local suficiente.");
assert.equal(getDefaultVoiceNoteType("Observacion"), "evolucion_general");
assert.equal(getDefaultVoiceNoteType("Observacion", { usuario: usuarioFray, userProfile: usuarioFray, permisos: usuarioFray.permisosFormatos }), "evolucion_observacion");
assert.equal(getDefaultVoiceNoteType("UCEP"), "evolucion_ucep");
assert.equal(getDefaultVoiceNoteType("Urgencias"), "urgencias_general");
assert.equal(getDefaultVoiceStyle("evolucion_observacion"), "evolucion_narrativa_institucional");
assert.ok(getVoiceNoteType("ingreso_observacion")?.destinationFields.includes("mentalStatusExam"));
assert.equal(getVoiceNoteTypesForService("Observacion").some((item) => item.id === "evolucion_observacion"), false);
assert.ok(getVoiceNoteTypesForService("Observacion", { usuario: usuarioFray, userProfile: usuarioFray, permisos: usuarioFray.permisosFormatos }).some((item) => item.id === "evolucion_observacion"));
assert.equal(getVoiceNoteTypesForService("Urgencias").some((item) => item.id === "referencia_navarro"), false);
assert.ok(getVoiceNoteTypesForService("Urgencias", { usuario: usuarioNavarro, userProfile: usuarioNavarro, permisos: usuarioNavarro.permisosFormatos }).some((item) => item.id === "referencia_navarro"));
assert.ok(getCompatibleVoiceStyles("referencia_navarro", { usuario: usuarioNavarro, userProfile: usuarioNavarro, permisos: usuarioNavarro.permisosFormatos }).some((item) => item.id === "urgencias_referencia_breve"));

const vozSource = read("js/nota-por-voz.js");
assert.match(vozSource, /params\.get\("patientId"\)/, "La pagina debe aceptar patientId por URL.");
assert.match(vozSource, /params\.get\("id"\)/, "La pagina debe conservar compatibilidad con id por URL.");
assert.match(vozSource, /resolverEncounterId/, "La pagina debe resolver atencion desde expediente.");
assert.doesNotMatch(vozSource, /encounterId:\s*params[\s\S]*\|\|\s*"actual"/, "No debe persistir el encuentro generico actual.");
assert.doesNotMatch(vozSource, /listarPacientes/, "Nota por voz no debe cargar catalogo de pacientes.");
assert.doesNotMatch(vozSource, /uidPaciente/, "Nota por voz no debe exponer selector de paciente.");
assert.match(vozSource, /Atencion actual/, "Debe usar etiqueta clinica comprensible.");
assert.match(vozSource, /formatearAtencionActual/, "Debe ocultar IDs tecnicos en la interfaz.");
assert.match(vozSource, /buscarBorradorNotaClinica/, "Debe buscar borrador destino compatible.");
assert.match(vozSource, /validarAislamientoSesion/, "Debe validar aislamiento antes de generar o transferir.");
assert.match(vozSource, /voiceTemplateSummary/, "Debe mostrar resumen de tipo, estilo y destino.");
assert.match(vozSource, /VOICE_NOTE_CATALOG_VERSION/, "Debe registrar la version del catalogo usado.");

const vozHtml = read("nota-por-voz.html");
assert.match(vozHtml, /id="voiceContextStatus"/);
assert.match(vozHtml, /id="voiceTemplateSummary"/);
assert.doesNotMatch(vozHtml, /id="uidPaciente"/);
assert.match(vozHtml, /id="voicePatientReadonly"/);
assert.match(vozHtml, /Atencion actual/);

const pacienteSource = read("js/paciente.js");
assert.match(pacienteSource, /patientId:\s*uidPaciente/, "El expediente debe abrir nota por voz con patientId.");
assert.match(pacienteSource, /encounterId/, "El expediente debe enviar encounterId.");
assert.match(pacienteSource, /returnUrl/, "El expediente debe enviar returnUrl.");
assert.match(pacienteSource, /nota-por-voz\.html\?\$\{qs\.toString\(\)\}/);

const dictadoSource = read("js/dictado.js");
assert.match(dictadoSource, /params\.get\("patientId"\)/);
assert.match(dictadoSource, /\$\("voiceEncounterId"\)\?\.value/);
assert.match(dictadoSource, /paciente:\$\{patientId\}/);
assert.doesNotMatch(dictadoSource, /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/);

console.log("voiceNoteContext.test.mjs OK");
