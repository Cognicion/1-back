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
  createFlowClient,
  createRulesTestEnvironment,
  expectFirebaseError,
  PROJECT_ID,
  uniqueRequestId
} from "./environment.mjs";

const ADMIN_UID = "uidProfessionalRegistrationAdmin";
const clients = new Set();
let environment;
let adminApp;

async function seedCode(code, overrides = {}) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "usuarios", ADMIN_UID), {
      email: "admin-professional-registration@example.test",
      rol: "admin"
    });
    await setDoc(doc(db, "codigosAutorizacionMedico", code), {
      codigo: code,
      creadoPorUid: ADMIN_UID,
      expiraEn: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tipo: "medico",
      usado: false,
      ...overrides
    });
  });
}

async function readAsBackend(path) {
  let value = null;
  await environment.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDoc(doc(context.firestore(), path));
    value = snapshot.exists() ? snapshot.data() : null;
  });
  return value;
}

async function emailClient(label) {
  const client = await createFlowClient(`professional-${label}`);
  clients.add(client);
  const localPart = uniqueRequestId(label).toLowerCase().replace(/[^a-z0-9-]/gu, "");
  const email = `${localPart}@example.test`;
  const credential = EmailAuthProvider.credential(email, "emulator-password-123");
  await linkWithCredential(client.auth.currentUser, credential);
  await admin.auth(adminApp).updateUser(client.auth.currentUser.uid, { emailVerified: true });
  await client.auth.currentUser.reload();
  await client.auth.currentUser.getIdToken(true);
  return { ...client, email, uid: client.auth.currentUser.uid };
}

function payload(code, role = "medico", overrides = {}) {
  return {
    aceptaAviso: true,
    aceptaBeta: true,
    codigoAutorizacion: code,
    email: "forged-email@example.test",
    nombre: "Profesional Emulator",
    rol: role,
    ...overrides
  };
}

function freePayload(role = "medico", overrides = {}) {
  return {
    aceptaAviso: true,
    aceptaBeta: true,
    email: "forged-free-email@example.test",
    modalidadRegistro: "gratuita",
    nombre: "Profesional Gratuito Emulator",
    rol: role,
    ...overrides
  };
}

before(async () => {
  environment = await createRulesTestEnvironment();
  adminApp = admin.initializeApp({ projectId: PROJECT_ID }, `professional-registration-${process.pid}`);
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

test("Auth email + callable crean el perfil y consumen el código atómicamente; el retry es idempotente", {
  timeout: 60000
}, async () => {
  const code = "FLOW-AUTH-0001";
  await seedCode(code);
  const owner = await emailClient("owner");

  const created = await owner.call("registerProfessionalWithCode", payload(code));
  assert.deepEqual(created, {
    alreadyRegistered: false,
    role: "medico",
    uid: owner.uid
  });

  const profile = (await getDoc(doc(owner.firestore, "usuarios", owner.uid))).data();
  assert.equal(profile.rol, "medico");
  assert.equal(profile.email, owner.email, "El backend debe usar el email del token Auth.");
  assert.notEqual(profile.email, "forged-email@example.test");
  assert.equal(profile.creadoConCodigoAutorizacion, code);
  assert.equal(profile.modalidadRegistroProfesional, "codigo_admin");
  assert.equal(profile.planCuentaProfesional, "profesional_codigo");
  assert.equal(profile.limitePacientes, null);
  assert.equal(profile.pacientesEnCuenta, 0);

  const consumed = await readAsBackend(`codigosAutorizacionMedico/${code}`);
  assert.equal(consumed.usado, true);
  assert.equal(consumed.usadoPorUid, owner.uid);
  assert.equal(consumed.usadoPorEmail, owner.email);

  const retry = await owner.call("registerProfessionalWithCode", payload(code));
  assert.deepEqual(retry, {
    alreadyRegistered: true,
    role: "medico",
    uid: owner.uid
  });
});

test("un código expirado o restringido a otro rol no crea perfil ni cambia su estado", {
  timeout: 60000
}, async () => {
  const expiredCode = "FLOW-EXPIRED-0001";
  const restrictedCode = "FLOW-ROLE-0001";
  await seedCode(expiredCode, { expiraEn: new Date(Date.now() - 1000).toISOString() });
  await seedCode(restrictedCode, { rolPermitido: "medico" });

  const expiredUser = await emailClient("expired");
  await expectFirebaseError(
    expiredUser.call("registerProfessionalWithCode", payload(expiredCode)),
    "failed-precondition"
  );
  assert.equal(await readAsBackend(`usuarios/${expiredUser.uid}`), null);
  assert.equal((await readAsBackend(`codigosAutorizacionMedico/${expiredCode}`)).usado, false);

  const wrongRoleUser = await emailClient("wrong-role");
  await expectFirebaseError(
    wrongRoleUser.call("registerProfessionalWithCode", payload(restrictedCode, "psicologo")),
    "permission-denied"
  );
  assert.equal(await readAsBackend(`usuarios/${wrongRoleUser.uid}`), null);
  assert.equal((await readAsBackend(`codigosAutorizacionMedico/${restrictedCode}`)).usado, false);
});

test("registerProfessional crea cuentas gratuitas de médico y psicólogo sin código y de forma idempotente", {
  timeout: 60000
}, async () => {
  for (const role of ["medico", "psicologo"]) {
    const owner = await emailClient(`free-${role}`);
    const request = freePayload(role);

    const created = await owner.call("registerProfessional", request);
    assert.deepEqual(created, {
      alreadyRegistered: false,
      role,
      uid: owner.uid
    });

    const profile = (await getDoc(doc(owner.firestore, "usuarios", owner.uid))).data();
    assert.equal(profile.rol, role);
    assert.equal(profile.email, owner.email, "El backend debe usar el email del token Auth.");
    assert.notEqual(profile.email, "forged-free-email@example.test");
    assert.equal(profile.modalidadRegistroProfesional, "gratuita");
    assert.equal(profile.planCuentaProfesional, "profesional_gratuito");
    assert.equal(profile.limitePacientes, 5);
    assert.equal(profile.pacientesEnCuenta, 0);
    assert.equal(Object.hasOwn(profile, "creadoConCodigoAutorizacion"), false);

    const retry = await owner.call("registerProfessional", request);
    assert.deepEqual(retry, {
      alreadyRegistered: true,
      role,
      uid: owner.uid
    });
  }
});

test("reuso y dos altas concurrentes con un código conceden exactamente un perfil", {
  timeout: 60000
}, async () => {
  const code = "FLOW-RACE-0001";
  await seedCode(code);
  const first = await emailClient("race-first");
  const second = await emailClient("race-second");

  const settled = await Promise.allSettled([
    first.call("registerProfessionalWithCode", payload(code, "psicologo")),
    second.call("registerProfessionalWithCode", payload(code, "psicologo"))
  ]);
  assert.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(settled.filter((item) => item.status === "rejected").length, 1);

  const profiles = await Promise.all([
    readAsBackend(`usuarios/${first.uid}`),
    readAsBackend(`usuarios/${second.uid}`)
  ]);
  assert.equal(profiles.filter(Boolean).length, 1);
  const consumed = await readAsBackend(`codigosAutorizacionMedico/${code}`);
  assert.equal(consumed.usado, true);
  assert.ok([first.uid, second.uid].includes(consumed.usadoPorUid));

  const loser = consumed.usadoPorUid === first.uid ? second : first;
  await expectFirebaseError(
    loser.call("registerProfessionalWithCode", payload(code, "psicologo")),
    "failed-precondition"
  );
});
