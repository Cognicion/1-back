import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import admin from "firebase-admin";
import {
  EmailAuthProvider,
  linkWithCredential,
  signOut
} from "firebase/auth";
import {
  doc,
  getDoc,
  terminate
} from "firebase/firestore";

import {
  createFlowClient,
  createRulesTestEnvironment,
  expectFirebaseError,
  PROJECT_ID,
  uniqueRequestId
} from "./environment.mjs";

const clients = new Set();
let environment;
let adminApp;

async function emailClient(label) {
  const client = await createFlowClient(`free-patient-limit-${label}`);
  clients.add(client);
  const localPart = uniqueRequestId(label).toLowerCase().replace(/[^a-z0-9-]/gu, "");
  const email = `${localPart}@example.test`;
  await linkWithCredential(
    client.auth.currentUser,
    EmailAuthProvider.credential(email, "emulator-password-123")
  );
  await admin.auth(adminApp).updateUser(client.auth.currentUser.uid, { emailVerified: true });
  await client.auth.currentUser.reload();
  await client.auth.currentUser.getIdToken(true);
  return { ...client, email, uid: client.auth.currentUser.uid };
}

async function registerFreeProfessional(client, role = "medico") {
  return client.call("registerProfessional", {
    aceptaAviso: true,
    aceptaBeta: true,
    modalidadRegistro: "gratuita",
    nombre: "Profesional de prueba",
    rol: role
  });
}

function provisionalPatient(index) {
  return {
    operationId: `emulator_patient_limit_${index}`,
    paciente: {
      nombre: `Paciente de prueba ${index}`,
      observaciones: ""
    }
  };
}

before(async () => {
  environment = await createRulesTestEnvironment();
  adminApp = admin.initializeApp({ projectId: PROJECT_ID }, `free-patient-limit-${process.pid}`);
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.clearStorage();
});

after(async () => {
  await Promise.allSettled([...clients].map(async (client) => {
    await signOut(client.auth).catch(() => undefined);
    await terminate(client.firestore).catch(() => undefined);
    await client.destroy();
  }));
  await adminApp?.delete();
  await environment?.cleanup();
});

async function assertAuthMissing(uid) {
  await assert.rejects(
    admin.auth(adminApp).getUser(uid),
    (error) => String(error?.code || "") === "auth/user-not-found"
  );
}

test("la callable permite cinco pacientes a la cuenta gratuita y rechaza el sexto", {
  timeout: 60000
}, async () => {
  const professional = await emailClient("five");
  await registerFreeProfessional(professional);

  const ids = [];
  for (let index = 1; index <= 5; index += 1) {
    const result = await professional.call("createProvisionalPatient", provisionalPatient(index));
    ids.push(result.id);
    assert.equal(result.quota.current, index);
    assert.equal(result.quota.limit, 5);
  }
  assert.equal(new Set(ids).size, 5);

  await expectFirebaseError(
    professional.call("createProvisionalPatient", provisionalPatient(6)),
    "resource-exhausted"
  );
  const profile = (await getDoc(doc(professional.firestore, "usuarios", professional.uid))).data();
  assert.equal(profile.pacientesEnCuenta, 5);
});

test("dos altas concurrentes por el quinto cupo confirman exactamente una", {
  timeout: 60000
}, async () => {
  const professional = await emailClient("race");
  await registerFreeProfessional(professional, "psicologo");
  for (let index = 1; index <= 4; index += 1) {
    await professional.call("createProvisionalPatient", provisionalPatient(index));
  }

  const settled = await Promise.allSettled([
    professional.call("createProvisionalPatient", provisionalPatient("5A")),
    professional.call("createProvisionalPatient", provisionalPatient("5B"))
  ]);
  assert.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(settled.filter((item) => item.status === "rejected").length, 1);
  const rejected = settled.find((item) => item.status === "rejected");
  assert.match(String(rejected.reason?.code || ""), /resource-exhausted/u);

  const profile = (await getDoc(doc(professional.firestore, "usuarios", professional.uid))).data();
  assert.equal(profile.pacientesEnCuenta, 5);
});

test("el registro de paciente por correo conserva su rol y permisos y ocupa un cupo del médico", {
  timeout: 60000
}, async () => {
  const doctor = await emailClient("doctor");
  await registerFreeProfessional(doctor, "medico");
  const patient = await emailClient("patient");

  const result = await patient.call("registerPatientProfile", {
    aceptaAviso: true,
    aceptaBeta: true,
    correoMedico: doctor.email,
    nombre: "Paciente con cuenta de prueba",
    usaCodigoVinculacion: false
  });
  assert.equal(result.medicoUid, doctor.uid);
  assert.deepEqual(result.quota, { current: 1, limit: 5 });

  const patientProfile = (await getDoc(doc(patient.firestore, "usuarios", patient.uid))).data();
  assert.equal(patientProfile.rol, "paciente");
  assert.equal(patientProfile.tieneCuenta, true);
  assert.equal(patientProfile.medicoTratanteUid, doctor.uid);
  const permission = (await getDoc(doc(
    patient.firestore,
    "usuarios",
    patient.uid,
    "permisosMedicos",
    doctor.uid
  ))).data();
  assert.deepEqual({
    administrarPermisos: permission.administrarPermisos,
    agregarNotas: permission.agregarNotas,
    editarPaciente: permission.editarPaciente,
    lectura: permission.lectura,
    rolPermiso: permission.rolPermiso
  }, {
    administrarPermisos: true,
    agregarNotas: true,
    editarPaciente: true,
    lectura: true,
    rolPermiso: "tratante"
  });

  const doctorProfile = (await getDoc(doc(doctor.firestore, "usuarios", doctor.uid))).data();
  assert.equal(doctorProfile.pacientesEnCuenta, 1);
});

test("un perfil Firestore que suplanta el correo no recibe el paciente resuelto por Auth", {
  timeout: 60000
}, async () => {
  const doctor = await emailClient("canonical-doctor");
  await registerFreeProfessional(doctor, "medico");
  const patient = await emailClient("canonical-patient");
  const impersonatorUid = "00000000000000000000EmailSpoofer";
  const adminDb = admin.firestore(adminApp);
  await adminDb.doc(`usuarios/${impersonatorUid}`).set({
    email: doctor.email,
    limitePacientes: 5,
    modalidadRegistroProfesional: "gratuita",
    nombre: "Perfil que suplanta correo",
    pacientesEnCuenta: 0,
    planCuentaProfesional: "profesional_gratuito",
    rol: "medico",
    tieneCuenta: true
  });

  const result = await patient.call("registerPatientProfile", {
    aceptaAviso: true,
    aceptaBeta: true,
    correoMedico: doctor.email,
    medicoUid: impersonatorUid,
    nombre: "Paciente con identidad canónica",
    usaCodigoVinculacion: false
  });

  assert.equal(result.medicoUid, doctor.uid);
  const [doctorProfile, impersonatorProfile, doctorAssignment, impersonatorAssignment,
    doctorPermission, impersonatorPermission] = await Promise.all([
    adminDb.doc(`usuarios/${doctor.uid}`).get(),
    adminDb.doc(`usuarios/${impersonatorUid}`).get(),
    adminDb.doc(`usuarios/${doctor.uid}/patientQuotaAssignments/${patient.uid}`).get(),
    adminDb.doc(`usuarios/${impersonatorUid}/patientQuotaAssignments/${patient.uid}`).get(),
    adminDb.doc(`usuarios/${patient.uid}/permisosMedicos/${doctor.uid}`).get(),
    adminDb.doc(`usuarios/${patient.uid}/permisosMedicos/${impersonatorUid}`).get()
  ]);
  assert.equal(doctorProfile.data()?.pacientesEnCuenta, 1);
  assert.equal(impersonatorProfile.data()?.pacientesEnCuenta, 0);
  assert.equal(doctorAssignment.exists, true);
  assert.equal(impersonatorAssignment.exists, false);
  assert.equal(doctorPermission.exists, true);
  assert.equal(impersonatorPermission.exists, false);
});

test("un registro rechazado puede descartar Auth sólo mientras no exista perfil", {
  timeout: 60000
}, async () => {
  const patient = await emailClient("orphan-cleanup");
  await expectFirebaseError(
    patient.call("registerPatientProfile", {
      aceptaAviso: true,
      aceptaBeta: true,
      correoMedico: "medico-inexistente@example.test",
      nombre: "Paciente sin médico válido",
      usaCodigoVinculacion: false
    }),
    "not-found"
  );

  assert.equal((await getDoc(doc(patient.firestore, "usuarios", patient.uid))).exists(), false);
  assert.deepEqual(await patient.call("discardUnregisteredAccount"), { discarded: true });
  await assertAuthMissing(patient.uid);
  await environment.withSecurityRulesDisabled(async (context) => {
    const tombstone = await getDoc(doc(context.firestore(), "accountDeletionTombstones", patient.uid));
    assert.equal(tombstone.data()?.deletionState, "completed");
    assert.equal(tombstone.data()?.accountType, "registro_incompleto");
  });
});
