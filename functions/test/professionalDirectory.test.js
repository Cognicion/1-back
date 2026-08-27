"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ProfessionalDirectoryError,
  createProfessionalDirectoryService
} = require("../accountSecurity/professionalDirectory");

class Snapshot {
  constructor(path, value) {
    this.id = path.split("/").at(-1);
    this.exists = value !== undefined;
    this.value = value;
  }

  data() {
    return this.value;
  }
}

class Query {
  constructor(db, role = "") {
    this.db = db;
    this.role = role;
  }

  where(field, operator, role) {
    assert.equal(field, "rol");
    assert.equal(operator, "==");
    return new Query(this.db, role);
  }

  async get() {
    const docs = [...this.db.records.entries()]
      .filter(([path, value]) => /^usuarios\/[^/]+$/u.test(path) && value?.rol === this.role)
      .map(([path, value]) => new Snapshot(path, value));
    return { docs };
  }
}

class FakeDb {
  constructor(records) {
    this.records = new Map(Object.entries(records));
  }

  doc(path) {
    return { get: async () => new Snapshot(path, this.records.get(path)) };
  }

  collection(path) {
    assert.equal(path, "usuarios");
    return new Query(this);
  }
}

test("el directorio callable entrega solo identidad pública profesional", async () => {
  const db = new FakeDb({
    "usuarios/actor": { email: "actor@example.test", rol: "paciente", tieneCuenta: true },
    "usuarios/medico": {
      cedula: "dato-no-publico",
      email: "medico@example.test",
      nombre: "Médico Uno",
      rol: "medico"
    },
    "usuarios/paciente-ajeno": {
      diagnostico: "dato-clinico",
      email: "paciente@example.test",
      nombre: "Paciente Ajeno",
      rol: "paciente"
    }
  });
  const service = createProfessionalDirectoryService({ db });

  const result = await service.list({ uid: "actor" });

  assert.deepEqual(result, {
    professionals: [{
      email: "medico@example.test",
      id: "medico",
      nombre: "Médico Uno",
      rol: "medico",
      uid: "medico"
    }]
  });
  assert.doesNotMatch(JSON.stringify(result), /dato-clinico|dato-no-publico|paciente-ajeno/);
});

test("el directorio rechaza cuentas sin perfil o marcadas para eliminación", async () => {
  for (const records of [
    {},
    {
      "usuarios/actor": { rol: "paciente" },
      "accountDeletionTombstones/actor": { estado: "pendiente" }
    }
  ]) {
    const service = createProfessionalDirectoryService({ db: new FakeDb(records) });
    await assert.rejects(
      service.list({ uid: "actor" }),
      (error) => error instanceof ProfessionalDirectoryError && error.code === "failed-precondition"
    );
  }
});

test("el directorio de pacientes devuelve solo IDs relacionados a un plan legado", async () => {
  const db = new FakeDb({
    "usuarios/actor": { rol: "medico", tieneCuenta: true },
    "usuarios/paciente-directo": { medicoUid: "actor", rol: "paciente" },
    "usuarios/paciente-compartido": { medicoUid: "otro", rol: "paciente" },
    "usuarios/paciente-ajeno": { medicoUid: "otro", rol: "paciente" },
    "usuarios/paciente-compartido/permisosMedicos/actor": {
      lectura: true,
      rolPermiso: "colaborador"
    }
  });
  const service = createProfessionalDirectoryService({ db });

  const result = await service.listAuthorizedPatientIds({ uid: "actor", token: {} });

  assert.deepEqual(result, { patientIds: ["paciente-compartido", "paciente-directo"] });
});

test("un privilegio administrativo no amplía los pacientes del Panel Médico", async () => {
  const db = new FakeDb({
    "usuarios/actor": { admin: true, rol: "medico", tieneCuenta: true },
    "usuarios/paciente-directo": { medicoUid: "actor", rol: "paciente" },
    "usuarios/paciente-ajeno": { medicoUid: "otro", rol: "paciente" }
  });
  const service = createProfessionalDirectoryService({ db });

  const result = await service.listAuthorizedPatientIds({
    uid: "actor",
    token: { admin: true }
  });

  assert.deepEqual(result, { patientIds: ["paciente-directo"] });
});

test("una cuenta administrativa solo enumera sus pacientes relacionados en el Panel Médico", async () => {
  const db = new FakeDb({
    "usuarios/actor": { rol: "admin", tieneCuenta: true },
    "usuarios/paciente-directo": { medicoUid: "actor", rol: "paciente" },
    "usuarios/paciente-ajeno": { medicoUid: "otro", rol: "paciente" }
  });
  const service = createProfessionalDirectoryService({ db });

  const result = await service.listAuthorizedPatientIds({
    uid: "actor",
    token: { admin: true }
  });

  assert.deepEqual(result, { patientIds: ["paciente-directo"] });
});

test("una cuenta administrativa sin relaciones no enumera pacientes en el Panel Médico", async () => {
  const db = new FakeDb({
    "usuarios/actor": { rol: "admin", tieneCuenta: true },
    "usuarios/paciente-ajeno": { medicoUid: "otro", rol: "paciente" }
  });
  const service = createProfessionalDirectoryService({ db });

  const result = await service.listAuthorizedPatientIds({
    uid: "actor",
    token: { admin: true }
  });

  assert.deepEqual(result, { patientIds: [] });
});
