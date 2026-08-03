import assert from "node:assert/strict";
import { parsePatientFields, fieldValues, extractLabeledFieldsFromText } from "../js/modules/patient-transfer/parsing/patientFieldParser.js";
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

assert.deepEqual(fieldValues(parsed.fields), {
  nombre: "FILEMON CECILIO ARTEAGA BALTAZAR",
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

const type = sugerirTipoNota({ textoPlano: `NOTA DE INGRESO AL SERVICIO DE OBSERVACIÓN\n${headerText}`, secciones: { objetivo: "x", examenMental: "x", tratamiento: "x" } });
assert.equal(type.key, "nota_ingreso");

console.log("patient-transfer-field-parser.test.mjs OK");
