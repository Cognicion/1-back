import assert from "node:assert/strict";
import { parsePatientFields, fieldValues, extractLabeledFieldsFromText, extractAdministrativeField, normalizeInstitution } from "../js/modules/patient-transfer/parsing/patientFieldParser.js";
import { resolvePatientIdentity } from "../js/modules/patient-transfer/parsing/patientIdentityResolver.js";
import {
  buildFullPatientName,
  inferStructuredPatientNameFormat,
  PATIENT_NAME_SOURCE_FORMATS,
  splitPatientNameAndAlias,
  suggestPatientNameParts
} from "../js/modules/patient-transfer/parsing/patientNameParser.js";
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
assert.equal(candidates.find((item) => item.fieldKey === "expediente")?.normalizedValue, "198150");
assert.equal(candidates.find((item) => item.fieldKey === "expediente")?.rawValue, "198 150");
assert.equal(candidates.find((item) => item.fieldKey === "cama")?.normalizedValue, "01");
assert.equal(candidates.find((item) => item.fieldKey === "fecha")?.normalizedValue, "02/08/2026");
assert.equal(candidates.find((item) => item.fieldKey === "hora")?.normalizedValue, "20:50");
assert.equal(candidates.find((item) => item.fieldKey === "sexo")?.normalizedValue, "Hombre");
assert.equal(candidates.find((item) => item.fieldKey === "genero")?.normalizedValue, "Masculino-cis");
assert.equal(candidates.find((item) => item.fieldKey === "servicio")?.normalizedValue, "Observación");
assert.equal(candidates.find((item) => item.fieldKey === "alergias")?.normalizedValue, "NEGADAS");

assert.equal(normalizeInstitution("HPFBA"), "Hospital Psiquiátrico Fray Bernardino Álvarez");
assert.equal(normalizeInstitution("H.P.F.B.A."), "Hospital Psiquiátrico Fray Bernardino Álvarez");
assert.equal(normalizeInstitution("H P F B A"), "Hospital Psiquiátrico Fray Bernardino Álvarez");
assert.equal(normalizeInstitution("Hospital Fray Bernardino Álvarez"), "Hospital Psiquiátrico Fray Bernardino Álvarez");

const enedinaInstitution = parsePatientFields([{
  type: "paragraph",
  text: "HPFBA Nombre completo del paciente: ENEDINA PEÑA HERNÁNDEZ Servicio: OBSERVACIÓN Fecha: 07/08/2026",
  source: { blockIndex: 1, origin: "header" }
}, {
  type: "paragraph",
  text: "Diagnósticada previamente en IMSS Morelos",
  source: { blockIndex: 12, origin: "body" }
}], "enedina-institution");
const enedinaInstitutionValues = fieldValues(enedinaInstitution.fields);
assert.equal(enedinaInstitutionValues.institucion, "Hospital Psiquiátrico Fray Bernardino Álvarez");
assert.equal(enedinaInstitutionValues.servicio, "OBSERVACIÓN");
assert.equal(enedinaInstitution.fields.institucion.detectionMethod, "institution-header-alias");

const labelledInstitution = parsePatientFields([{
  type: "paragraph",
  text: "Institución: H.P.F.B.A. Servicio: OBSERVACIÓN",
  source: { blockIndex: 1, origin: "header" }
}], "labelled-institution");
assert.equal(fieldValues(labelledInstitution.fields).institucion, "Hospital Psiquiátrico Fray Bernardino Álvarez");
assert.equal(fieldValues(labelledInstitution.fields).servicio, "OBSERVACIÓN");

const enedinaHeader = "Nombre completo del paciente: ENEDINA PE\u00d1A HERN\u00c1NDEZ Fecha de nacimiento: 16/07/2006 Edad: 20 a\u00f1os";
const enedinaParsed = parsePatientFields([
  {
    type: "paragraph",
    text: enedinaHeader,
    rawRuns: [enedinaHeader],
    source: { blockIndex: 10, origin: "body" }
  }
], "enedina-prueba");
const enedinaValues = fieldValues(enedinaParsed.fields);
assert.equal(enedinaValues.nombre, "ENEDINA PE\u00d1A HERN\u00c1NDEZ");
assert.equal(enedinaValues.nombres, "ENEDINA");
assert.equal(enedinaValues.apellidoPaterno, "PE\u00d1A");
assert.equal(enedinaValues.apellidoMaterno, "HERN\u00c1NDEZ");

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
  expediente: "198150",
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

const structuredNamesFirstFallback = parsePatientFields([{
  type: "table",
  rows: [["Nombre completo del paciente: LUCIA BEATRIZ MONTERO SALAS Fecha de nacimiento: 25/05/2002 Edad: 24"]],
  source: { blockIndex: 2, tableIndex: 0, origin: "body" }
}], "structured-names-first-fallback");
const structuredNamesFirstValues = fieldValues(structuredNamesFirstFallback.fields);
assert.equal(structuredNamesFirstValues.nombre, "LUCIA BEATRIZ MONTERO SALAS");
assert.equal(structuredNamesFirstValues.nombres, "LUCIA BEATRIZ");
assert.equal(structuredNamesFirstValues.apellidoPaterno, "MONTERO");
assert.equal(structuredNamesFirstValues.apellidoMaterno, "SALAS");
assert.equal(structuredNamesFirstFallback.fields.nombre.nameSplit.sourceFormat, PATIENT_NAME_SOURCE_FORMATS.NAMES_FIRST);

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
assert.equal(separated.fields.nombre.nameSplit.sourceFormat, PATIENT_NAME_SOURCE_FORMATS.ALREADY_STRUCTURED);

const type = sugerirTipoNota({ textoPlano: `NOTA DE INGRESO AL SERVICIO DE OBSERVACIÓN\n${headerText}`, secciones: { objetivo: "x", examenMental: "x", tratamiento: "x" } });
assert.equal(type.key, "nota_ingreso");

const arellanoHeader = [
  "Nombre completo del paciente: ARELLANO FRANCO ANA LIZBETH Fecha de nacimiento: 02/03/1989 Edad: 37",
  "No. de expediente: 198 141 No. de cama: Cama: 02 Fecha: 31/07/2026 Hora: 21:00 hrs Sexo: MUJER Género: FEMENINO-CIS",
  "Servicio: OBSERVACIÓN Alergias: LÁTEX Días de estancia en el servicio de observación: PRIMERAS HORAS"
].join("\n");
const arellano = parsePatientFields([{ type: "paragraph", text: arellanoHeader, rawRuns: [], source: { blockIndex: 1 } }], "arellano");
const arellanoValues = fieldValues(arellano.fields);
assert.equal(arellanoValues.nombre, "ARELLANO FRANCO ANA LIZBETH");
assert.equal(arellanoValues.nombres, "ANA LIZBETH");
assert.equal(arellanoValues.apellidoPaterno, "ARELLANO");
assert.equal(arellanoValues.apellidoMaterno, "FRANCO");
assert.equal(arellano.fields.nombre.nameSplit.ruleApplied, "institutional-paternal-maternal-given");
assert.equal(arellano.fields.nombre.nameSplit.sourceFormat, PATIENT_NAME_SOURCE_FORMATS.HOSPITAL_SURNAMES_FIRST);
assert.equal(arellanoValues.fechaNacimiento, "02/03/1989");
assert.equal(arellanoValues.edad, "37");
assert.equal(arellanoValues.expediente, "198141");
assert.equal(arellanoValues.cama, "02");
assert.equal(arellanoValues.fecha, "31/07/2026");
assert.equal(arellanoValues.hora, "21:00");
assert.equal(arellanoValues.sexo, "MUJER");
assert.equal(arellanoValues.genero, "FEMENINO-CIS");
assert.equal(arellanoValues.servicio, "OBSERVACIÓN");
assert.equal(arellanoValues.alergias, "LÁTEX");
assert.equal(arellano.fields.alergias.conflict, false);

const brianHospital = parsePatientFields([{
  type: "paragraph",
  text: "Nombre completo del paciente: CEGUEDA VALDEZ BRIAN EFRAIN Fecha de nacimiento: 28/06/2001 Edad: 25 AÑOS",
  source: { blockIndex: 1, origin: "body" }
}], "brian-hospital");
const brianHospitalValues = fieldValues(brianHospital.fields);
assert.equal(brianHospitalValues.nombre, "CEGUEDA VALDEZ BRIAN EFRAIN");
assert.equal(brianHospitalValues.nombres, "BRIAN EFRAIN");
assert.equal(brianHospitalValues.apellidoPaterno, "CEGUEDA");
assert.equal(brianHospitalValues.apellidoMaterno, "VALDEZ");
assert.equal(brianHospitalValues.edad, "25");
assert.equal(brianHospitalValues.fechaNacimiento, "28/06/2001");
assert.equal(brianHospital.fields.nombre.nameSplit.sourceFormat, PATIENT_NAME_SOURCE_FORMATS.HOSPITAL_SURNAMES_FIRST);

const brianNamesFirst = parsePatientFields([{
  type: "paragraph",
  text: "Nombre del paciente: BRIAN EFRAIN CEGUEDA VALDEZ Fecha de nacimiento: 28/06/2001 Edad: 25 AÑOS",
  source: { blockIndex: 1, origin: "body" }
}], "brian-names-first");
const brianNamesFirstValues = fieldValues(brianNamesFirst.fields);
assert.equal(brianNamesFirstValues.nombre, "BRIAN EFRAIN CEGUEDA VALDEZ");
assert.equal(brianNamesFirstValues.nombres, "BRIAN EFRAIN");
assert.equal(brianNamesFirstValues.apellidoPaterno, "CEGUEDA");
assert.equal(brianNamesFirstValues.apellidoMaterno, "VALDEZ");
assert.equal(brianNamesFirst.fields.nombre.nameSplit.sourceFormat, PATIENT_NAME_SOURCE_FORMATS.NAMES_FIRST);

const threeTokenHospital = parsePatientFields([{
  type: "paragraph",
  text: "Nombre completo del paciente: PEREZ LOPEZ JUAN Edad: 40",
  source: { blockIndex: 1, origin: "body" }
}], "three-token-hospital");
assert.equal(fieldValues(threeTokenHospital.fields).nombres, "JUAN");
assert.equal(fieldValues(threeTokenHospital.fields).apellidoPaterno, "PEREZ");
assert.equal(fieldValues(threeTokenHospital.fields).apellidoMaterno, "LOPEZ");

const compoundHospital = parsePatientFields([{
  type: "paragraph",
  text: "Nombre completo del paciente: DE LA CRUZ PEREZ JUAN CARLOS Edad: 30",
  source: { blockIndex: 1, origin: "body" }
}], "compound-hospital");
assert.equal(fieldValues(compoundHospital.fields).nombre, "DE LA CRUZ PEREZ JUAN CARLOS");
assert.equal(fieldValues(compoundHospital.fields).nombres, "JUAN CARLOS");
assert.equal(fieldValues(compoundHospital.fields).apellidoPaterno, "DE LA CRUZ");
assert.equal(fieldValues(compoundHospital.fields).apellidoMaterno, "PEREZ");

const commaHospital = parsePatientFields([{
  type: "paragraph",
  text: "Nombre completo del paciente: CEGUEDA VALDEZ, BRIAN EFRAIN Edad: 25",
  source: { blockIndex: 1, origin: "body" }
}], "comma-hospital");
assert.equal(fieldValues(commaHospital.fields).nombre, "CEGUEDA VALDEZ, BRIAN EFRAIN");
assert.equal(fieldValues(commaHospital.fields).nombres, "BRIAN EFRAIN");
assert.equal(fieldValues(commaHospital.fields).apellidoPaterno, "CEGUEDA");
assert.equal(fieldValues(commaHospital.fields).apellidoMaterno, "VALDEZ");

const ambiguousName = parsePatientFields([{
  type: "paragraph",
  text: "Nombre completo del paciente: ALFA BETA GAMMA DELTA Edad: 30",
  source: { blockIndex: 1, origin: "body" }
}], "ambiguous-name");
const ambiguousValues = fieldValues(ambiguousName.fields);
assert.equal(ambiguousValues.nombre, "ALFA BETA GAMMA DELTA");
assert.equal(ambiguousValues.nombres, "ALFA BETA");
assert.equal(ambiguousValues.apellidoPaterno, "GAMMA");
assert.equal(ambiguousValues.apellidoMaterno, "DELTA");
assert.equal(ambiguousName.fields.nombre.nameSplit.ruleApplied, "last-two-surnames");
assert.equal(ambiguousName.fields.nombre.nameSplit.sourceFormat, PATIENT_NAME_SOURCE_FORMATS.NAMES_FIRST);
assert.equal(ambiguousName.fields.nombre.nameSplit.requiresReview, true);

const ambiguousFreeText = suggestPatientNameParts("ALFA BETA GAMMA DELTA", {
  sourceFormat: PATIENT_NAME_SOURCE_FORMATS.UNKNOWN,
  preserveAmbiguous: true
});
assert.equal(ambiguousFreeText.nombres, "ALFA BETA GAMMA DELTA");
assert.equal(ambiguousFreeText.apellidoPaterno, "");
assert.equal(ambiguousFreeText.apellidoMaterno, "");
assert.equal(ambiguousFreeText.ruleApplied, "ambiguous-source-order");

assert.equal(inferStructuredPatientNameFormat("CEGUEDA VALDEZ BRIAN EFRAIN", {
  detectionMethod: "paragraph-multi-label"
}), PATIENT_NAME_SOURCE_FORMATS.HOSPITAL_SURNAMES_FIRST);
assert.equal(inferStructuredPatientNameFormat("BRIAN EFRAIN CEGUEDA VALDEZ", {
  detectionMethod: "paragraph-multi-label"
}), PATIENT_NAME_SOURCE_FORMATS.NAMES_FIRST);
assert.equal(inferStructuredPatientNameFormat("LUCIA BEATRIZ MONTERO SALAS", {
  detectionMethod: "table-multi-label",
  sourceLabel: "nombre completo del paciente"
}), PATIENT_NAME_SOURCE_FORMATS.NAMES_FIRST);
assert.equal(inferStructuredPatientNameFormat("CEGUEDA VALDEZ BRIAN EFRAIN"), PATIENT_NAME_SOURCE_FORMATS.UNKNOWN);

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
assert.equal(ismerai.fields.expediente.expedienteOriginal, "197805");
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

const optionalAlias = parsePatientFields([
  {
    type: "paragraph",
    text: "Nombre completo del paciente: CARMEN ELENA RIVERA SOTO Fecha de nacimiento: 01/01/2000",
    source: { blockIndex: 1, origin: "body" }
  },
  {
    type: "paragraph",
    text: "Nombre completo del paciente: (MATEO) CARMEN ELENA RIVERA SOTO Fecha: 02/01/2026",
    source: { blockIndex: 30, origin: "body" }
  },
  {
    type: "paragraph",
    text: "Nombre completo del paciente: CARMEN ELENA RIVERA SOTO (MATEO) Fecha: 03/01/2026",
    source: { blockIndex: 60, origin: "body" }
  }
], "optional-patient-alias");
const optionalAliasValues = fieldValues(optionalAlias.fields);
assert.equal(optionalAliasValues.nombre, "CARMEN ELENA RIVERA SOTO");
assert.equal(optionalAliasValues.nombres, "CARMEN ELENA");
assert.equal(optionalAliasValues.apellidoPaterno, "RIVERA");
assert.equal(optionalAliasValues.apellidoMaterno, "SOTO");
assert.equal(optionalAliasValues.alias, "MATEO");
assert.equal(optionalAlias.fields.alias.detectionMethod, "structured-name-parenthetical-alias");
assert.equal(optionalAlias.conflicts.some((conflict) => conflict.key === "nombre"), false);

const explicitSocialName = parsePatientFields([{
  type: "paragraph",
  text: "Nombre completo del paciente: CARMEN ELENA RIVERA SOTO Nombre social: MATEO Fecha de nacimiento: 01/01/2000",
  source: { blockIndex: 1, origin: "body" }
}], "explicit-social-name");
assert.equal(fieldValues(explicitSocialName.fields).alias, "MATEO");
assert.deepEqual(splitPatientNameAndAlias("CARMEN (DE SOLTERA) RIVERA"), {
  legalName: "CARMEN (DE SOLTERA) RIVERA",
  alias: "",
  detected: false
});

console.log("patient-transfer-field-parser.identity.test.mjs OK");

console.log("patient-transfer-field-parser.test.mjs OK");
