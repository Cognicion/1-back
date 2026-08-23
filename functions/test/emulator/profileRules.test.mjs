import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import {
  assertFails,
  assertSucceeds
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc
} from "firebase/firestore";

import { createRulesTestEnvironment } from "./environment.mjs";

const UID_PATIENT = "uidProfilePatient";
const UID_OTHER = "uidProfileOther";
const UID_ADMIN = "uidProfileAdmin";
const PROFESSIONALS = Object.freeze([
  ["uidProfileMedico", "medico"],
  ["uidProfilePsicologo", "psicologo"],
  ["uidProfileEnfermeria", "enfermeria_salud_mental"]
]);

let environment;
let anonymousDb;

async function seedProfiles() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "usuarios", UID_ADMIN), { email: "admin@example.test", rol: "admin" }),
      setDoc(doc(db, "usuarios", UID_OTHER), { email: "other@example.test", rol: "paciente" }),
      ...PROFESSIONALS.map(([uid, role]) => setDoc(doc(db, "usuarios", uid), {
        email: `${uid}@example.test`,
        rol: role,
        tieneCuenta: true
      }))
    ]);
  });
}

function authenticatedDb(uid) {
  return environment.authenticatedContext(uid).firestore();
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

test("un usuario autenticado solo puede autocrear un perfil paciente sin claims alternativos", async () => {
  const patientDb = authenticatedDb(UID_PATIENT);
  const profileRef = doc(patientDb, "usuarios", UID_PATIENT);

  await assertSucceeds(setDoc(profileRef, {
    email: "patient@example.test",
    nombre: "Paciente",
    rol: "paciente",
    tieneCuenta: true
  }));
  assert.equal((await assertSucceeds(getDoc(profileRef))).data().rol, "paciente");

  const attacks = [
    { rol: "admin" },
    { rol: "medico" },
    { rol: "psicologo" },
    { rol: "enfermeria_salud_mental" },
    { rol: "paciente", role: "admin" },
    { rol: "paciente", roles: ["medico"] },
    { rol: "paciente", permisos: { admin: true } },
    { rol: "paciente", claims: { admin: true } },
    { rol: "paciente", admin: true },
    { rol: "paciente", perfilMedicoVerificado: true }
  ];

  for (let index = 0; index < attacks.length; index += 1) {
    const uid = `uidSelfAttack${index}`;
    const db = authenticatedDb(uid);
    await assertFails(setDoc(doc(db, "usuarios", uid), {
      email: `${uid}@example.test`,
      nombre: "Ataque",
      ...attacks[index]
    }));
  }

  await assertFails(setDoc(doc(anonymousDb, "usuarios", "uidAnonymous"), {
    nombre: "Anónimo",
    rol: "paciente"
  }));
});

test("la autoedición conserva datos normales pero bloquea toda elevación de rol o administración", async () => {
  const db = authenticatedDb(UID_PATIENT);
  const profileRef = doc(db, "usuarios", UID_PATIENT);
  await assertSucceeds(setDoc(profileRef, {
    email: "patient@example.test",
    nombre: "Paciente",
    rol: "paciente",
    tieneCuenta: true
  }));

  await assertSucceeds(updateDoc(profileRef, { nombre: "Paciente actualizado" }));
  for (const patch of [
    { rol: "admin" },
    { role: "medico" },
    { roles: { psicologo: true } },
    { tipoUsuario: "enfermeria_salud_mental" },
    { admin: true },
    { esAdmin: true },
    { permisos: { admin: true } },
    { permisosFormatos: { historia_clinica: true } },
    { claims: { admin: true } },
    { profesion: "medico" },
    { especialidad: "medico" },
    { cedulaProfesional: "FORGED" },
    { perfilMedicoVerificado: true }
  ]) {
    await assertFails(updateDoc(profileRef, patch));
  }

  const medicoDb = authenticatedDb(PROFESSIONALS[0][0]);
  await assertSucceeds(updateDoc(doc(medicoDb, "usuarios", PROFESSIONALS[0][0]), {
    cedulaProfesional: "CEDULA-PRUEBA",
    especialidad: "Psiquiatria"
  }));
  await assertFails(updateDoc(doc(medicoDb, "usuarios", PROFESSIONALS[0][0]), {
    permisosFormatos: { historia_clinica: true }
  }));
});

test("cada rol clínico permitido crea pacientes provisionales solo con atribución propia completa", async () => {
  for (const [actorUid] of [...PROFESSIONALS, [UID_ADMIN, "admin"]]) {
    const db = authenticatedDb(actorUid);
    const patientId = `patientCreatedBy_${actorUid}`;
    const patientRef = doc(db, "usuarios", patientId);
    await assertSucceeds(setDoc(patientRef, {
      creadoPor: actorUid,
      createdByUid: actorUid,
      medicoTratanteUid: actorUid,
      medicoUid: actorUid,
      nombre: "Paciente provisional",
      ownerUid: actorUid,
      rol: "paciente",
      tieneCuenta: false
    }));
    await assertSucceeds(updateDoc(patientRef, { observaciones: "Actualización clínica" }));
  }
});

test("pacientes provisionales con propietario ausente, ajeno o rol privilegiado son rechazados", async () => {
  const actorUid = PROFESSIONALS[0][0];
  const db = authenticatedDb(actorUid);
  const valid = {
    creadoPor: actorUid,
    medicoUid: actorUid,
    nombre: "Paciente provisional",
    ownerUid: actorUid,
    rol: "paciente",
    tieneCuenta: false
  };
  const attacks = [
    { ...valid, ownerUid: UID_OTHER },
    { ...valid, medicoUid: UID_OTHER },
    { ...valid, creadoPor: UID_OTHER },
    { ...valid, ownerUid: undefined },
    { ...valid, tieneCuenta: true },
    { ...valid, rol: "medico" },
    { ...valid, role: "paciente" }
  ];

  for (let index = 0; index < attacks.length; index += 1) {
    const payload = Object.fromEntries(Object.entries(attacks[index]).filter(([, value]) => value !== undefined));
    await assertFails(setDoc(doc(db, "usuarios", `provisionalAttack${index}`), payload));
  }

  const patientDb = authenticatedDb(UID_OTHER);
  await assertFails(setDoc(doc(patientDb, "usuarios", "provisionalByPatient"), valid));
});

test("personal clínico no cambia roles de pacientes; admin conserva asignación a terceros pero no a sí mismo", async () => {
  const medicoDb = authenticatedDb(PROFESSIONALS[0][0]);
  const patientRef = doc(medicoDb, "usuarios", "patientRoleTarget");
  await assertSucceeds(setDoc(patientRef, {
    creadoPor: PROFESSIONALS[0][0],
    medicoUid: PROFESSIONALS[0][0],
    nombre: "Paciente",
    ownerUid: PROFESSIONALS[0][0],
    rol: "paciente",
    tieneCuenta: false
  }));
  await assertFails(updateDoc(patientRef, { rol: "medico" }));
  await assertFails(updateDoc(patientRef, { admin: true }));

  const adminDb = authenticatedDb(UID_ADMIN);
  await assertSucceeds(updateDoc(doc(adminDb, "usuarios", UID_OTHER), {
    cambiadoPorAdminUid: UID_ADMIN,
    rol: "psicologo"
  }));
  await assertFails(updateDoc(doc(adminDb, "usuarios", UID_ADMIN), { rol: "superadmin" }));
});

test("los campos internos de vinculación son backend-only para paciente, clínico y admin cliente", async () => {
  const targetRef = (db) => doc(db, "usuarios", UID_OTHER);
  const actors = [
    authenticatedDb(UID_OTHER),
    authenticatedDb(PROFESSIONALS[0][0]),
    authenticatedDb(UID_ADMIN)
  ];
  const attacks = [
    { codigoVinculacionActivo: "COG-FAKE-CODE" },
    { vinculacionReservaEstado: "reservado", vinculacionReservaCodigo: "COG-FAKE-CODE" },
    { vinculacionReservaActorUid: UID_OTHER, vinculacionReservaAccion: "forged" },
    { vinculacionReservaDestinoUid: UID_PATIENT },
    { vinculadoA: UID_PATIENT },
    { expedienteVinculadoDesde: UID_PATIENT, fechaVinculacionExpediente: "2026-08-22T00:00:00.000Z" }
  ];

  for (const db of actors) {
    for (const patch of attacks) await assertFails(updateDoc(targetRef(db), patch));
  }

  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "usuarios", UID_OTHER), {
      vinculacionReservaActorUid: UID_ADMIN,
      vinculacionReservaCodigo: "COG-BACK-END",
      vinculacionReservaEstado: "reservado"
    });
  });
  const snapshot = await assertSucceeds(getDoc(targetRef(authenticatedDb(UID_OTHER))));
  assert.equal(snapshot.data().vinculacionReservaCodigo, "COG-BACK-END");
});

test("la lectura canónica de perfiles sigue disponible solo para usuarios autenticados", async () => {
  const patientDb = authenticatedDb(UID_OTHER);
  const adminSnapshot = await assertSucceeds(getDoc(doc(patientDb, "usuarios", UID_ADMIN)));
  assert.equal(adminSnapshot.data().rol, "admin");
  await assertFails(getDoc(doc(anonymousDb, "usuarios", UID_ADMIN)));
});

test("los códigos profesionales quedan administrados por admin y opacos para otros clientes", async () => {
  const adminDb = authenticatedDb(UID_ADMIN);
  const patientDb = authenticatedDb(UID_OTHER);
  const codePath = "codigosAutorizacionMedico/TEST-CODE-0001";
  await assertSucceeds(setDoc(doc(adminDb, codePath), {
    creadoPorUid: UID_ADMIN,
    expiraEn: "2026-08-23T00:00:00.000Z",
    tipo: "medico",
    usado: false
  }));
  await assertSucceeds(getDoc(doc(adminDb, codePath)));
  await assertFails(getDoc(doc(patientDb, codePath)));
  await assertFails(updateDoc(doc(patientDb, codePath), { usado: true }));
  await assertFails(deleteDoc(doc(patientDb, codePath)));
});

test("los códigos de vinculación son backend-only incluso para admin y personal clínico", async () => {
  const path = "codigosVinculacion/LINK-0001";
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), {
      medicoUid: PROFESSIONALS[0][0],
      usado: false
    });
  });

  for (const db of [
    authenticatedDb(UID_ADMIN),
    authenticatedDb(PROFESSIONALS[0][0]),
    authenticatedDb(UID_OTHER),
    anonymousDb
  ]) {
    await assertFails(getDoc(doc(db, path)));
    await assertFails(setDoc(doc(db, "codigosVinculacion", "LINK-FORGED"), { usado: false }));
    await assertFails(updateDoc(doc(db, path), { usado: true }));
    await assertFails(deleteDoc(doc(db, path)));
  }
});

test("Mis apuntes permite CRUD al dueño y solamente lectura/borrado al admin", async () => {
  const ownerDb = authenticatedDb(UID_OTHER);
  const adminDb = authenticatedDb(UID_ADMIN);
  const strangerDb = authenticatedDb(UID_PATIENT);
  const notePath = `usuarios/${UID_OTHER}/apuntesMedico/noteAdminPolicy`;
  const folderPath = `usuarios/${UID_OTHER}/carpetasApuntes/folderAdminPolicy`;

  await assertSucceeds(setDoc(doc(ownerDb, notePath), { contenido: "Privado", titulo: "Apunte" }));
  await assertSucceeds(setDoc(doc(ownerDb, folderPath), { nombre: "Carpeta" }));
  assert.equal((await assertSucceeds(getDoc(doc(adminDb, notePath)))).data().titulo, "Apunte");
  assert.equal((await assertSucceeds(getDoc(doc(adminDb, folderPath)))).data().nombre, "Carpeta");

  await assertFails(updateDoc(doc(adminDb, notePath), { contenido: "Alterado" }));
  await assertFails(setDoc(doc(adminDb, `usuarios/${UID_OTHER}/apuntesMedico/adminCreated`), {
    contenido: "No permitido",
    titulo: "No permitido"
  }));
  await assertFails(getDoc(doc(strangerDb, notePath)));
  await assertFails(getDoc(doc(anonymousDb, notePath)));

  await assertSucceeds(deleteDoc(doc(adminDb, notePath)));
  await assertSucceeds(deleteDoc(doc(adminDb, folderPath)));
});
