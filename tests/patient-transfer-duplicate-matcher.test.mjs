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
assert.equal(normalizeRecordNumber("198 141"), "198141");
assert.equal(normalizeRecordNumber("198-141"), "198141");
assert.equal(normalizeRecordNumber("198.141"), "198141");
assert.equal(normalizeBirthDate("08/04/1999"), "1999-04-08");

const [strong] = findPossiblePatientMatches(candidate, [{
  id: "patient-existing-1",
  name: "ISMERAI HERNANDEZ GARCIA",
  nombreCompleto: "Ismerai Hernández García",
  nombres: "Ismerai",
  apellidoPaterno: "Hernandez",
  apellidoMaterno: "García",
  expediente: "197805",
  fechaNacimiento: "1999-04-08",
  edad: 27,
  sexo: "Mujer",
  institucion: "Hospital General",
  servicio: "Observación",
  cama: "8"
}]);
assert.equal(strong.level, "muy_alta");
assert.equal(strong.duplicateEligible, true);
assert.ok(strong.qualifyingMatchesCount >= 3);
assert.ok(strong.matchedFields.some((field) => field.label === "Expediente"));
assert.ok(strong.matchedFields.some((field) => field.label === "Fecha de nacimiento"));
assert.equal(strong.showAlert, true);
assert.equal(buildPatientMatchExplanation(strong).title, "Posible paciente coincidente");

const nestedExistingPatient = findPossiblePatientMatches({
  nombre: "Persona Prueba Rivera Soto",
  nombres: "Persona Prueba",
  apellidoPaterno: "Rivera",
  apellidoMaterno: "Soto",
  expediente: "135-790",
  fechaNacimiento: "12/03/1998"
}, [{
  id: "patient-existing-nested",
  name: "Persona Prueba Rivera Soto",
  expediente: "135790",
  fechaNacimiento: "1998-03-12",
  patient: {
    datosInstitucionales: {
      nombres: "Persona Prueba",
      apellidoPaterno: "Rivera",
      apellidoMaterno: "Soto"
    }
  }
}]);
assert.equal(nestedExistingPatient.length, 1);
assert.equal(nestedExistingPatient[0].patientId, "patient-existing-nested");
assert.equal(nestedExistingPatient[0].duplicateEligible, true);
assert.ok(nestedExistingPatient[0].matchedFields.some((field) => field.label === "Apellido paterno"));
assert.ok(nestedExistingPatient[0].matchedFields.some((field) => field.label === "Expediente"));

const legacyFullNamePatient = findPossiblePatientMatches({
  nombre: "Paciente Ejemplo Luna Mora",
  nombres: "Paciente Ejemplo",
  apellidoPaterno: "Luna",
  apellidoMaterno: "Mora",
  fechaNacimiento: "21/06/2001"
}, [{
  id: "patient-existing-legacy-name",
  name: "Paciente Ejemplo Luna Mora",
  fechaNacimiento: "2001-06-21",
  patient: {
    nombrePaciente: "Paciente Ejemplo Luna Mora"
  }
}]);
assert.equal(legacyFullNamePatient.length, 1);
assert.equal(legacyFullNamePatient[0].duplicateEligible, true);
assert.ok(legacyFullNamePatient[0].qualifyingMatchesCount >= 3);

const nestedGenderOnly = findPossiblePatientMatches({ genero: "femenino" }, [{
  id: "patient-existing-nested-gender-only",
  patient: { datosInstitucionales: { genero: "femenino" } }
}]);
assert.deepEqual(nestedGenderOnly, []);

const conflict = findPossiblePatientMatches({
  nombre: "Ismerai Hernández García",
  apellidoPaterno: "Hernandez",
  fechaNacimiento: "09/04/1999"
}, [{
  id: "patient-existing-2",
  nombreCompleto: "Ismerai Hernández García",
  apellidoPaterno: "Hernandez",
  fechaNacimiento: "08/04/1999"
}]);
assert.deepEqual(conflict, []);

const weak = findPossiblePatientMatches({ edad: "27" }, [{ id: "patient-existing-3", edad: 27 }]);
assert.deepEqual(weak, []);

const genderOnly = findPossiblePatientMatches({ genero: "femenino" }, [{ id: "patient-existing-4", genero: "femenino" }]);
assert.deepEqual(genderOnly, []);

const sexOnly = findPossiblePatientMatches({ sexo: "mujer" }, [{ id: "patient-existing-4a", sexo: "mujer" }]);
assert.deepEqual(sexOnly, []);

const nameAndGenderOnly = findPossiblePatientMatches({ nombre: "Ana Lopez", genero: "femenino" }, [{
  id: "patient-existing-4b", nombreCompleto: "Ana Lopez", genero: "femenino"
}]);
assert.deepEqual(nameAndGenderOnly, []);

const nameAndSurnameOnly = findPossiblePatientMatches({ nombre: "Ana Lopez", apellidoPaterno: "Lopez" }, [{
  id: "patient-existing-4c", nombreCompleto: "Ana Lopez", apellidoPaterno: "Lopez"
}]);
assert.deepEqual(nameAndSurnameOnly, []);

const nameSurnameAndBirth = findPossiblePatientMatches({ nombre: "Ana Lopez", apellidoPaterno: "Lopez", fechaNacimiento: "01/01/2000" }, [{
  id: "patient-existing-4d", nombreCompleto: "Ana Lopez", apellidoPaterno: "Lopez", fechaNacimiento: "2000-01-01"
}]);
assert.equal(nameSurnameAndBirth.length, 1);
assert.equal(nameSurnameAndBirth[0].duplicateEligible, true);

const surnameWithoutName = findPossiblePatientMatches({ apellidoPaterno: "Lopez", apellidoMaterno: "Garcia", fechaNacimiento: "01/01/2000" }, [{
  id: "patient-existing-4e", apellidoPaterno: "Lopez", apellidoMaterno: "Garcia", fechaNacimiento: "2000-01-01"
}]);
assert.deepEqual(surnameWithoutName, []);

const visibleDifference = findPossiblePatientMatches({ nombre: "Ana López", apellidoPaterno: "López", fechaNacimiento: "01/01/2000" }, [{
  id: "patient-existing-5", nombre: "Ana López", apellidoPaterno: "López", fechaNacimiento: "2000-01-01", servicio: "Hospitalización"
}]);
assert.ok(visibleDifference[0].conflictingFields.some((field) => field.label === "Servicio") || visibleDifference[0].matchedFields.length > 0);

const differentlyFormattedRecord = findPossiblePatientMatches({
  nombre: "Ana López", apellidoPaterno: "López", expediente: "198 141"
}, [{ id: "patient-existing-6", nombre: "Ana López", apellidoPaterno: "López", expediente: "198-141" }]);
assert.equal(differentlyFormattedRecord.length, 1);
assert.equal(differentlyFormattedRecord[0].duplicateEligible, true);

console.log("patient-transfer-duplicate-matcher: ok");
