import assert from "node:assert/strict";
import {
  findPossiblePatientMatches,
  normalizeBirthDate,
  normalizePatientName,
  normalizeRecordNumber
} from "../js/modules/patient-transfer/parsing/patientDuplicateMatcher.js";

const candidate = {
  nombre: "Ismerai Hernández García",
  nombres: "Ismerai",
  apellidoPaterno: "Hernandez",
  apellidoMaterno: "García",
  expediente: "197-805",
  fechaNacimiento: "08/04/1999",
  edad: "27",
  sexo: "Mujer",
  institucion: "Hospital General",
  servicio: "Observación",
  cama: "8"
};

assert.equal(normalizePatientName("Ismerai Hernández García"), "ISMERAI HERNANDEZ GARCIA");
assert.equal(normalizeRecordNumber("197 805"), "197805");
assert.equal(normalizeBirthDate("08/04/1999"), "1999-04-08");

const [strong] = findPossiblePatientMatches(candidate, [{
  id: "patient-existing-1",
  name: "ISMERAI HERNANDEZ GARCIA",
  nombreCompleto: "Ismerai Hernandez García",
  expediente: "197805",
  fechaNacimiento: "1999-04-08",
  edad: 27,
  sexo: "Mujer",
  institucion: "Hospital General",
  servicio: "Observación",
  cama: "8"
}]);
assert.equal(strong.level, "muy_alta");
assert.ok(strong.score >= 180);
assert.ok(strong.matchedFields.some((field) => field.label === "Expediente"));
assert.ok(strong.matchedFields.some((field) => field.label === "Fecha de nacimiento"));

const [conflict] = findPossiblePatientMatches({ nombre: "Ismerai Hernandez García", fechaNacimiento: "09/04/1999" }, [{
  id: "patient-existing-2",
  nombreCompleto: "Ismerai Hernandez García",
  fechaNacimiento: "08/04/1999"
}]);
assert.equal(conflict.level, "baja");
assert.ok(conflict.conflictingFields.some((field) => field.label === "Fecha de nacimiento"));

const weak = findPossiblePatientMatches({ edad: "27" }, [{ id: "patient-existing-3", edad: 27 }]);
assert.equal(weak[0].level, "baja");

console.log("patient-transfer-duplicate-matcher: ok");
