import assert from "node:assert/strict";
import { parsePatientFields, fieldValues, extractLabeledFieldsFromText, extractAdministrativeField } from "../js/modules/patient-transfer/parsing/patientFieldParser.js";
import { resolvePatientIdentity } from "../js/modules/patient-transfer/parsing/patientIdentityResolver.js";
import { buildFullPatientName, suggestPatientNameParts } from "../js/modules/patient-transfer/parsing/patientNameParser.js";
import { sugerirTipoNota } from "../js/modules/importacionDocx/noteTypeDetector.js";

const headerText = [
  "Nombre completo del paciente: FILEMON CECILIO ARTEAGA BALTAZAR Fecha de nacimiento: 22/11/1947 Edad: 78 años",
  "No. de expediente: 198 150 No. de cama: 01 Fecha: 02/08/2026 Hora: 20:50 hrs Sexo: Hombre Género: Masculino-cis",
  "Servicio: Observación Alergias: NEGADAS Días de estancia en el servicio de observación: Primeras horas"
].join("\n");

const candidates = extractLabeledFieldsFromText(headerText);
assert.equal(candidates.find((item) => item.fieldKey === "nombre")?.normalizedValue, "FILEMON CECILIO ARTEAGA BALTAZAR");
assert.equal(candidates.find((item) => item.fieldKey === "fechaNacimiento")?.normalizedValue, "22/11/1947");
assert.equal(candidates.find((item) => item.fieldKey === "edad")?.normalizedValue, "78");
assert.equal(candidates.find((item) => item.fieldKey === "expediente")?.normalizedValue, "198 150");
assert.equal(candidates.find((item) => item.fieldKey === "cama")?.normalizedValue, "01");
assert.equal(candidates.find((item) => item.fieldKey === "fecha")?.normalizedValue, "02/08/2026");
assert.equal(candidates.find((item) => item.fieldKey === "hora")?.normalizedValue, "20:50");
assert.equal(candidates.find((item) => item.fieldKey === "sexo")?.normalizedValue, "Hombre");
assert.equal(candidates.find((item) => item.fieldKey === "genero")?.normalizedValue, "Masculino-cis");
assert.equal(candidates.find((item) => item.fieldKey === "servicio")?.normalizedValue, "Observación");
assert.equal(candidates.find((item) => item.fieldKey === "alergias")?.normalizedValue, "NEGADAS");

const parsed = parsePatientFields([
  {
    type: "paragraph",
    text: "NOTA DE INGRESO AL SERVICIO DE OBSERVACIÓN",
    rawRuns: ["NOTA DE INGRESO", " AL SERVICIO DE OBSERVACIÓN"],
    source: { blockIndex: 0, origin: "body" }
  },
  {
    type: "paragraph",
    text: headerText,
    rawRuns: [
      "Nombre completo del paciente:",
      " FILEMON CECILIO ARTEAGA BALTAZAR",
      " Fecha de nacimiento:",
      " 22/11/1947",
      " Edad:",
      " 78 años"
    ],
    source: { blockIndex: 1, origin: "body" }
  }
], "archivo-prueba");

const values = fieldValues(parsed.fields);
assert.deepEqual(values, {
  nombre: "FILEMON CECILIO ARTEAGA BALTAZAR",
  nombres: "FILEMON CECILIO",
  apellidoPaterno: "ARTEAGA",
  apellidoMaterno: "BALTAZAR",
  fechaNacimiento: "22/11/1947",
  edad: "78",
  expediente: "198 150",
  cama: "01",
  fecha: "02/08/2026",
  hora: "20:50",
  sexo: "Hombre",
  genero: "Masculino-cis",
  servicio: "Observación",
  alergias: "NEGADAS",
  diasEstancia: "Primeras horas"
});
assert.equal(parsed.fields.nombre.nameSplit.ruleApplied, "last-two-surnames");
assert.equal(parsed.fields.nombre.nameSplit.requiresReview, true);

const tableParsed = parsePatientFields([
  {
    type: "table",
    rows: [["Nombre completo del paciente", "FILEMON CECILIO ARTEAGA BALTAZAR", "Edad", "78 años"]],
    source: { blockIndex: 2, tableIndex: 0, origin: "body" }
  }
], "tabla-prueba");
assert.equal(tableParsed.fields.nombre.value, "FILEMON CECILIO ARTEAGA BALTAZAR");
assert.equal(tableParsed.fields.edad.value, "78");

const duplicated = parsePatientFields([
  { type: "paragraph", text: "Nombre completo del paciente: A Edad: 30", source: { blockIndex: 0 } },
  { type: "paragraph", text: "Nombre completo del paciente: B", source: { blockIndex: 1 } }
], "conflicto");
assert.equal(duplicated.fields.nombre.conflict, true);

assert.deepEqual(suggestPatientNameParts("FILEMON CECILIO ARTEAGA BALTAZAR"), {
  nombres: "FILEMON CECILIO",
  apellidoPaterno: "ARTEAGA",
  apellidoMaterno: "BALTAZAR",
  confidence: "high",
  requiresReview: true,
  ruleApplied: "last-two-surnames",
  originalValue: "FILEMON CECILIO ARTEAGA BALTAZAR",
  normalizedForMatching: "filemon cecilio arteaga baltazar"
});
assert.equal(suggestPatientNameParts("JUAN PÉREZ LÓPEZ").nombres, "JUAN");
assert.equal(suggestPatientNameParts("JUAN PÉREZ LÓPEZ").apellidoPaterno, "PÉREZ");
assert.equal(suggestPatientNameParts("JUAN PÉREZ LÓPEZ").apellidoMaterno, "LÓPEZ");
const compound = suggestPatientNameParts("MARÍA FERNANDA DE LA CRUZ HERNÁNDEZ");
assert.equal(compound.nombres, "MARÍA FERNANDA");
assert.equal(compound.apellidoPaterno, "DE LA CRUZ");
assert.equal(compound.apellidoMaterno, "HERNÁNDEZ");
assert.equal(compound.requiresReview, true);
assert.equal(suggestPatientNameParts("JOSÉ LUIS PÉREZ").apellidoMaterno, "");
assert.equal(suggestPatientNameParts("ANA").requiresReview, true);
assert.equal(suggestPatientNameParts("Sr. ANA-MARÍA PÉREZ LÓPEZ").nombres, "ANA-MARÍA");
assert.equal(buildFullPatientName({ nombres: "FILEMON CECILIO", apellidoPaterno: "ARTEAGA", apellidoMaterno: "BALTAZAR" }), "FILEMON CECILIO ARTEAGA BALTAZAR");

const separated = parsePatientFields([
  {
    type: "table",
    rows: [["Apellido paterno", "ARTEAGA", "Apellido materno", "BALTAZAR", "Nombre", "FILEMON CECILIO"]],
    source: { blockIndex: 3, tableIndex: 1, origin: "body" }
  }
], "separado");
assert.equal(separated.fields.nombre.value, "FILEMON CECILIO ARTEAGA BALTAZAR");
assert.equal(separated.fields.nombre.nameSplit.nombreSource, "explicit-separated-fields");

const type = sugerirTipoNota({ textoPlano: `NOTA DE INGRESO AL SERVICIO DE OBSERVACIÓN\n${headerText}`, secciones: { objetivo: "x", examenMental: "x", tratamiento: "x" } });
assert.equal(type.key, "nota_ingreso");

const arellanoHeader = [
  "Nombre completo del paciente: ARELLANO FRANCO ANA LIZBETH Fecha de nacimiento: 02/03/1989 Edad: 37",
  "No. de expediente: 198 141 No. de cama: Cama: 02 Fecha: 31/07/2026 Hora: 21:00 hrs Sexo: MUJER Género: FEMENINO-CIS",
  "Servicio: OBSERVACIÓN Alergias: LÁTEX Días de estancia en el servicio de observación: PRIMERAS HORAS"
].join("\n");
const arellano = parsePatientFields([{ type: "paragraph", text: arellanoHeader, rawRuns: [], source: { blockIndex: 1 } }], "arellano");
const arellanoValues = fieldValues(arellano.fields);
assert.equal(arellanoValues.nombre, "ANA LIZBETH ARELLANO FRANCO");
assert.equal(arellanoValues.nombres, "ANA LIZBETH");
assert.equal(arellanoValues.apellidoPaterno, "ARELLANO");
assert.equal(arellanoValues.apellidoMaterno, "FRANCO");
assert.equal(arellano.fields.nombre.nameSplit.ruleApplied, "institutional-paternal-maternal-given");
assert.equal(arellanoValues.fechaNacimiento, "02/03/1989");
assert.equal(arellanoValues.edad, "37");
assert.equal(arellanoValues.expediente, "198 141");
assert.equal(arellanoValues.cama, "02");
assert.equal(arellanoValues.fecha, "31/07/2026");
assert.equal(arellanoValues.hora, "21:00");
assert.equal(arellanoValues.sexo, "MUJER");
assert.equal(arellanoValues.genero, "FEMENINO-CIS");
assert.equal(arellanoValues.servicio, "OBSERVACIÓN");
assert.equal(arellanoValues.alergias, "LÁTEX");
assert.equal(arellano.fields.alergias.conflict, false);

const fechaTruncada = parsePatientFields([{ type: "paragraph", text: "Fecha de nacimiento: 02/03/198 Edad: 37", source: { blockIndex: 0 } }], "fecha-truncada");
assert.equal(fieldValues(fechaTruncada.fields).fechaNacimiento, "");

const ismeraiHeader = "Nombre del paciente: Ismerai Hernandez García\u00a0\u00a0 Fecha de nacimiento: 08/04/1999\u00a0\u00a0 Edad: 27 AÑOS\u00a0\u00a0 Cama: 8\u00a0\u00a0 Expediente: 197805\u00a0\u00a0 Sexo: Mujer Género: femenino-cis\u00a0\u00a0 Servicio: Observación\u00a0\u00a0 Alergias: Negado\u00a0\u00a0 Fecha: 30/06/2026\u00a0\u00a0 Hora: 17:26 H\u00a0\u00a0 Días estancia: 5";
const ismerai = parsePatientFields([{ type: "paragraph", text: ismeraiHeader, source: { blockIndex: 1 } }], "ismerai");
const ismeraiValues = fieldValues(ismerai.fields);
assert.equal(ismeraiValues.nombre, "Ismerai Hernandez García");
assert.equal(ismeraiValues.nombres, "Ismerai");
assert.equal(ismeraiValues.apellidoPaterno, "Hernandez");
assert.equal(ismeraiValues.apellidoMaterno, "García");
assert.equal(ismeraiValues.fechaNacimiento, "08/04/1999");
assert.equal(ismeraiValues.expediente, "197805");
assert.equal(ismeraiValues.hora, "17:26");
const ismeraiIdentity = resolvePatientIdentity(ismerai.fields);
assert.equal(ismeraiIdentity.identityConfidence, "high");
assert.equal(ismeraiIdentity.identifiable, true);
assert.equal(ismeraiIdentity.normalizedName, "ISMERAI HERNANDEZ GARCIA");
const sameLineName = extractAdministrativeField({
  text: ismeraiHeader,
  aliases: ["nombre del paciente"],
  nextFieldAliases: ["fecha de nacimiento", "edad", "expediente"]
});
assert.equal(sameLineName.value, "Ismerai Hernandez García");

const aliasName = parsePatientFields([{ type: "paragraph", text: "Nombre del derechohabiente: Ana Pérez López Fecha de nacimiento: 01/01/2000", source: { blockIndex: 0 } }], "alias-name");
assert.equal(fieldValues(aliasName.fields).nombre, "Ana Pérez López");

console.log("patient-transfer-field-parser.identity.test.mjs OK");

console.log("patient-transfer-field-parser.test.mjs OK");
