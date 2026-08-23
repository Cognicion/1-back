import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import {
  doc,
  getDoc,
  setDoc
} from "firebase/firestore";

import {
  createFlowClient,
  createRulesTestEnvironment,
  expectFirebaseError
} from "./environment.mjs";

const ACTIONS = Object.freeze({
  CREATE_DOCTOR_CODE: "crearCodigoExpedienteParaPaciente",
  CREATE_PATIENT_CODE: "crearCodigoPacienteParaMedico",
  LINK_FROM_DOCTOR_CODE: "vincularCuentaConCodigoMedico",
  LINK_FROM_PATIENT_CODE: "vincularExpedienteConCodigoPaciente"
});

let rulesEnvironment;
const clients = new Set();

async function client(label) {
  const value = await createFlowClient(label);
  clients.add(value);
  return value;
}

async function seed(records) {
  await rulesEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all(Object.entries(records).map(([path, value]) => setDoc(doc(firestore, path), value)));
  });
}

async function readPrivileged(path) {
  let value = null;
  await rulesEnvironment.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDoc(doc(context.firestore(), path));
    value = snapshot.exists() ? snapshot.data() : null;
  });
  return value;
}

before(async () => {
  rulesEnvironment = await createRulesTestEnvironment();
});

beforeEach(async () => {
  await rulesEnvironment.clearFirestore();
});

after(async () => {
  await Promise.allSettled([...clients].map((value) => value.destroy()));
  await rulesEnvironment?.cleanup();
});

test("callable real crea y consume código médico→paciente con copia e idempotencia", {
  timeout: 120000
}, async () => {
  const doctor = await client("account-link-doctor");
  const patient = await client("account-link-patient");
  const otherPatient = await client("account-link-other-patient");
  const provisionalId = "emulatorProvisionalDoctorCode";

  await seed({
    [`usuarios/${doctor.uid}`]: { rol: "medico", tieneCuenta: true },
    [`usuarios/${patient.uid}`]: {
      email: "patient@example.test",
      nombre: "Cuenta destino",
      rol: "paciente",
      estado: "activo",
      tieneCuenta: true
    },
    [`usuarios/${otherPatient.uid}`]: {
      nombre: "Otra cuenta",
      rol: "paciente",
      estado: "activo",
      tieneCuenta: true
    },
    [`usuarios/${provisionalId}`]: {
      creadoPor: doctor.uid,
      createdByUid: doctor.uid,
      medicoTratanteUid: doctor.uid,
      medicoUid: doctor.uid,
      medicosAutorizados: [doctor.uid],
      nombre: "Expediente previo",
      ownerUid: doctor.uid,
      rol: "paciente",
      estado: "provisional",
      tieneCuenta: false
    },
    [`usuarios/${provisionalId}/notas/noteStableId`]: { texto: "registro-emulator" }
  });

  const created = await doctor.call("manageAccountLinking", {
    accion: ACTIONS.CREATE_DOCTOR_CODE,
    medicoUid: otherPatient.uid,
    pacienteId: provisionalId
  });
  assert.match(created.codigo, /^COG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/u);
  const issuedCode = await readPrivileged(`codigosVinculacion/${created.codigo}`);
  assert.equal(issuedCode.medicoUid, doctor.uid, "el backend ignora medicoUid falsificado");
  assert.equal(issuedCode.emitidoPorUid, doctor.uid);
  assert.equal(issuedCode.usado, false);

  const payload = {
    accion: ACTIONS.LINK_FROM_DOCTOR_CODE,
    codigo: created.codigo,
    cuentaPacienteUid: otherPatient.uid
  };
  const first = await patient.call("manageAccountLinking", payload);
  const retry = await patient.call("manageAccountLinking", payload);
  assert.deepEqual(retry, first);
  assert.equal(first.pacienteUid, patient.uid, "el destino deriva de la sesión, no del payload");
  assert.equal(first.expedientePrevioUid, provisionalId);

  const copiedNote = await getDoc(doc(patient.firestore, "usuarios", patient.uid, "notas", "noteStableId"));
  assert.equal(copiedNote.exists(), true);
  assert.equal(copiedNote.data().texto, "registro-emulator");
  const linkedOrigin = await readPrivileged(`usuarios/${provisionalId}`);
  assert.equal(linkedOrigin.vinculadoA, patient.uid);
  assert.equal(linkedOrigin.vinculacionReservaEstado, "completado");

  const consumedCode = await readPrivileged(`codigosVinculacion/${created.codigo}`);
  assert.equal(consumedCode.usado, true);
  assert.equal(consumedCode.estadoProceso, "completado");
  assert.equal(consumedCode.reservadoPorUid, patient.uid);

  await expectFirebaseError(
    otherPatient.call("manageAccountLinking", payload),
    "already-exists"
  );
});

test("callable real crea código paciente→médico y deniega otro profesional sin acceso", {
  timeout: 120000
}, async () => {
  const doctor = await client("account-link-patient-code-doctor");
  const otherDoctor = await client("account-link-patient-code-other-doctor");
  const patient = await client("account-link-patient-code-patient");
  const otherPatient = await client("account-link-patient-code-other-patient");
  const provisionalId = "emulatorProvisionalPatientCode";

  await seed({
    [`usuarios/${doctor.uid}`]: { rol: "medico", tieneCuenta: true },
    [`usuarios/${otherDoctor.uid}`]: { rol: "medico", tieneCuenta: true },
    [`usuarios/${patient.uid}`]: {
      nombre: "Paciente emisor",
      rol: "paciente",
      estado: "activo",
      tieneCuenta: true
    },
    [`usuarios/${otherPatient.uid}`]: {
      nombre: "Paciente ajeno",
      rol: "paciente",
      estado: "activo",
      tieneCuenta: true
    },
    [`usuarios/${provisionalId}`]: {
      creadoPor: doctor.uid,
      createdByUid: doctor.uid,
      medicoTratanteUid: doctor.uid,
      medicoUid: doctor.uid,
      medicosAutorizados: [doctor.uid],
      nombre: "Expediente previo",
      ownerUid: doctor.uid,
      rol: "paciente",
      estado: "provisional",
      tieneCuenta: false
    },
    [`usuarios/${provisionalId}/tratamientos/treatmentStableId`]: { activo: true }
  });

  const created = await patient.call("manageAccountLinking", {
    accion: ACTIONS.CREATE_PATIENT_CODE,
    pacienteUid: otherPatient.uid
  });
  const issuedCode = await readPrivileged(`codigosVinculacion/${created.codigo}`);
  assert.equal(issuedCode.pacienteCuentaUid, patient.uid, "el backend ignora pacienteUid falsificado");
  assert.equal(issuedCode.emitidoPorUid, patient.uid);

  await expectFirebaseError(
    otherDoctor.call("manageAccountLinking", {
      accion: ACTIONS.LINK_FROM_PATIENT_CODE,
      codigo: created.codigo,
      expedienteProvisionalId: provisionalId,
      medicoUid: doctor.uid
    }),
    "permission-denied"
  );
  assert.equal((await readPrivileged(`codigosVinculacion/${created.codigo}`)).usado, false);

  await expectFirebaseError(
    otherPatient.call("manageAccountLinking", {
      accion: ACTIONS.LINK_FROM_PATIENT_CODE,
      codigo: created.codigo,
      expedienteProvisionalId: provisionalId,
      medicoUid: doctor.uid
    }),
    "permission-denied"
  );

  const linked = await doctor.call("manageAccountLinking", {
    accion: ACTIONS.LINK_FROM_PATIENT_CODE,
    codigo: created.codigo,
    expedienteProvisionalId: provisionalId,
    medicoUid: otherDoctor.uid
  });
  assert.equal(linked.pacienteUid, patient.uid);
  assert.equal(linked.expedientePrevioUid, provisionalId);
  const copiedTreatment = await getDoc(doc(patient.firestore, "usuarios", patient.uid, "tratamientos", "treatmentStableId"));
  assert.equal(copiedTreatment.exists(), true);

  const consumedCode = await readPrivileged(`codigosVinculacion/${created.codigo}`);
  assert.equal(consumedCode.usado, true);
  assert.equal(consumedCode.usadoPor, doctor.uid, "el backend ignora medicoUid falsificado");
});
