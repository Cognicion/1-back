import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import {
  assertFails,
  assertSucceeds
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";

import {
  createRulesTestEnvironment,
  UID_OTHER,
  UID_OWNER
} from "./environment.mjs";

let environment;
let ownerDb;
let otherDb;
let anonymousDb;

const ownerFilePath = `usuarios/${UID_OWNER}/cloudFiles/file_existing`;
const usagePath = `usuarios/${UID_OWNER}/cloudStorageUsage/current`;
const reservationPath = `usuarios/${UID_OWNER}/cloudUploadReservations/file_existing`;
const UID_ADMIN = "uidQuotaRulesAdmin";
const UID_FREE = "uidQuotaRulesFree";
const UID_FREE_COLLABORATOR = "uidQuotaRulesCollaborator";
const UID_FREE_STUDENT = "uidQuotaRulesStudent";
const UID_CODE_PROFESSIONAL = "uidQuotaRulesCode";
const UID_LEGACY_PROFESSIONAL = "uidQuotaRulesLegacy";
const PATIENT_WITH_SLOT = "uidQuotaRulesPatientWithSlot";
const PATIENT_WITHOUT_SLOT = "uidQuotaRulesPatientWithoutSlot";
const PATIENT_COLLABORATOR = "uidQuotaRulesPatientCollaborator";
const PATIENT_STUDENT = "uidQuotaRulesPatientStudent";
const PATIENT_CODE = "uidQuotaRulesPatientCode";
const PATIENT_LEGACY = "uidQuotaRulesPatientLegacy";

async function seedInternalCloudDocuments() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, ownerFilePath), {
        deleted: false,
        id: "file_existing",
        mimeType: "application/pdf",
        name: "memoria.pdf",
        ownerId: UID_OWNER,
        parentFolderId: null,
        quotaAccounted: true,
        sizeBytes: 128,
        storagePath: `mi-nube/${UID_OWNER}/files/file_existing/memoria.pdf`,
        type: "file"
      }),
      setDoc(doc(db, usagePath), {
        maxBytes: 250 * 1024 * 1024,
        reservedBytes: 0,
        revision: 1,
        usedBytes: 128
      }),
      setDoc(doc(db, reservationPath), {
        expectedSizeBytes: 128,
        fileId: "file_existing",
        ownerId: UID_OWNER,
        status: "committed"
      })
    ]);
  });
}

function freeProfessional(role = "medico") {
  return {
    limitePacientes: 5,
    modalidadRegistroProfesional: "gratuita",
    pacientesEnCuenta: 1,
    planCuentaProfesional: "profesional_gratuito",
    rol: role,
    tieneCuenta: true
  };
}

function activeAssignment(professionalUid, patientUid) {
  return {
    estado: "activo",
    patientUid,
    professionalUid
  };
}

function permission(role) {
  const byRole = {
    tratante: {
      administrarPermisos: true,
      agregarNotas: true,
      editarPaciente: true,
      lectura: true,
      rolPermiso: "tratante"
    },
    colaborador: {
      administrarPermisos: false,
      agregarNotas: true,
      editarPaciente: false,
      lectura: true,
      rolPermiso: "colaborador"
    },
    estudiante: {
      administrarPermisos: false,
      agregarNotas: false,
      editarPaciente: false,
      lectura: true,
      rolPermiso: "estudiante"
    }
  };
  return byRole[role];
}

async function seedProfessionalPatientQuotaDocuments() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "usuarios", UID_ADMIN), { rol: "admin", tieneCuenta: true }),
      setDoc(doc(db, "usuarios", UID_FREE), freeProfessional()),
      setDoc(doc(db, "usuarios", UID_FREE_COLLABORATOR), freeProfessional("psicologo")),
      setDoc(doc(db, "usuarios", UID_FREE_STUDENT), freeProfessional("enfermeria_salud_mental")),
      setDoc(doc(db, "usuarios", UID_CODE_PROFESSIONAL), {
        modalidadRegistroProfesional: "codigo_autorizacion",
        planCuentaProfesional: "profesional_codigo",
        rol: "medico",
        tieneCuenta: true
      }),
      setDoc(doc(db, "usuarios", UID_LEGACY_PROFESSIONAL), {
        rol: "medico",
        tieneCuenta: true
      }),
      setDoc(doc(db, "usuarios", PATIENT_WITH_SLOT), {
        medicoUid: UID_FREE,
        nombre: "Paciente dentro de cuota",
        rol: "paciente",
        tieneCuenta: false
      }),
      setDoc(doc(db, "usuarios", PATIENT_WITHOUT_SLOT), {
        nombre: "Paciente fuera de cuota",
        ownerUid: UID_FREE,
        rol: "paciente",
        tieneCuenta: false
      }),
      setDoc(doc(db, "usuarios", PATIENT_COLLABORATOR), {
        nombre: "Paciente colaborador",
        rol: "paciente",
        tieneCuenta: true
      }),
      setDoc(doc(db, "usuarios", PATIENT_STUDENT), {
        nombre: "Paciente estudiante",
        rol: "paciente",
        tieneCuenta: true
      }),
      setDoc(doc(db, "usuarios", PATIENT_CODE), {
        nombre: "Paciente código",
        rol: "paciente",
        tieneCuenta: true
      }),
      setDoc(doc(db, "usuarios", PATIENT_LEGACY), {
        medicoUid: UID_LEGACY_PROFESSIONAL,
        nombre: "Paciente legado",
        rol: "paciente",
        tieneCuenta: false
      }),
      setDoc(doc(db, `usuarios/${UID_FREE}/patientQuotaAssignments/${PATIENT_WITH_SLOT}`),
        activeAssignment(UID_FREE, PATIENT_WITH_SLOT)),
      setDoc(doc(db, `usuarios/${UID_FREE_COLLABORATOR}/patientQuotaAssignments/${PATIENT_COLLABORATOR}`),
        activeAssignment(UID_FREE_COLLABORATOR, PATIENT_COLLABORATOR)),
      setDoc(doc(db, `usuarios/${UID_FREE_STUDENT}/patientQuotaAssignments/${PATIENT_STUDENT}`),
        activeAssignment(UID_FREE_STUDENT, PATIENT_STUDENT)),
      setDoc(doc(db, `usuarios/${PATIENT_COLLABORATOR}/permisosMedicos/${UID_FREE_COLLABORATOR}`),
        permission("colaborador")),
      setDoc(doc(db, `usuarios/${PATIENT_STUDENT}/permisosMedicos/${UID_FREE_STUDENT}`),
        permission("estudiante")),
      setDoc(doc(db, `usuarios/${PATIENT_CODE}/permisosMedicos/${UID_CODE_PROFESSIONAL}`),
        permission("tratante")),
      setDoc(doc(db, `usuarios/${PATIENT_WITH_SLOT}/notas/notaExistente`), { contenido: "Inicial" }),
      setDoc(doc(db, `usuarios/${PATIENT_COLLABORATOR}/notas/notaExistente`), { contenido: "Inicial" }),
      setDoc(doc(db, `usuarios/${PATIENT_STUDENT}/notas/notaExistente`), { contenido: "Inicial" }),
      setDoc(doc(db, `pacientes/${PATIENT_WITH_SLOT}/registrosDiarios/registroExistente`), { valor: 1 }),
      setDoc(doc(db, `pacientes/${PATIENT_WITHOUT_SLOT}/registrosDiarios/registroExistente`), { valor: 1 })
    ]);
  });
}

before(async () => {
  environment = await createRulesTestEnvironment();
  ownerDb = environment.authenticatedContext(UID_OWNER).firestore();
  otherDb = environment.authenticatedContext(UID_OTHER).firestore();
  anonymousDb = environment.unauthenticatedContext().firestore();
});

beforeEach(async () => {
  await environment.clearStorage();
  await environment.clearFirestore();
  await seedInternalCloudDocuments();
  await seedProfessionalPatientQuotaDocuments();
});

after(async () => {
  await environment?.cleanup();
});

test("Firestore permite al propietario consultar metadata y cuota, sin exponer reservas", async () => {
  const fileSnapshot = await assertSucceeds(getDoc(doc(ownerDb, ownerFilePath)));
  assert.equal(fileSnapshot.data().ownerId, UID_OWNER);

  const listSnapshot = await assertSucceeds(getDocs(collection(ownerDb, "usuarios", UID_OWNER, "cloudFiles")));
  assert.deepEqual(listSnapshot.docs.map((item) => item.id), ["file_existing"]);

  const usageSnapshot = await assertSucceeds(getDoc(doc(ownerDb, usagePath)));
  assert.equal(usageSnapshot.data().usedBytes, 128);

  await assertFails(getDoc(doc(ownerDb, reservationPath)));
  await assertFails(getDoc(doc(ownerDb, "usuarios", UID_OWNER, "cloudStorageUsage", "forged")));
});

test("Firestore deniega lectura y enumeración Mi nube a otro UID y a contexto anónimo", async () => {
  for (const db of [otherDb, anonymousDb]) {
    await assertFails(getDoc(doc(db, ownerFilePath)));
    await assertFails(getDocs(collection(db, "usuarios", UID_OWNER, "cloudFiles")));
    await assertFails(getDoc(doc(db, usagePath)));
    await assertFails(getDoc(doc(db, reservationPath)));
  }
});

test("ni siquiera el propietario puede fabricar metadata, carpetas o referencias físicas", async () => {
  const maliciousDocuments = [
    {
      path: `usuarios/${UID_OWNER}/cloudFiles/folder_forged`,
      data: {
        id: "folder_forged",
        name: "Carpeta falsa",
        ownerId: UID_OWNER,
        parentFolderId: null,
        type: "folder"
      }
    },
    {
      path: `usuarios/${UID_OWNER}/cloudFiles/file_forged`,
      data: {
        id: "file_forged",
        mimeType: "application/pdf",
        name: "falso.pdf",
        ownerId: UID_OWNER,
        sizeBytes: 1,
        storagePath: `mi-nube/${UID_OTHER}/files/file_forged/falso.pdf`,
        type: "file"
      }
    }
  ];

  for (const entry of maliciousDocuments) {
    await assertFails(setDoc(doc(ownerDb, entry.path), entry.data));
  }

  await assertFails(updateDoc(doc(ownerDb, ownerFilePath), {
    ownerId: UID_OTHER,
    storagePath: `mi-nube/${UID_OTHER}/files/file_existing/memoria.pdf`
  }));
  await assertFails(deleteDoc(doc(ownerDb, ownerFilePath)));
});

test("los contadores y reservas solo pueden ser modificados por backend/Admin SDK", async () => {
  for (const db of [ownerDb, otherDb, anonymousDb]) {
    await assertFails(setDoc(doc(db, `usuarios/${UID_OWNER}/cloudStorageUsage/forged`), {
      maxBytes: Number.MAX_SAFE_INTEGER,
      reservedBytes: 0,
      usedBytes: 0
    }));
    await assertFails(updateDoc(doc(db, usagePath), {
      maxBytes: Number.MAX_SAFE_INTEGER,
      reservedBytes: 0,
      usedBytes: 0
    }));
    await assertFails(deleteDoc(doc(db, usagePath)));

    await assertFails(setDoc(doc(db, `usuarios/${UID_OWNER}/cloudUploadReservations/manual`), {
      expectedSizeBytes: 1,
      expiresAt: new Date(Date.now() + 60_000),
      fileId: "manual",
      mimeType: "application/pdf",
      ownerId: UID_OWNER,
      status: "reserved",
      storagePath: `mi-nube/${UID_OWNER}/files/manual/manual.pdf`
    }));
    await assertFails(updateDoc(doc(db, reservationPath), { status: "reserved" }));
    await assertFails(deleteDoc(doc(db, reservationPath)));
  }
});

test("las exclusiones Mi nube no bloquean una subcolección heredada autorizada del propietario", async () => {
  const noteRef = doc(ownerDb, "usuarios", UID_OWNER, "apuntesMedico", "note_regression_probe");
  await assertSucceeds(setDoc(noteRef, {
    contenido: "Contenido de regresión",
    fechaActualizacion: "2026-08-22T00:00:00.000Z",
    titulo: "Apunte de regresión"
  }));
  assert.equal((await assertSucceeds(getDoc(noteRef))).data().titulo, "Apunte de regresión");
});

test("una cuenta gratuita solo accede al expediente y árboles clínicos respaldados por su slot", async () => {
  const freeDb = environment.authenticatedContext(UID_FREE).firestore();
  const assignedProfile = doc(freeDb, "usuarios", PATIENT_WITH_SLOT);
  const unassignedProfile = doc(freeDb, "usuarios", PATIENT_WITHOUT_SLOT);

  assert.equal((await assertSucceeds(getDoc(assignedProfile))).data().nombre, "Paciente dentro de cuota");
  await assertFails(getDoc(unassignedProfile));

  await assertSucceeds(getDoc(doc(freeDb, "usuarios", PATIENT_WITH_SLOT, "notas", "notaExistente")));
  await assertFails(getDoc(doc(freeDb, "usuarios", PATIENT_WITHOUT_SLOT, "notas", "notaInexistente")));
  await assertSucceeds(getDoc(doc(
    freeDb,
    "pacientes",
    PATIENT_WITH_SLOT,
    "registrosDiarios",
    "registroExistente"
  )));
  await assertFails(getDoc(doc(
    freeDb,
    "pacientes",
    PATIENT_WITHOUT_SLOT,
    "registrosDiarios",
    "registroExistente"
  )));

  await assertSucceeds(updateDoc(assignedProfile, { observaciones: "Actualizado" }));
  await assertFails(updateDoc(unassignedProfile, { observaciones: "Intrusión" }));
  await assertSucceeds(setDoc(doc(freeDb, "usuarios", PATIENT_WITH_SLOT, "tratamientos", "nuevo"), {
    activo: true
  }));
  await assertFails(setDoc(doc(freeDb, "usuarios", PATIENT_WITHOUT_SLOT, "tratamientos", "nuevo"), {
    activo: true
  }));
});

test("las consultas abiertas de la UI no pueden eludir el slot y los IDs concretos sí son autorizables", async () => {
  const freeDb = environment.authenticatedContext(UID_FREE).firestore();
  const assignedQuery = query(
    collection(freeDb, "usuarios"),
    where("medicoUid", "==", UID_FREE)
  );
  const unassignedQuery = query(
    collection(freeDb, "usuarios"),
    where("ownerUid", "==", UID_FREE)
  );
  const assignedIdQuery = query(
    collection(freeDb, "usuarios"),
    where(documentId(), "==", PATIENT_WITH_SLOT)
  );
  const unassignedIdQuery = query(
    collection(freeDb, "usuarios"),
    where(documentId(), "==", PATIENT_WITHOUT_SLOT)
  );

  // Firestore no puede demostrar un exists(slot) para un UID abierto derivado
  // de resource.data. La UI debe obtener IDs autorizados desde backend y hacer
  // lecturas concretas; abrir esta query permitiría listar un sexto expediente.
  await assertFails(getDocs(assignedQuery));
  await assertFails(getDocs(unassignedQuery));
  const assignedById = await assertSucceeds(getDocs(assignedIdQuery));
  assert.deepEqual(assignedById.docs.map((snapshot) => snapshot.id), [PATIENT_WITH_SLOT]);
  await assertFails(getDocs(unassignedIdQuery));
});

test("pacientes y cuentas gratuitas no pueden abrir directorios ni enumerar pacientes ajenos", async () => {
  const freeDb = environment.authenticatedContext(UID_FREE).firestore();
  const patientDb = environment.authenticatedContext(PATIENT_WITHOUT_SLOT).firestore();

  for (const db of [freeDb, patientDb]) {
    await assertFails(getDocs(query(
      collection(db, "usuarios"),
      where("rol", "==", "medico")
    )));
    await assertFails(getDocs(query(
      collection(db, "usuarios"),
      where("rol", "==", "paciente")
    )));
    await assertFails(getDocs(collection(db, "usuarios")));
  }
});

test("el profesional lista sus asignaciones pero ningún cliente puede alterarlas ni leer las ajenas", async () => {
  const freeDb = environment.authenticatedContext(UID_FREE).firestore();
  const otherDbForQuota = environment.authenticatedContext(UID_OTHER).firestore();
  const adminDb = environment.authenticatedContext(UID_ADMIN).firestore();
  const assignments = collection(freeDb, "usuarios", UID_FREE, "patientQuotaAssignments");
  const assignment = doc(assignments, PATIENT_WITH_SLOT);

  const snapshot = await assertSucceeds(getDocs(assignments));
  assert.deepEqual(snapshot.docs.map((item) => item.id), [PATIENT_WITH_SLOT]);
  assert.equal((await assertSucceeds(getDoc(assignment))).data().estado, "activo");

  for (const db of [otherDbForQuota, adminDb]) {
    await assertFails(getDocs(collection(db, "usuarios", UID_FREE, "patientQuotaAssignments")));
    await assertFails(getDoc(doc(db, "usuarios", UID_FREE, "patientQuotaAssignments", PATIENT_WITH_SLOT)));
  }

  await assertFails(setDoc(assignment, { estado: "activo" }, { merge: true }));
  await assertFails(deleteDoc(assignment));
});

test("los planes por código y legados conservan acceso ilimitado sin fabricar slots", async () => {
  const codeDb = environment.authenticatedContext(UID_CODE_PROFESSIONAL).firestore();
  const legacyDb = environment.authenticatedContext(UID_LEGACY_PROFESSIONAL).firestore();

  for (const db of [codeDb, legacyDb]) {
    await assertFails(getDocs(collection(db, "usuarios")));
    await assertFails(getDocs(query(collection(db, "usuarios"), where("rol", "==", "paciente"))));
  }

  await assertSucceeds(getDoc(doc(codeDb, "usuarios", PATIENT_CODE)));
  await assertSucceeds(updateDoc(doc(codeDb, "usuarios", PATIENT_CODE), { observaciones: "Código" }));
  await assertSucceeds(setDoc(doc(codeDb, "usuarios", PATIENT_CODE, "tratamientos", "codigo"), {
    activo: true
  }));

  await assertSucceeds(getDoc(doc(legacyDb, "usuarios", PATIENT_LEGACY)));
  await assertSucceeds(updateDoc(doc(legacyDb, "usuarios", PATIENT_LEGACY), { observaciones: "Legado" }));
  await assertSucceeds(setDoc(doc(legacyDb, "pacientes", PATIENT_LEGACY, "registrosDiarios", "legado"), {
    valor: 2
  }));
});

test("tratante, colaborador y estudiante conservan capacidades diferenciadas", async () => {
  const collaboratorDb = environment.authenticatedContext(UID_FREE_COLLABORATOR).firestore();
  const studentDb = environment.authenticatedContext(UID_FREE_STUDENT).firestore();

  await assertSucceeds(getDoc(doc(collaboratorDb, "usuarios", PATIENT_COLLABORATOR)));
  await assertFails(updateDoc(doc(collaboratorDb, "usuarios", PATIENT_COLLABORATOR), {
    observaciones: "No puede editar"
  }));
  await assertSucceeds(setDoc(doc(collaboratorDb, "usuarios", PATIENT_COLLABORATOR, "notas", "nueva"), {
    contenido: "Nota agregada"
  }));
  await assertFails(updateDoc(
    doc(collaboratorDb, "usuarios", PATIENT_COLLABORATOR, "notas", "notaExistente"),
    { contenido: "No puede alterar notas previas" }
  ));
  await assertFails(setDoc(doc(collaboratorDb, "usuarios", PATIENT_COLLABORATOR, "tratamientos", "nuevo"), {
    activo: true
  }));

  await assertSucceeds(getDoc(doc(studentDb, "usuarios", PATIENT_STUDENT)));
  await assertSucceeds(getDoc(doc(studentDb, "usuarios", PATIENT_STUDENT, "notas", "notaExistente")));
  await assertFails(updateDoc(doc(studentDb, "usuarios", PATIENT_STUDENT), {
    observaciones: "No puede editar"
  }));
  await assertFails(setDoc(doc(studentDb, "usuarios", PATIENT_STUDENT, "notas", "nueva"), {
    contenido: "No puede agregar"
  }));
});

test("paciente propio y admin conservan sus permisos aun sin slot profesional", async () => {
  const patientDb = environment.authenticatedContext(PATIENT_WITHOUT_SLOT).firestore();
  const adminDb = environment.authenticatedContext(UID_ADMIN).firestore();

  await assertSucceeds(getDoc(doc(patientDb, "usuarios", PATIENT_WITHOUT_SLOT)));
  await assertSucceeds(setDoc(doc(patientDb, "usuarios", PATIENT_WITHOUT_SLOT, "notas", "propia"), {
    contenido: "Del paciente"
  }));
  await assertSucceeds(setDoc(doc(patientDb, "pacientes", PATIENT_WITHOUT_SLOT, "registrosDiarios", "propio"), {
    valor: 3
  }));

  await assertSucceeds(getDoc(doc(adminDb, "usuarios", PATIENT_WITHOUT_SLOT)));
  const adminPatients = await assertSucceeds(getDocs(query(
    collection(adminDb, "usuarios"),
    where("rol", "==", "paciente")
  )));
  assert.ok(
    adminPatients.docs.some((snapshot) => snapshot.id === PATIENT_WITHOUT_SLOT),
    "el fallback admin puede enumerar la colección paciente sin abrirla a profesionales"
  );
  await assertSucceeds(updateDoc(doc(adminDb, "usuarios", PATIENT_WITHOUT_SLOT), {
    observacionesAdmin: "Revisión"
  }));
  await assertSucceeds(setDoc(doc(adminDb, "pacientes", PATIENT_WITHOUT_SLOT, "registrosDiarios", "admin"), {
    valor: 4
  }));
});
