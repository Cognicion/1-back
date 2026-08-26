"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertAuthorizedPatientClinician,
  listAuthorizedPatientSnapshots
} = require("../clinicalAnalytics/access");
const { listAuthorizedSofiaPatients } = require("../clinicalAnalytics/handlers");

class FakeSnapshot {
  constructor(path, value) {
    this.id = path.split("/").at(-1);
    this.exists = value !== undefined;
    this._value = value;
  }

  data() {
    return this._value;
  }
}

class FakeQuery {
  constructor(db, path, filters = []) {
    this.db = db;
    this.path = path;
    this.filters = filters;
  }

  where(field, operator, expected) {
    assert.equal(operator, "==");
    return new FakeQuery(this.db, this.path, [...this.filters, { expected, field }]);
  }

  async get() {
    const prefix = `${this.path}/`;
    const docs = [...this.db.records.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .filter(([, value]) => this.filters.every(({ expected, field }) => value?.[field] === expected))
      .map(([path, value]) => new FakeSnapshot(path, value));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class FakeDb {
  constructor(records) {
    this.records = new Map(Object.entries(records));
  }

  doc(path) {
    return {
      get: async () => new FakeSnapshot(path, this.records.get(path))
    };
  }

  collection(path) {
    return new FakeQuery(this, path);
  }
}

const professionalUid = "profesional-gratuito";
const freeProfile = {
  rol: "medico",
  modalidadRegistroProfesional: "gratuita",
  planCuentaProfesional: "profesional_gratuito",
  limitePacientes: 5,
  pacientesEnCuenta: 2
};

function assignment(patientUid) {
  return {
    estado: "activo",
    patientUid,
    professionalUid
  };
}

function records() {
  return {
    [`usuarios/${professionalUid}`]: freeProfile,
    "usuarios/paciente-directo": {
      nombre: "Paciente directo",
      rol: "paciente",
      medicoUid: professionalUid
    },
    "usuarios/paciente-compartido": {
      nombre: "Paciente compartido",
      rol: "paciente",
      medicoUid: "otro-profesional"
    },
    "usuarios/paciente-sexto": {
      nombre: "Paciente fuera de cuota",
      rol: "paciente",
      medicoUid: professionalUid
    },
    "usuarios/paciente-origen-vinculado": {
      nombre: "Paciente origen vinculado",
      rol: "paciente",
      estado: "vinculado",
      vinculadoA: "paciente-destino"
    },
    [`usuarios/${professionalUid}/patientQuotaAssignments/paciente-directo`]: assignment("paciente-directo"),
    [`usuarios/${professionalUid}/patientQuotaAssignments/paciente-compartido`]: assignment("paciente-compartido"),
    [`usuarios/${professionalUid}/patientQuotaAssignments/paciente-origen-vinculado`]: assignment("paciente-origen-vinculado"),
    [`usuarios/paciente-compartido/permisosMedicos/${professionalUid}`]: {
      lectura: true,
      rolPermiso: "colaborador"
    },
    [`usuarios/paciente-origen-vinculado/permisosMedicos/${professionalUid}`]: {
      lectura: true,
      rolPermiso: "colaborador"
    }
  };
}

test("el acceso Admin SDK exige un slot activo a la cuenta gratuita", async () => {
  const db = new FakeDb(records());
  const allowed = await assertAuthorizedPatientClinician({
    auth: { uid: professionalUid, token: {} }
  }, db, "paciente-compartido");
  assert.equal(allowed.patient.nombre, "Paciente compartido");

  await assert.rejects(
    assertAuthorizedPatientClinician({
      auth: { uid: professionalUid, token: {} }
    }, db, "paciente-sexto"),
    (error) => error.code === "permission-denied"
  );
  await assert.rejects(
    assertAuthorizedPatientClinician({
      auth: { uid: professionalUid, token: {} }
    }, db, "paciente-origen-vinculado"),
    (error) => error.code === "permission-denied"
  );
});

test("los listados server-side usan asignaciones y conservan permisos compartidos", async () => {
  const db = new FakeDb(records());
  const snapshots = await listAuthorizedPatientSnapshots({
    db,
    professionalProfile: freeProfile,
    professionalUid
  });
  assert.deepEqual(
    snapshots.map((snapshot) => snapshot.id).sort(),
    ["paciente-compartido", "paciente-directo"]
  );

  const result = await listAuthorizedSofiaPatients({
    db,
    request: { auth: { uid: professionalUid, token: {} }, data: {} }
  });
  assert.deepEqual(
    result.patients.map((patient) => patient.id).sort(),
    ["paciente-compartido", "paciente-directo"]
  );
});

test("los planes sin límite conservan todas las relaciones clínicas heredadas", async () => {
  const legacyUid = "profesional-legado";
  const legacyProfile = { rol: "medico", tieneCuenta: true };
  const db = new FakeDb({
    [`usuarios/${legacyUid}`]: legacyProfile,
    "usuarios/paciente-legado-compartido": {
      nombre: "Paciente legado compartido",
      rol: "paciente",
      medicoUid: "otro-profesional"
    },
    "usuarios/paciente-legado-propietario": {
      nombre: "Paciente legado propietario",
      rol: "paciente",
      ownerUid: legacyUid
    },
    "usuarios/paciente-legado-equipo": {
      nombre: "Paciente legado por equipo",
      rol: "paciente",
      equipoClinicoIds: [legacyUid]
    },
    [`usuarios/paciente-legado-compartido/permisosMedicos/${legacyUid}`]: {
      lectura: true,
      rolPermiso: "colaborador"
    }
  });

  const snapshots = await listAuthorizedPatientSnapshots({
    db,
    professionalProfile: legacyProfile,
    professionalUid: legacyUid
  });

  assert.deepEqual(
    snapshots.map((snapshot) => snapshot.id).sort(),
    ["paciente-legado-compartido", "paciente-legado-equipo", "paciente-legado-propietario"]
  );
});

test("los tombstones revocan de inmediato el acceso Admin SDK del actor o del paciente", async () => {
  const actorRecords = records();
  actorRecords[`accountDeletionTombstones/${professionalUid}`] = {
    accountUid: professionalUid,
    deletionState: "in_progress"
  };
  const actorDb = new FakeDb(actorRecords);
  await assert.rejects(
    assertAuthorizedPatientClinician({ auth: { uid: professionalUid, token: {} } }, actorDb, "paciente-directo"),
    (error) => error.code === "permission-denied"
  );
  assert.deepEqual(await listAuthorizedPatientSnapshots({
    db: actorDb,
    professionalProfile: freeProfile,
    professionalUid
  }), []);

  const patientRecords = records();
  patientRecords["accountDeletionTombstones/paciente-compartido"] = {
    accountUid: "paciente-compartido",
    deletionState: "in_progress"
  };
  const patientDb = new FakeDb(patientRecords);
  await assert.rejects(
    assertAuthorizedPatientClinician({ auth: { uid: professionalUid, token: {} } }, patientDb, "paciente-compartido"),
    (error) => error.code === "permission-denied"
  );
  const visible = await listAuthorizedPatientSnapshots({
    db: patientDb,
    professionalProfile: freeProfile,
    professionalUid
  });
  assert.deepEqual(visible.map((snapshot) => snapshot.id), ["paciente-directo"]);
});
