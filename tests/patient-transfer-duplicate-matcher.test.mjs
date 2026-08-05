import assert from "node:assert/strict";
import {
  findPossiblePatientMatches,
  buildPatientMatchExplanation,
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
assert.equal(strong.showAlert, true);
assert.equal(buildPatientMatchExplanation(strong).title, "Posible paciente coincidente");

const [conflict] = findPossiblePatientMatches({ nombre: "Ismerai Hernandez García", fechaNacimiento: "09/04/1999" }, [{
  id: "patient-existing-2",
  nombreCompleto: "Ismerai Hernandez García",
  fechaNacimiento: "08/04/1999"
}]);
assert.equal(conflict.level, "media");
assert.ok(conflict.conflictingFields.some((field) => field.label === "Fecha de nacimiento"));

const weak = findPossiblePatientMatches({ edad: "27" }, [{ id: "patient-existing-3", edad: 27 }]);
assert.equal(weak[0].level, "baja");
assert.equal(weak[0].showAlert, false);

const genderOnly = findPossiblePatientMatches({ genero: "femenino" }, [{ id: "patient-existing-4", genero: "femenino" }]);
assert.equal(genderOnly[0].level, "baja");
assert.equal(genderOnly[0].showAlert, false);

const visibleDifference = findPossiblePatientMatches({ nombre: "Ana López", servicio: "Observación" }, [{
  id: "patient-existing-5", nombre: "Ana López", servicio: "Hospitalización"
}]);
assert.ok(visibleDifference[0].conflictingFields.some((field) => field.label === "Servicio"));

console.log("patient-transfer-duplicate-matcher: ok");
