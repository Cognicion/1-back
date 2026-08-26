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
  setDoc,
  terminate
} from "firebase/firestore";
import {
  ref,
  uploadBytes
} from "firebase/storage";

import {
  createFlowClient,
  createRulesTestEnvironment,
  expectFirebaseError,
  pollUntil,
  PROJECT_ID,
  STORAGE_BUCKET,
  uniqueRequestId
} from "./environment.mjs";

const clients = new Set();
const profilePhotoBytes = new TextEncoder().encode("profile-photo-emulator");
let environment;
let adminApp;

async function flowClient(label, { email = false } = {}) {
  const client = await createFlowClient(`account-deletion-${label}`);
  clients.add(client);
  if (!email) return client;
  const localPart = uniqueRequestId(label).toLowerCase().replace(/[^a-z0-9-]/gu, "");
  const address = `${localPart}@example.test`;
  await linkWithCredential(
    client.auth.currentUser,
    EmailAuthProvider.credential(address, "emulator-password-123")
  );
  await admin.auth(adminApp).updateUser(client.auth.currentUser.uid, { emailVerified: true });
  await client.auth.currentUser.reload();
  await client.auth.currentUser.getIdToken(true);
  return { ...client, email: address, uid: client.auth.currentUser.uid };
}

async function seedDocuments(entries) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(Object.entries(entries).map(([path, value]) => setDoc(doc(db, path), value)));
  });
}

async function readBackend(path) {
  let value = null;
  await environment.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDoc(doc(context.firestore(), path));
    value = snapshot.exists() ? snapshot.data() : null;
  });
  return value;
}

async function registerFreeProfessional(client, role = "medico") {
  return client.call("registerProfessional", {
    aceptaAviso: true,
    aceptaBeta: true,
    modalidadRegistro: "gratuita",
    nombre: "Profesional para eliminación",
    rol: role
  });
}

async function uploadProfilePhoto(client) {
  const path = `usuarios/${client.uid}/perfil/foto-perfil`;
  await uploadBytes(ref(client.storage, path), profilePhotoBytes, { contentType: "image/png" });
  return path;
}

async function storageObjectExists(path) {
  const [exists] = await admin.storage(adminApp).bucket(STORAGE_BUCKET).file(path).exists();
  return exists;
}

async function assertAuthMissing(uid) {
  await assert.rejects(
    admin.auth(adminApp).getUser(uid),
    (error) => String(error?.code || "") === "auth/user-not-found"
  );
}

before(async () => {
  environment = await createRulesTestEnvironment();
  adminApp = admin.initializeApp({
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET
  }, `account-deletion-flow-${process.pid}`);
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

test("el borrado de paciente elimina Auth, raíces y Storage y libera el cupo profesional", {
  timeout: 180000
}, async () => {
  const administrator = await flowClient("patient-admin");
  const professional = await flowClient("patient-professional", { email: true });
  const patient = await flowClient("patient-account", { email: true });
  await registerFreeProfessional(professional);
  await patient.call("registerPatientProfile", {
    aceptaAviso: true,
    aceptaBeta: true,
    correoMedico: professional.email,
    nombre: "Paciente para eliminación"
  });
  const provisional = await professional.call("createProvisionalPatient", {
    operationId: "deletion_patient_linked_provisional",
    paciente: { nombre: "Expediente previo vinculado" }
  });
  await seedDocuments({
    [`usuarios/${provisional.id}/notas/notaVinculada`]: { texto: "dato vinculado" },
    [`pacientes/${provisional.id}/registrosDiarios/registroVinculado`]: { valor: 2 }
  });
  const linkingCode = await professional.call("manageAccountLinking", {
    accion: "crearCodigoExpedienteParaPaciente",
    pacienteId: provisional.id
  });
  await patient.call("manageAccountLinking", {
    accion: "vincularCuentaConCodigoMedico",
    codigo: linkingCode.codigo
  });
  assert.equal((await readBackend(`usuarios/${professional.uid}`)).pacientesEnCuenta, 1);

  const requestId = uniqueRequestId("deletion-request");
  await seedDocuments({
    [`usuarios/${administrator.uid}`]: { email: "admin@example.test", rol: "admin" },
    [`pacientes/${patient.uid}/registrosDiarios/registro1`]: { valor: 1 },
    [`reportesUsuarios/${requestId}`]: {
      categoria: "solicitud_eliminacion",
      estado: "pendiente",
      pacienteNombre: "Paciente para eliminación",
      pacienteUid: patient.uid,
      recursoTipo: "paciente",
      tipo: "solicitud_eliminacion"
    }
  });
  const patientPhotoPath = await uploadProfilePhoto(patient);
  const unrelatedPhotoPath = await uploadProfilePhoto(administrator);

  const result = await administrator.call("eliminarPacienteDefinitivamente", {
    pacienteNombre: "Paciente para eliminación",
    pacienteUid: patient.uid,
    solicitudId: requestId
  });

  assert.equal(result.ok, true);
  assert.equal(result.cuotasProfesionalesLiberadas, 1);
  assert.equal(result.expedientesVinculadosEliminados, 1);
  assert.equal(await readBackend(`usuarios/${patient.uid}`), null);
  assert.equal(await readBackend(`usuarios/${provisional.id}`), null);
  assert.equal(await readBackend(`usuarios/${provisional.id}/notas/notaVinculada`), null);
  assert.equal(await readBackend(`pacientes/${provisional.id}/registrosDiarios/registroVinculado`), null);
  assert.equal(await readBackend(`pacientes/${patient.uid}/registrosDiarios/registro1`), null);
  assert.equal(await readBackend(`reportesUsuarios/${requestId}`), null);
  assert.equal(await readBackend(`usuarios/${professional.uid}/patientQuotaAssignments/${patient.uid}`), null);
  assert.equal((await readBackend(`usuarios/${professional.uid}`)).pacientesEnCuenta, 0);
  assert.equal((await readBackend(`accountDeletionTombstones/${patient.uid}`)).deletionState, "completed");
  assert.equal((await readBackend(`accountDeletionTombstones/${provisional.id}`)).deletionState, "completed");
  assert.equal(await storageObjectExists(patientPhotoPath), false);
  assert.equal(await storageObjectExists(unrelatedPhotoPath), true);
  await assertAuthMissing(patient.uid);
});

test("el borrado profesional limpia relaciones y Storage y puede reintentarse sin el perfil", {
  timeout: 180000
}, async () => {
  const administrator = await flowClient("professional-admin");
  const professional = await flowClient("professional-account", { email: true });
  await registerFreeProfessional(professional, "psicologo");
  const provisional = await professional.call("createProvisionalPatient", {
    operationId: "deletion_professional_reassignment",
    paciente: { nombre: "Expediente que requiere reasignación" }
  });
  await seedDocuments({
    [`usuarios/${administrator.uid}`]: { email: "admin@example.test", rol: "admin" }
  });
  const professionalPhotoPath = await uploadProfilePhoto(professional);
  const unrelatedPhotoPath = await uploadProfilePhoto(administrator);
  await expectFirebaseError(
    administrator.call("eliminarProfesionalDefinitivamente", {
      profesionalUid: professional.uid
    }),
    "failed-precondition"
  );
  assert.equal(await readBackend(`accountDeletionTombstones/${professional.uid}`), null);
  const provisionalAfterRollback = await professional.call("createProvisionalPatient", {
    operationId: "deletion_professional_after_rollback",
    paciente: { nombre: "Alta posterior al preflight cancelado" }
  });
  await Promise.all([
    admin.firestore(adminApp).doc(`usuarios/${provisional.id}`).delete(),
    admin.firestore(adminApp).doc(`usuarios/${provisionalAfterRollback.id}`).delete()
  ]);

  const patientUid = uniqueRequestId("patient-with-account").replaceAll("-", "_");
  await seedDocuments({
    [`usuarios/${patientUid}`]: {
      creadoPor: professional.uid,
      createdByUid: professional.uid,
      email: "patient@example.test",
      medicosAutorizados: [professional.uid],
      medicoTratanteUid: professional.uid,
      nombre: "Paciente con cuenta",
      ownerUid: professional.uid,
      rol: "paciente",
      tieneCuenta: true
    },
    [`usuarios/${patientUid}/permisosMedicos/${professional.uid}`]: {
      administrarPermisos: true,
      lectura: true,
      rolPermiso: "tratante"
    }
  });
  const first = await administrator.call("eliminarProfesionalDefinitivamente", {
    profesionalUid: professional.uid
  });
  const retry = await administrator.call("eliminarProfesionalDefinitivamente", {
    profesionalUid: professional.uid
  });

  assert.equal(first.ok, true);
  assert.equal(retry.ok, true);
  assert.equal(await readBackend(`usuarios/${professional.uid}`), null);
  const patient = await readBackend(`usuarios/${patientUid}`);
  assert.equal(patient.creadoPor, "");
  assert.equal(patient.createdByUid, "");
  assert.equal(patient.medicoTratanteUid, "");
  assert.equal(patient.ownerUid, "");
  assert.deepEqual(patient.medicosAutorizados, []);
  assert.equal(await readBackend(`usuarios/${patientUid}/permisosMedicos/${professional.uid}`), null);
  assert.equal((await readBackend(`accountDeletionTombstones/${professional.uid}`)).deletionState, "completed");
  assert.equal(await storageObjectExists(professionalPhotoPath), false);
  assert.equal(await storageObjectExists(unrelatedPhotoPath), true);
  await assertAuthMissing(professional.uid);
});

test("una foto de perfil finalizada tarde no reaparece después del borrado", {
  timeout: 60000
}, async () => {
  const accountUid = uniqueRequestId("deleted-profile-photo").replaceAll("-", "_");
  const photoPath = `usuarios/${accountUid}/perfil/foto-perfil`;
  await seedDocuments({
    [`accountDeletionTombstones/${accountUid}`]: {
      accountType: "paciente",
      accountUid,
      deletionPhase: "completed",
      deletionState: "completed"
    }
  });

  const object = admin.storage(adminApp).bucket(STORAGE_BUCKET).file(photoPath);
  await object.save(Buffer.from(profilePhotoBytes), {
    metadata: { contentType: "image/png" }
  });
  await pollUntil(async () => !(await object.exists())[0], {
    description: "limpieza de la foto finalizada después del borrado"
  });
  assert.equal(await storageObjectExists(photoPath), false);
});
