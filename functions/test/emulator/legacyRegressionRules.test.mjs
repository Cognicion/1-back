import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc
} from "firebase/firestore";

import { createRulesTestEnvironment } from "./environment.mjs";

const UID_ADMIN = "uidRegressionAdmin";
const UID_MEDICO = "uidRegressionMedico";
const UID_NURSE = "uidRegressionNurse";
const UID_PATIENT = "uidRegressionPatient";
const UID_OTHER_PATIENT = "uidRegressionOtherPatient";

let environment;
let anonymousDb;

function authenticatedDb(uid) {
  return environment.authenticatedContext(uid).firestore();
}

async function seedProfiles() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "usuarios", UID_ADMIN), { rol: "admin", tieneCuenta: true }),
      setDoc(doc(db, "usuarios", UID_MEDICO), { rol: "medico", tieneCuenta: true }),
      setDoc(doc(db, "usuarios", UID_NURSE), { rol: "enfermeria_salud_mental", tieneCuenta: true }),
      setDoc(doc(db, "usuarios", UID_PATIENT), {
        creadoPor: UID_MEDICO,
        medicoUid: UID_MEDICO,
        nombre: "Paciente de prueba",
        ownerUid: UID_MEDICO,
        rol: "paciente",
        tieneCuenta: true
      }),
      setDoc(doc(db, "usuarios", UID_OTHER_PATIENT), { rol: "paciente", tieneCuenta: true })
    ]);
  });
}

before(async () => {
  environment = await createRulesTestEnvironment();
  anonymousDb = environment.unauthenticatedContext().firestore();
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.clearStorage();
  await seedProfiles();
});

after(async () => {
  await environment?.cleanup();
});

test("login y perfiles siguen siendo legibles por sesión autenticada, nunca por anónimo", async () => {
  const patientDb = authenticatedDb(UID_PATIENT);
  const profile = await assertSucceeds(getDoc(doc(patientDb, "usuarios", UID_PATIENT)));
  assert.equal(profile.data().rol, "paciente");
  await assertFails(getDoc(doc(anonymousDb, "usuarios", UID_PATIENT)));
});

test("expediente, notas, tratamientos, permisos, agenda e historia conservan CRUD autenticado heredado", async () => {
  const medicoDb = authenticatedDb(UID_MEDICO);
  const paths = [
    `usuarios/${UID_PATIENT}/notasMedicas/noteRegression`,
    `usuarios/${UID_PATIENT}/tratamientos/treatmentRegression`,
    `usuarios/${UID_PATIENT}/permisosMedicos/${UID_MEDICO}`,
    `usuarios/${UID_MEDICO}/agenda/eventRegression`,
    `usuarios/${UID_PATIENT}/historiaClinica/historiaInicial`
  ];

  for (const path of paths) {
    const reference = doc(medicoDb, path);
    await assertSucceeds(setDoc(reference, { estadoPrueba: "creado" }));
    assert.equal((await assertSucceeds(getDoc(reference))).data().estadoPrueba, "creado");
    await assertSucceeds(updateDoc(reference, { estadoPrueba: "actualizado" }));
    await assertSucceeds(deleteDoc(reference));
  }

  for (const path of paths) {
    await assertFails(getDoc(doc(anonymousDb, path)));
    await assertFails(setDoc(doc(anonymousDb, path), { estadoPrueba: "intrusión" }));
  }
});

test("diagnósticos del perfil y el árbol pacientes siguen disponibles a personal clínico y al propietario", async () => {
  const medicoDb = authenticatedDb(UID_MEDICO);
  const nurseDb = authenticatedDb(UID_NURSE);
  const patientDb = authenticatedDb(UID_PATIENT);
  const otherPatientDb = authenticatedDb(UID_OTHER_PATIENT);
  const profileRef = doc(medicoDb, "usuarios", UID_PATIENT);

  await assertSucceeds(updateDoc(profileRef, {
    diagnosticos: [{ codigo: "TEST", sistema: "fixture" }]
  }));
  assert.equal((await assertSucceeds(getDoc(profileRef))).data().diagnosticos.length, 1);

  const clinicalTreePath = `pacientes/${UID_PATIENT}/eventosDetectados/eventRegression`;
  await assertSucceeds(setDoc(doc(nurseDb, clinicalTreePath), { estado: "pendiente" }));
  await assertSucceeds(updateDoc(doc(patientDb, clinicalTreePath), { estado: "revisado" }));
  await assertFails(getDoc(doc(otherPatientDb, clinicalTreePath)));
  await assertFails(getDoc(doc(anonymousDb, clinicalTreePath)));
});

test("auditoría conserva create autenticado, read admin y bloqueo de alteración", async () => {
  const patientDb = authenticatedDb(UID_PATIENT);
  const adminDb = authenticatedDb(UID_ADMIN);
  const eventPath = "auditoria/eventRegression";

  await assertSucceeds(setDoc(doc(patientDb, eventPath), {
    accion: "regression_probe",
    actorUid: UID_PATIENT
  }));
  assert.equal((await assertSucceeds(getDoc(doc(adminDb, eventPath)))).data().accion, "regression_probe");
  await assertFails(getDoc(doc(patientDb, eventPath)));
  await assertFails(updateDoc(doc(adminDb, eventPath), { accion: "alterado" }));
  await assertFails(deleteDoc(doc(adminDb, eventPath)));
  await assertFails(setDoc(doc(anonymousDb, "auditoria", "anonymousRegression"), { accion: "intrusión" }));
});

