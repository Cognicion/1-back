"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createProfessionalPatientAccessService,
  patientFolioCounterPath,
  toHttpsError
} = require("../accountSecurity/professionalPatientAccess");
const { AccountLinkingError } = require("../accountLinking/errors");
const {
  AUTHORIZED_PROFESSIONAL_PLAN,
  FREE_PATIENT_LIMIT,
  FREE_PROFESSIONAL_PLAN,
  PROFESSIONAL_REGISTRATION_MODES
} = require("../accountSecurity/professionalRegistration");
const {
  ProfessionalPatientQuotaError,
  quotaAssignmentPath,
  releasePatientSlotsForPatient
} = require("../accountSecurity/professionalPatientQuota");

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

class FakeSnapshot {
  constructor(reference, value) {
    this.ref = reference;
    this.id = reference.id;
    this.exists = value !== undefined;
    this._value = clone(value);
  }

  data() {
    return clone(this._value);
  }
}

class FakeDocumentReference {
  constructor(database, path) {
    this.database = database;
    this.path = path;
    this.id = path.split("/").at(-1);
  }

  get() {
    return Promise.resolve(this.database.snapshot(this.path));
  }
}

class FakeQuery {
  constructor(database, path, filters = [], maximum = null) {
    this.database = database;
    this.path = path;
    this.filters = filters;
    this.maximum = maximum;
  }

  where(field, operator, expected) {
    if (operator !== "==") throw new Error(`FakeQuery no implementa el operador ${operator}`);
    return new FakeQuery(
      this.database,
      this.path,
      [...this.filters, { expected: clone(expected), field }],
      this.maximum
    );
  }

  limit(maximum) {
    return new FakeQuery(this.database, this.path, this.filters, maximum);
  }

  get() {
    const prefix = `${this.path}/`;
    let docs = [...this.database.records.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .filter(([, value]) => this.filters.every(({ expected, field }) => (
        value?.[field] === expected
      )))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, value]) => new FakeSnapshot(this.database.doc(path), value));
    if (Number.isInteger(this.maximum)) docs = docs.slice(0, this.maximum);
    return Promise.resolve({ docs, empty: docs.length === 0, size: docs.length });
  }
}

class FakeCollectionReference extends FakeQuery {
  doc(id = "") {
    const documentId = id || this.database.nextAutoId();
    return this.database.doc(`${this.path}/${documentId}`);
  }
}

class FakeCollectionGroupQuery extends FakeQuery {
  where(field, operator, expected) {
    if (operator !== "==") throw new Error(`FakeCollectionGroupQuery no implementa el operador ${operator}`);
    return new FakeCollectionGroupQuery(
      this.database,
      this.path,
      [...this.filters, { expected: clone(expected), field }],
      this.maximum
    );
  }

  limit(maximum) {
    return new FakeCollectionGroupQuery(this.database, this.path, this.filters, maximum);
  }

  get() {
    let docs = [...this.database.records.entries()]
      .filter(([path]) => path.split("/").at(-2) === this.path)
      .filter(([, value]) => this.filters.every(({ expected, field }) => (
        value?.[field] === expected
      )))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, value]) => new FakeSnapshot(this.database.doc(path), value));
    if (Number.isInteger(this.maximum)) docs = docs.slice(0, this.maximum);
    return Promise.resolve({ docs, empty: docs.length === 0, size: docs.length });
  }
}

class FakeTransaction {
  constructor(records) {
    this.records = records;
  }

  get(reference) {
    return Promise.resolve(new FakeSnapshot(reference, this.records.get(reference.path)));
  }

  create(reference, value) {
    if (this.records.has(reference.path)) {
      throw Object.assign(new Error(`Ya existe ${reference.path}`), { code: 6 });
    }
    this.records.set(reference.path, clone(value));
  }

  set(reference, value, options = {}) {
    const previous = options.merge === true ? this.records.get(reference.path) || {} : {};
    this.records.set(reference.path, { ...clone(previous), ...clone(value) });
  }

  update(reference, value) {
    if (!this.records.has(reference.path)) {
      throw Object.assign(new Error(`No existe ${reference.path}`), { code: 5 });
    }
    this.records.set(reference.path, {
      ...clone(this.records.get(reference.path)),
      ...clone(value)
    });
  }

  delete(reference) {
    this.records.delete(reference.path);
  }
}

class FakeFirestore {
  constructor(initial = {}) {
    this.records = new Map(Object.entries(initial).map(([path, value]) => [path, clone(value)]));
    this.autoId = 0;
    this.transactionTail = Promise.resolve();
  }

  doc(path) {
    return new FakeDocumentReference(this, path);
  }

  collection(path) {
    return new FakeCollectionReference(this, path);
  }

  collectionGroup(path) {
    return new FakeCollectionGroupQuery(this, path);
  }

  nextAutoId() {
    this.autoId += 1;
    return `pacienteAuto${String(this.autoId).padStart(4, "0")}`;
  }

  snapshot(path) {
    return new FakeSnapshot(this.doc(path), this.records.get(path));
  }

  data(path) {
    return clone(this.records.get(path));
  }

  paths(prefix = "") {
    return [...this.records.keys()].filter((path) => path.startsWith(prefix)).sort();
  }

  async runTransaction(callback) {
    let release;
    const previous = this.transactionTail;
    this.transactionTail = new Promise((resolve) => { release = resolve; });
    await previous;

    const working = new Map(
      [...this.records.entries()].map(([path, value]) => [path, clone(value)])
    );
    try {
      const result = await callback(new FakeTransaction(working));
      this.records = working;
      return result;
    } finally {
      release();
    }
  }
}

const IDS = Object.freeze({
  authorized: "profesionalCodigo",
  free: "profesionalGratis",
  legacy: "profesionalLegado",
  patient: "pacienteConCuenta",
  patientOther: "pacienteCompartidoDos",
  target: "profesionalDestino"
});

function fixedClock() {
  return new Date("2026-08-26T15:30:00.000Z");
}

let patientCreationOperationSequence = 0;

function patientCreationData(paciente = {}, operationId = "") {
  patientCreationOperationSequence += 1;
  return {
    operationId: operationId || `test_patient_creation_${patientCreationOperationSequence}`,
    paciente
  };
}

function freeProfessional(overrides = {}) {
  return {
    nombre: "Profesional gratuito",
    email: "gratis@example.invalid",
    rol: "medico",
    tieneCuenta: true,
    modalidadRegistroProfesional: PROFESSIONAL_REGISTRATION_MODES.FREE,
    planCuentaProfesional: FREE_PROFESSIONAL_PLAN,
    limitePacientes: FREE_PATIENT_LIMIT,
    pacientesEnCuenta: 0,
    ...overrides
  };
}

function assignment(professionalUid, patientUid, source = "preexistente") {
  return {
    professionalUid,
    patientUid,
    estado: "activo",
    origen: source,
    fechaAsignacion: fixedClock().toISOString()
  };
}

function quotaRecords(professionalUid, count) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => {
    const patientUid = `pacientePrevio${index + 1}`;
    return [
      quotaAssignmentPath(professionalUid, patientUid),
      assignment(professionalUid, patientUid)
    ];
  }));
}

function patientProfile(overrides = {}) {
  return {
    nombre: "Paciente",
    rol: "paciente",
    tieneCuenta: true,
    estado: "activo",
    ...overrides
  };
}

function fakeAuthDirectory(usersByEmail = {}) {
  const records = new Map(Object.entries(usersByEmail).map(([email, user]) => [
    String(email).trim().toLowerCase(),
    clone({ emailVerified: true, ...user })
  ]));
  return {
    async getUserByEmail(email) {
      const user = records.get(String(email).trim().toLowerCase());
      if (!user) {
        throw Object.assign(new Error("Usuario Auth no encontrado"), { code: "auth/user-not-found" });
      }
      return clone(user);
    }
  };
}

function assertErrorCode(expectedCode, expectedClass = Error) {
  return (error) => {
    assert.ok(error instanceof expectedClass);
    assert.equal(error.code, expectedCode);
    return true;
  };
}

test("un registro sin perfil puede descartar su Auth sin tocar cuentas ya creadas", async () => {
  const deletedUids = [];
  const authAdmin = {
    async deleteUser(uid) {
      deletedUids.push(uid);
      if (deletedUids.filter((deletedUid) => deletedUid === uid).length > 1) {
        throw Object.assign(new Error("Usuario Auth ya eliminado"), { code: "auth/user-not-found" });
      }
    }
  };
  const db = new FakeFirestore();
  const service = createProfessionalPatientAccessService({ authAdmin, db, now: fixedClock });

  assert.deepEqual(
    await service.discardUnregisteredAccount({ uid: IDS.patient }),
    { discarded: true }
  );
  assert.deepEqual(deletedUids, [IDS.patient]);
  assert.deepEqual(db.data(`accountDeletionTombstones/${IDS.patient}`), {
    accountType: "registro_incompleto",
    accountUid: IDS.patient,
    deletionPhase: "completed",
    deletionStartedAt: fixedClock().toISOString(),
    deletionState: "completed",
    discardedByUid: IDS.patient,
    deletionCompletedAt: fixedClock().toISOString()
  });

  assert.deepEqual(
    await service.discardUnregisteredAccount({ uid: IDS.patient }),
    { discarded: true },
    "El backend debe aceptar un reintento seguro si el primer descarte ya eliminó Auth."
  );
  assert.deepEqual(deletedUids, [IDS.patient, IDS.patient]);

  const protectedDb = new FakeFirestore({
    [`usuarios/${IDS.patientOther}`]: patientProfile({ email: "paciente@example.invalid" })
  });
  const protectedService = createProfessionalPatientAccessService({ authAdmin, db: protectedDb, now: fixedClock });
  await assert.rejects(
    protectedService.discardUnregisteredAccount({ uid: IDS.patientOther }),
    assertErrorCode("failed-precondition")
  );
  assert.deepEqual(deletedUids, [IDS.patient, IDS.patient]);
  assert.equal(protectedDb.data(`accountDeletionTombstones/${IDS.patientOther}`), undefined);
});

test("una cuenta gratuita crea cinco pacientes provisionales y la sexta alta revierte con resource-exhausted", async () => {
  const db = new FakeFirestore({
    [`usuarios/${IDS.free}`]: freeProfessional()
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });
  const createdIds = [];

  for (let index = 1; index <= FREE_PATIENT_LIMIT; index += 1) {
    const result = await service.createProvisionalPatient({ uid: IDS.free }, patientCreationData({
        nombre: `Paciente ${index}`,
        motivoConsulta: `Motivo ${index}`,
        rol: "admin",
        tieneCuenta: true,
        planCuentaProfesional: AUTHORIZED_PROFESSIONAL_PLAN,
        medicoTratanteUID: IDS.target,
        profesionalesAutorizados: [IDS.target],
        equipoClinicoIds: [IDS.target]
    }));
    createdIds.push(result.id);
    assert.deepEqual(result.quota, { current: index, limit: FREE_PATIENT_LIMIT });
  }

  assert.equal(db.data(`usuarios/${IDS.free}`).pacientesEnCuenta, FREE_PATIENT_LIMIT);
  for (const [index, patientUid] of createdIds.entries()) {
    const storedPatient = db.data(`usuarios/${patientUid}`);
    assert.equal(storedPatient.nombre, `Paciente ${index + 1}`);
    assert.equal(storedPatient.rol, "paciente");
    assert.equal(storedPatient.tieneCuenta, false);
    assert.equal(storedPatient.creadoPor, IDS.free);
    assert.equal(storedPatient.planCuentaProfesional, undefined);
    assert.equal(storedPatient.medicoTratanteUID, undefined);
    assert.equal(storedPatient.profesionalesAutorizados, undefined);
    assert.equal(storedPatient.equipoClinicoIds, undefined);
    assert.deepEqual(db.data(quotaAssignmentPath(IDS.free, patientUid)), {
      professionalUid: IDS.free,
      patientUid,
      estado: "activo",
      origen: "alta_profesional",
      fechaAsignacion: fixedClock().toISOString()
    });
  }

  await assert.rejects(
    service.createProvisionalPatient(
      { uid: IDS.free },
      patientCreationData({ nombre: "Paciente sexto" })
    ),
    (error) => {
      assertErrorCode("resource-exhausted", ProfessionalPatientQuotaError)(error);
      assert.deepEqual(error.details, { current: FREE_PATIENT_LIMIT, limit: FREE_PATIENT_LIMIT });
      return true;
    }
  );

  assert.equal(db.data(`usuarios/${IDS.free}`).pacientesEnCuenta, FREE_PATIENT_LIMIT);
  assert.equal(db.data("usuarios/pacienteAuto0006"), undefined);
  assert.equal(db.data(patientFolioCounterPath("26")).ultimoConsecutivo, 1004);
  assert.equal(
    db.paths(`usuarios/${IDS.free}/patientQuotaAssignments/`).length,
    FREE_PATIENT_LIMIT
  );
});

test("el alta inicializa el contador anual desde el folio máximo y persiste el folio en ambas rutas", async () => {
  const counterPath = patientFolioCounterPath("26");
  const db = new FakeFirestore({
    [`usuarios/${IDS.free}`]: freeProfessional(),
    "usuarios/pacienteFolioTop": patientProfile({
      expedienteCognicion: "C1004-26"
    }),
    "usuarios/pacienteFolioInstitucional": patientProfile({
      datosInstitucionales: { expedienteCognicion: "C1012-26" }
    }),
    "usuarios/pacienteFolioOtroAnio": patientProfile({
      expedienteCognicion: "C9999-25"
    })
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  const result = await service.createProvisionalPatient({ uid: IDS.free }, patientCreationData({
      nombre: "Paciente con folio servidor",
      datosInstitucionales: { expediente: "LOCAL-7" }
  }));

  assert.equal(result.expedienteCognicion, "C1013-26");
  const storedPatient = db.data(`usuarios/${result.id}`);
  assert.equal(storedPatient.expedienteCognicion, "C1013-26");
  assert.deepEqual(storedPatient.datosInstitucionales, {
    expediente: "LOCAL-7",
    expedienteCognicion: "C1013-26"
  });
  assert.deepEqual(db.data(counterPath), {
    actualizadoEn: fixedClock().toISOString(),
    anio: "26",
    tipo: "expediente_cognicion",
    ultimoConsecutivo: 1013,
    fechaInicializacion: fixedClock().toISOString(),
    inicializadoDesdeMaximoExistente: 1012
  });
});

test("dos altas concurrentes reciben folios distintos mediante el contador anual atómico", async () => {
  const counterPath = patientFolioCounterPath("26");
  const db = new FakeFirestore({
    [`usuarios/${IDS.free}`]: freeProfessional(),
    "usuarios/pacienteFolioPrevio": patientProfile({ expedienteCognicion: "C1020-26" })
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  const results = await Promise.all([
    service.createProvisionalPatient(
      { uid: IDS.free },
      patientCreationData({ nombre: "Paciente folio concurrente A" })
    ),
    service.createProvisionalPatient(
      { uid: IDS.free },
      patientCreationData({ nombre: "Paciente folio concurrente B" })
    )
  ]);

  assert.deepEqual(
    results.map((result) => result.expedienteCognicion).sort(),
    ["C1021-26", "C1022-26"]
  );
  assert.equal(db.data(counterPath).ultimoConsecutivo, 1022);
  assert.equal(db.data(`usuarios/${results[0].id}`).expedienteCognicion, results[0].expedienteCognicion);
  assert.equal(db.data(`usuarios/${results[1].id}`).expedienteCognicion, results[1].expedienteCognicion);
});

test("dos invocaciones concurrentes con el mismo operationId crean un solo paciente y consumen un solo cupo", async () => {
  const operationId = "manual_retry_same_operation_01";
  const db = new FakeFirestore({
    [`usuarios/${IDS.free}`]: freeProfessional()
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  const results = await Promise.all([
    service.createProvisionalPatient({ uid: IDS.free }, patientCreationData({
      nombre: "Paciente de reintento",
      fechaCreacion: "2026-08-26T15:29:58.000Z"
    }, operationId)),
    service.createProvisionalPatient({ uid: IDS.free }, patientCreationData({
      nombre: "Paciente de reintento",
      fechaCreacion: "2026-08-26T15:30:02.000Z"
    }, operationId))
  ]);

  assert.equal(results[0].id, results[1].id);
  assert.equal(results[0].expedienteCognicion, results[1].expedienteCognicion);
  assert.deepEqual(results.map((result) => result.deduplicated), [false, true]);
  assert.equal(db.data(`usuarios/${IDS.free}`).pacientesEnCuenta, 1);
  assert.equal(db.paths(`usuarios/${IDS.free}/patientQuotaAssignments/`).length, 1);
  assert.equal(db.data(patientFolioCounterPath("26")).ultimoConsecutivo, 1000);
  assert.equal(db.data("usuarios/pacienteAuto0002"), undefined);

  const operation = db.data(
    `usuarios/${IDS.free}/patientCreationOperations/${operationId}`
  );
  assert.equal(operation.patientUid, results[0].id);
  assert.equal(operation.estado, "completada");
  assert.equal(operation.professionalUid, IDS.free);
  assert.equal(operation.payloadFingerprint.length, 64);
  assert.equal(operation.nombre, undefined);
});

test("reutilizar un operationId para datos distintos se rechaza sin crear otro expediente", async () => {
  const operationId = "manual_conflicting_operation_01";
  const db = new FakeFirestore({
    [`usuarios/${IDS.free}`]: freeProfessional()
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  const created = await service.createProvisionalPatient(
    { uid: IDS.free },
    patientCreationData({ nombre: "Paciente original" }, operationId)
  );
  await assert.rejects(
    service.createProvisionalPatient(
      { uid: IDS.free },
      patientCreationData({ nombre: "Paciente diferente" }, operationId)
    ),
    assertErrorCode("already-exists")
  );

  assert.equal(db.data(`usuarios/${IDS.free}`).pacientesEnCuenta, 1);
  assert.equal(db.data(`usuarios/${created.id}`).nombre, "Paciente original");
  assert.equal(db.data("usuarios/pacienteAuto0002"), undefined);
  assert.equal(db.data(patientFolioCounterPath("26")).ultimoConsecutivo, 1000);
});

test("el backend exige operationId antes de iniciar el alta", async () => {
  const db = new FakeFirestore({
    [`usuarios/${IDS.free}`]: freeProfessional()
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  await assert.rejects(
    service.createProvisionalPatient({ uid: IDS.free }, {
      paciente: { nombre: "Paciente sin operación" }
    }),
    assertErrorCode("invalid-argument")
  );
  assert.equal(db.data(`usuarios/${IDS.free}`).pacientesEnCuenta, 0);
  assert.equal(db.data("usuarios/pacienteAuto0001"), undefined);
});

test("el alta ignora folios aportados por el cliente y usa exclusivamente el contador del servidor", async () => {
  const counterPath = patientFolioCounterPath("26");
  const db = new FakeFirestore({
    [`usuarios/${IDS.authorized}`]: {
      nombre: "Profesional autorizado",
      rol: "medico",
      tieneCuenta: true,
      planCuentaProfesional: AUTHORIZED_PROFESSIONAL_PLAN
    },
    [counterPath]: {
      anio: "26",
      tipo: "expediente_cognicion",
      ultimoConsecutivo: 1030
    }
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  const first = await service.createProvisionalPatient({ uid: IDS.authorized }, patientCreationData({
      nombre: "Paciente con folio aportado",
      expedienteCognicion: "C1050-26",
      datosInstitucionales: { expedienteCognicion: "C1060-26" }
  }));
  const generated = await service.createProvisionalPatient(
    { uid: IDS.authorized },
    patientCreationData({ nombre: "Paciente posterior" })
  );

  assert.equal(first.expedienteCognicion, "C1031-26");
  assert.equal(generated.expedienteCognicion, "C1032-26");
  assert.equal(db.data(`usuarios/${first.id}`).expedienteCognicion, "C1031-26");
  assert.equal(
    db.data(`usuarios/${first.id}`).datosInstitucionales.expedienteCognicion,
    "C1031-26"
  );
  assert.equal(db.data(counterPath).ultimoConsecutivo, 1032);
});

test("dos altas concurrentes por el quinto cupo producen un solo paciente y un solo incremento", async () => {
  const initialCount = FREE_PATIENT_LIMIT - 1;
  const db = new FakeFirestore({
    [`usuarios/${IDS.free}`]: freeProfessional({ pacientesEnCuenta: initialCount }),
    ...quotaRecords(IDS.free, initialCount)
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  const results = await Promise.allSettled([
    service.createProvisionalPatient(
      { uid: IDS.free },
      patientCreationData({ nombre: "Paciente concurrente A" })
    ),
    service.createProvisionalPatient(
      { uid: IDS.free },
      patientCreationData({ nombre: "Paciente concurrente B" })
    )
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assertErrorCode("resource-exhausted", ProfessionalPatientQuotaError)(rejected[0].reason);
  assert.equal(db.data(`usuarios/${IDS.free}`).pacientesEnCuenta, FREE_PATIENT_LIMIT);
  assert.equal(
    db.paths(`usuarios/${IDS.free}/patientQuotaAssignments/`).length,
    FREE_PATIENT_LIMIT
  );

  const successfulPatientUid = fulfilled[0].value.id;
  assert.ok(db.data(`usuarios/${successfulPatientUid}`));
  assert.ok(db.data(quotaAssignmentPath(IDS.free, successfulPatientUid)));
  const failedPatientUid = successfulPatientUid === "pacienteAuto0001"
    ? "pacienteAuto0002"
    : "pacienteAuto0001";
  assert.equal(db.data(`usuarios/${failedPatientUid}`), undefined);
});

test("las cuentas registradas con código y las cuentas legadas permanecen ilimitadas", async () => {
  const db = new FakeFirestore({
    [`usuarios/${IDS.authorized}`]: {
      nombre: "Profesional autorizado",
      rol: "medico",
      tieneCuenta: true,
      modalidadRegistroProfesional: PROFESSIONAL_REGISTRATION_MODES.AUTHORIZATION_CODE,
      planCuentaProfesional: AUTHORIZED_PROFESSIONAL_PLAN,
      limitePacientes: null,
      pacientesEnCuenta: FREE_PATIENT_LIMIT
    },
    [`usuarios/${IDS.legacy}`]: {
      nombre: "Profesional legado",
      rol: "psicologo",
      tieneCuenta: true,
      pacientesEnCuenta: FREE_PATIENT_LIMIT
    }
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  for (const professionalUid of [IDS.authorized, IDS.legacy]) {
    for (let index = 1; index <= FREE_PATIENT_LIMIT + 1; index += 1) {
      const result = await service.createProvisionalPatient(
        { uid: professionalUid },
        patientCreationData({ nombre: `Paciente ilimitado ${professionalUid} ${index}` })
      );
      assert.deepEqual(result.quota, { current: null, limit: null });
      assert.equal(db.data(quotaAssignmentPath(professionalUid, result.id)), undefined);
    }
    assert.equal(db.data(`usuarios/${professionalUid}`).pacientesEnCuenta, FREE_PATIENT_LIMIT);
    assert.equal(db.paths(`usuarios/${professionalUid}/patientQuotaAssignments/`).length, 0);
  }
});

test("el registro de paciente por correo conserva el perfil paciente y sus permisos mientras consume un cupo médico", async () => {
  const doctorEmail = "medico@example.invalid";
  const patientEmail = "paciente@example.invalid";
  const preservedPermissionPath = `usuarios/${IDS.patient}/permisosMedicos/profesionalPrevio`;
  const db = new FakeFirestore({
    [`usuarios/${IDS.free}`]: freeProfessional({ email: doctorEmail }),
    [`usuarios/${IDS.patient}`]: patientProfile({
      nombre: "Nombre previo",
      email: patientEmail,
      preferencias: { recordatorios: true }
    }),
    [preservedPermissionPath]: {
      lectura: true,
      rolPermiso: "colaborador",
      otorgadoPor: "profesionalPrevio"
    }
  });
  const authAdmin = fakeAuthDirectory({
    [doctorEmail]: { email: doctorEmail, emailVerified: true, uid: IDS.free }
  });
  const service = createProfessionalPatientAccessService({ authAdmin, db, now: fixedClock });

  const result = await service.registerPatientProfile({
    uid: IDS.patient,
    token: { email: patientEmail }
  }, {
    aceptaAviso: true,
    aceptaBeta: true,
    nombre: "Nombre enviado de nuevo",
    correoMedico: doctorEmail,
    rol: "admin"
  });

  assert.deepEqual(result, {
    alreadyRegistered: true,
    medicoUid: IDS.free,
    pacienteUid: IDS.patient,
    quota: { current: 1, limit: FREE_PATIENT_LIMIT }
  });
  const storedPatient = db.data(`usuarios/${IDS.patient}`);
  assert.equal(storedPatient.nombre, "Nombre previo");
  assert.equal(storedPatient.email, patientEmail);
  assert.equal(storedPatient.rol, "paciente");
  assert.equal(storedPatient.tieneCuenta, true);
  assert.equal(storedPatient.creadoPor, IDS.free);
  assert.equal(storedPatient.medicoTratanteUid, IDS.free);
  assert.equal(storedPatient.expedienteCognicion, "C1000-26");
  assert.equal(storedPatient.datosInstitucionales.expedienteCognicion, "C1000-26");
  assert.equal(db.data(patientFolioCounterPath("26")).ultimoConsecutivo, 1000);
  assert.deepEqual(storedPatient.preferencias, { recordatorios: true });
  assert.deepEqual(db.data(preservedPermissionPath), {
    lectura: true,
    rolPermiso: "colaborador",
    otorgadoPor: "profesionalPrevio"
  });
  assert.deepEqual(db.data(`usuarios/${IDS.patient}/permisosMedicos/${IDS.free}`), {
    lectura: true,
    agregarNotas: true,
    editarPaciente: true,
    administrarPermisos: true,
    rolPermiso: "tratante",
    fechaOtorgamiento: fixedClock().toISOString(),
    otorgadoPor: IDS.patient
  });
  assert.equal(db.data(`usuarios/${IDS.free}`).pacientesEnCuenta, 1);
  assert.deepEqual(db.data(quotaAssignmentPath(IDS.free, IDS.patient)), {
    professionalUid: IDS.free,
    patientUid: IDS.patient,
    estado: "activo",
    origen: "registro_paciente",
    fechaAsignacion: fixedClock().toISOString()
  });
});

test("dos registros de paciente concurrentes reciben folios server-side distintos", async () => {
  const db = new FakeFirestore();
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  await Promise.all([
    service.registerPatientProfile({
      uid: IDS.patient,
      token: { email: "paciente-uno@example.invalid" }
    }, {
      aceptaAviso: true,
      aceptaBeta: true,
      nombre: "Paciente uno",
      usaCodigoVinculacion: true
    }),
    service.registerPatientProfile({
      uid: IDS.patientOther,
      token: { email: "paciente-dos@example.invalid" }
    }, {
      aceptaAviso: true,
      aceptaBeta: true,
      nombre: "Paciente dos",
      usaCodigoVinculacion: true
    })
  ]);

  const folios = [IDS.patient, IDS.patientOther]
    .map((patientUid) => db.data(`usuarios/${patientUid}`).expedienteCognicion)
    .sort();
  assert.deepEqual(folios, ["C1000-26", "C1001-26"]);
  for (const patientUid of [IDS.patient, IDS.patientOther]) {
    const profile = db.data(`usuarios/${patientUid}`);
    assert.equal(profile.datosInstitucionales.expedienteCognicion, profile.expedienteCognicion);
  }
  assert.equal(db.data(patientFolioCounterPath("26")).ultimoConsecutivo, 1001);
});

test("el registro por correo usa el UID canónico de Auth e ignora un perfil que suplanta ese email", async () => {
  const doctorEmail = "medico-canonico@example.invalid";
  const patientEmail = "paciente-nuevo@example.invalid";
  const impersonatorUid = IDS.authorized;
  const db = new FakeFirestore({
    [`usuarios/${IDS.free}`]: freeProfessional({ email: "correo-anterior@example.invalid" }),
    [`usuarios/${impersonatorUid}`]: freeProfessional({
      email: doctorEmail,
      nombre: "Perfil que suplanta correo"
    })
  });
  const authAdmin = fakeAuthDirectory({
    [doctorEmail]: { email: doctorEmail, emailVerified: true, uid: IDS.free }
  });
  const service = createProfessionalPatientAccessService({ authAdmin, db, now: fixedClock });

  const result = await service.registerPatientProfile({
    uid: IDS.patient,
    token: { email: patientEmail }
  }, {
    aceptaAviso: true,
    aceptaBeta: true,
    correoMedico: doctorEmail,
    medicoUid: impersonatorUid,
    nombre: "Paciente nuevo"
  });

  assert.equal(result.medicoUid, IDS.free);
  assert.equal(db.data(`usuarios/${IDS.patient}`).medicoTratanteUid, IDS.free);
  assert.equal(db.data(`usuarios/${IDS.free}`).pacientesEnCuenta, 1);
  assert.equal(db.data(`usuarios/${impersonatorUid}`).pacientesEnCuenta, 0);
  assert.ok(db.data(quotaAssignmentPath(IDS.free, IDS.patient)));
  assert.equal(db.data(quotaAssignmentPath(impersonatorUid, IDS.patient)), undefined);
  assert.ok(db.data(`usuarios/${IDS.patient}/permisosMedicos/${IDS.free}`));
  assert.equal(db.data(`usuarios/${IDS.patient}/permisosMedicos/${impersonatorUid}`), undefined);
});

test("el registro de paciente no modifica un expediente reservado por una vinculación", async () => {
  const doctorEmail = "medico@example.invalid";
  const patientEmail = "paciente@example.invalid";
  const db = new FakeFirestore({
    [`usuarios/${IDS.free}`]: freeProfessional({ email: doctorEmail }),
    [`usuarios/${IDS.patient}`]: patientProfile({
      email: patientEmail,
      vinculacionReservaEstado: "reservado",
      vinculacionReservaCodigo: "COG-ABCD-EFGH"
    })
  });
  const authAdmin = fakeAuthDirectory({
    [doctorEmail]: { email: doctorEmail, emailVerified: true, uid: IDS.free }
  });
  const service = createProfessionalPatientAccessService({ authAdmin, db, now: fixedClock });

  await assert.rejects(
    service.registerPatientProfile({
      uid: IDS.patient,
      token: { email: patientEmail }
    }, {
      aceptaAviso: true,
      aceptaBeta: true,
      nombre: "Paciente reservado",
      correoMedico: doctorEmail
    }),
    assertErrorCode("failed-precondition")
  );

  assert.equal(db.data(`usuarios/${IDS.free}`).pacientesEnCuenta, 0);
  assert.equal(db.data(quotaAssignmentPath(IDS.free, IDS.patient)), undefined);
  assert.equal(db.data(`usuarios/${IDS.patient}/permisosMedicos/${IDS.free}`), undefined);
  assert.equal(db.data(`usuarios/${IDS.patient}`).vinculacionReservaEstado, "reservado");
});

test("una cuenta de paciente marcada para eliminación no puede recrear su perfil", async () => {
  const db = new FakeFirestore({
    [`accountDeletionTombstones/${IDS.patient}`]: {
      accountType: "paciente",
      accountUid: IDS.patient,
      deletionState: "in_progress"
    }
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  await assert.rejects(
    service.registerPatientProfile({
      uid: IDS.patient,
      token: { email: "paciente@example.invalid" }
    }, {
      aceptaAviso: true,
      aceptaBeta: true,
      nombre: "Paciente en eliminación",
      usaCodigoVinculacion: true
    }),
    assertErrorCode("failed-precondition")
  );
  assert.equal(db.data(`usuarios/${IDS.patient}`), undefined);
});

test("un profesional marcado para eliminación no puede crear pacientes ni cambiar permisos", async () => {
  const db = new FakeFirestore({
    [`usuarios/${IDS.free}`]: freeProfessional(),
    [`usuarios/${IDS.patient}`]: patientProfile({ creadoPor: IDS.free }),
    [`accountDeletionTombstones/${IDS.free}`]: {
      accountType: "profesional",
      accountUid: IDS.free,
      deletionState: "in_progress"
    }
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  await assert.rejects(
    service.createProvisionalPatient(
      { uid: IDS.free },
      patientCreationData({ nombre: "Alta residual" })
    ),
    assertErrorCode("failed-precondition")
  );
  await assert.rejects(
    service.managePatientPermission({ uid: IDS.free }, {
      accion: "otorgar",
      pacienteId: IDS.patient,
      profesionalUid: IDS.free,
      tipoPermiso: "tratante"
    }),
    assertErrorCode("failed-precondition")
  );

  assert.equal(db.data(`usuarios/${IDS.free}`).pacientesEnCuenta, 0);
  assert.equal(db.paths(`usuarios/${IDS.free}/patientQuotaAssignments/`).length, 0);
});

test("otorgar y actualizar un permiso no duplica el cupo; revocarlo lo libera para otro paciente", async () => {
  const initialCount = FREE_PATIENT_LIMIT - 1;
  const db = new FakeFirestore({
    [`usuarios/${IDS.target}`]: freeProfessional({
      nombre: "Profesional de destino",
      email: "destino@example.invalid",
      pacientesEnCuenta: initialCount
    }),
    [`usuarios/${IDS.patient}`]: patientProfile({ ownerUid: "profesionalPropietario" }),
    [`usuarios/${IDS.patientOther}`]: patientProfile({ ownerUid: "profesionalPropietario" }),
    ...quotaRecords(IDS.target, initialCount)
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  const granted = await service.managePatientPermission({ uid: IDS.patient }, {
    accion: "otorgar",
    pacienteId: IDS.patient,
    profesionalUid: IDS.target,
    tipoPermiso: "tratante"
  });
  assert.deepEqual(granted.quota, { current: FREE_PATIENT_LIMIT, limit: FREE_PATIENT_LIMIT });
  assert.equal(db.data(`usuarios/${IDS.target}`).pacientesEnCuenta, FREE_PATIENT_LIMIT);
  assert.ok(db.data(quotaAssignmentPath(IDS.target, IDS.patient)));

  await service.managePatientPermission({ uid: IDS.patient }, {
    accion: "actualizar",
    pacienteId: IDS.patient,
    profesionalUid: IDS.target,
    tipoPermiso: "colaborador"
  });
  assert.equal(db.data(`usuarios/${IDS.target}`).pacientesEnCuenta, FREE_PATIENT_LIMIT);
  assert.equal(
    db.data(`usuarios/${IDS.patient}/permisosMedicos/${IDS.target}`).rolPermiso,
    "colaborador"
  );

  await assert.rejects(
    service.managePatientPermission({ uid: IDS.patientOther }, {
      accion: "otorgar",
      pacienteId: IDS.patientOther,
      profesionalUid: IDS.target,
      tipoPermiso: "estudiante"
    }),
    assertErrorCode("resource-exhausted", ProfessionalPatientQuotaError)
  );
  assert.equal(
    db.data(`usuarios/${IDS.patientOther}/permisosMedicos/${IDS.target}`),
    undefined
  );

  await service.managePatientPermission({ uid: IDS.patient }, {
    accion: "revocar",
    pacienteId: IDS.patient,
    profesionalUid: IDS.target
  });
  assert.equal(db.data(`usuarios/${IDS.target}`).pacientesEnCuenta, initialCount);
  assert.equal(db.data(quotaAssignmentPath(IDS.target, IDS.patient)), undefined);
  assert.equal(db.data(`usuarios/${IDS.patient}/permisosMedicos/${IDS.target}`), undefined);

  const replacement = await service.managePatientPermission({ uid: IDS.patientOther }, {
    accion: "otorgar",
    pacienteId: IDS.patientOther,
    profesionalUid: IDS.target,
    tipoPermiso: "estudiante"
  });
  assert.deepEqual(replacement.quota, { current: FREE_PATIENT_LIMIT, limit: FREE_PATIENT_LIMIT });
  assert.equal(db.data(`usuarios/${IDS.target}`).pacientesEnCuenta, FREE_PATIENT_LIMIT);
  assert.ok(db.data(quotaAssignmentPath(IDS.target, IDS.patientOther)));
});

test("actualizar un permiso elimina flags embebidos legacy para que no prevalezcan sobre el subdocumento", async () => {
  const otherProfessionalUid = "profesionalLegacyOtro";
  const permissionPath = `usuarios/${IDS.patient}/permisosMedicos/${IDS.target}`;
  const db = new FakeFirestore({
    [`usuarios/${IDS.target}`]: freeProfessional({ pacientesEnCuenta: 1 }),
    [`usuarios/${IDS.patient}`]: patientProfile({
      permisosMedicos: {
        [IDS.target]: {
          administrarPermisos: true,
          agregarNotas: true,
          editarPaciente: true,
          lectura: true,
          rolPermiso: "tratante"
        },
        [otherProfessionalUid]: { lectura: true }
      },
      permisos: {
        [IDS.target]: { editarPaciente: true, lectura: true },
        [otherProfessionalUid]: { lectura: true }
      }
    }),
    [permissionPath]: {
      administrarPermisos: true,
      agregarNotas: true,
      editarPaciente: true,
      lectura: true,
      rolPermiso: "tratante"
    },
    [quotaAssignmentPath(IDS.target, IDS.patient)]: assignment(IDS.target, IDS.patient)
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  await service.managePatientPermission({ uid: IDS.patient }, {
    accion: "actualizar",
    pacienteId: IDS.patient,
    profesionalUid: IDS.target,
    tipoPermiso: "estudiante"
  });

  const patient = db.data(`usuarios/${IDS.patient}`);
  assert.equal(patient.permisosMedicos[IDS.target], undefined);
  assert.equal(patient.permisos[IDS.target], undefined);
  assert.deepEqual(patient.permisosMedicos[otherProfessionalUid], { lectura: true });
  assert.deepEqual(patient.permisos[otherProfessionalUid], { lectura: true });
  assert.deepEqual(db.data(permissionPath), {
    administrarPermisos: false,
    agregarNotas: false,
    editarPaciente: false,
    lectura: true,
    rolPermiso: "estudiante",
    fechaOtorgamiento: fixedClock().toISOString(),
    otorgadoPor: IDS.patient,
    fechaModificacion: fixedClock().toISOString(),
    modificadoPor: IDS.patient
  });
  assert.equal(db.data(`usuarios/${IDS.target}`).pacientesEnCuenta, 1);
});

test("otorgar por correo usa el UID canónico de Auth e ignora un UID cliente suplantado", async () => {
  const targetEmail = "destino-canonico@example.invalid";
  const impersonatorUid = IDS.authorized;
  const db = new FakeFirestore({
    [`usuarios/${IDS.target}`]: freeProfessional({
      email: "correo-anterior@example.invalid",
      nombre: "Profesional canónico"
    }),
    [`usuarios/${impersonatorUid}`]: freeProfessional({
      email: targetEmail,
      nombre: "Perfil que suplanta el correo"
    }),
    [`usuarios/${IDS.patient}`]: patientProfile()
  });
  const authAdmin = fakeAuthDirectory({
    [targetEmail]: { email: targetEmail, emailVerified: true, uid: IDS.target }
  });
  const service = createProfessionalPatientAccessService({ authAdmin, db, now: fixedClock });

  const result = await service.managePatientPermission({ uid: IDS.patient }, {
    accion: "otorgar",
    pacienteId: IDS.patient,
    profesionalCorreo: targetEmail,
    profesionalUid: impersonatorUid,
    tipoPermiso: "colaborador"
  });

  assert.equal(result.professionalUid, IDS.target);
  assert.equal(db.data(`usuarios/${IDS.target}`).pacientesEnCuenta, 1);
  assert.equal(db.data(`usuarios/${impersonatorUid}`).pacientesEnCuenta, 0);
  assert.ok(db.data(quotaAssignmentPath(IDS.target, IDS.patient)));
  assert.equal(db.data(quotaAssignmentPath(impersonatorUid, IDS.patient)), undefined);
  assert.equal(
    db.data(`usuarios/${IDS.patient}/permisosMedicos/${IDS.target}`).rolPermiso,
    "colaborador"
  );
  assert.equal(
    db.data(`usuarios/${IDS.patient}/permisosMedicos/${impersonatorUid}`),
    undefined
  );
});

test("un correo profesional no verificado no puede recibir pacientes ni permisos", async () => {
  const targetEmail = "destino-no-verificado@example.invalid";
  const db = new FakeFirestore({
    [`usuarios/${IDS.target}`]: freeProfessional({ email: targetEmail }),
    [`usuarios/${IDS.patient}`]: patientProfile()
  });
  const authAdmin = fakeAuthDirectory({
    [targetEmail]: { email: targetEmail, emailVerified: false, uid: IDS.target }
  });
  const service = createProfessionalPatientAccessService({ authAdmin, db, now: fixedClock });

  await assert.rejects(
    service.managePatientPermission({ uid: IDS.patient }, {
      accion: "otorgar",
      pacienteId: IDS.patient,
      profesionalCorreo: targetEmail,
      tipoPermiso: "colaborador"
    }),
    assertErrorCode("failed-precondition")
  );
  await assert.rejects(
    service.registerPatientProfile({
      uid: IDS.patient,
      token: { email: "paciente@example.invalid" }
    }, {
      aceptaAviso: true,
      aceptaBeta: true,
      correoMedico: targetEmail,
      nombre: "Paciente"
    }),
    assertErrorCode("failed-precondition")
  );
  assert.equal(db.data(quotaAssignmentPath(IDS.target, IDS.patient)), undefined);
  assert.equal(db.data(`usuarios/${IDS.patient}/permisosMedicos/${IDS.target}`), undefined);
});

test("un profesional listado solo como colaborador no puede administrar permisos", async () => {
  const db = new FakeFirestore({
    [`usuarios/${IDS.authorized}`]: {
      nombre: "Colaborador legado",
      rol: "medico",
      tieneCuenta: true,
      planCuentaProfesional: AUTHORIZED_PROFESSIONAL_PLAN
    },
    [`usuarios/${IDS.free}`]: freeProfessional(),
    [`usuarios/${IDS.patient}`]: patientProfile({
      ownerUid: "profesionalPropietario",
      medicosAutorizados: [IDS.authorized]
    })
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  await assert.rejects(
    service.managePatientPermission({ uid: IDS.authorized }, {
      accion: "otorgar",
      pacienteId: IDS.patient,
      profesionalUid: IDS.free,
      tipoPermiso: "estudiante"
    }),
    assertErrorCode("permission-denied")
  );

  assert.equal(
    db.data(`usuarios/${IDS.patient}/permisosMedicos/${IDS.free}`),
    undefined
  );
  assert.equal(db.data(quotaAssignmentPath(IDS.free, IDS.patient)), undefined);
});

test("un permiso embebido legacy con administrarPermisos conserva la facultad de compartir", async () => {
  const db = new FakeFirestore({
    [`usuarios/${IDS.authorized}`]: {
      nombre: "Tratante legado",
      rol: "medico",
      tieneCuenta: true,
      planCuentaProfesional: AUTHORIZED_PROFESSIONAL_PLAN
    },
    [`usuarios/${IDS.free}`]: freeProfessional(),
    [`usuarios/${IDS.patient}`]: patientProfile({
      ownerUid: "profesionalPropietario",
      permisosMedicos: {
        [IDS.authorized]: {
          administrarPermisos: true,
          agregarNotas: true,
          editarPaciente: true,
          lectura: true,
          rolPermiso: "tratante"
        }
      }
    })
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  const result = await service.managePatientPermission({ uid: IDS.authorized }, {
    accion: "otorgar",
    pacienteId: IDS.patient,
    profesionalUid: IDS.free,
    tipoPermiso: "estudiante"
  });

  assert.equal(result.professionalUid, IDS.free);
  assert.equal(db.data(`usuarios/${IDS.patient}`).permisosMedicos[IDS.authorized].administrarPermisos, true);
  assert.equal(
    db.data(`usuarios/${IDS.patient}/permisosMedicos/${IDS.free}`).rolPermiso,
    "estudiante"
  );
  assert.ok(db.data(quotaAssignmentPath(IDS.free, IDS.patient)));
  assert.equal(db.data(`usuarios/${IDS.free}`).pacientesEnCuenta, 1);
});

test("un profesional principal no puede degradarse sin reasignar antes la relación directa", async () => {
  const permissionPath = `usuarios/${IDS.patient}/permisosMedicos/${IDS.target}`;
  const db = new FakeFirestore({
    [`usuarios/${IDS.target}`]: freeProfessional({ pacientesEnCuenta: 1 }),
    [`usuarios/${IDS.patient}`]: patientProfile({
      creadoPor: IDS.target,
      medicoTratanteUid: IDS.target
    }),
    [permissionPath]: {
      administrarPermisos: true,
      agregarNotas: true,
      editarPaciente: true,
      lectura: true,
      rolPermiso: "tratante"
    },
    [quotaAssignmentPath(IDS.target, IDS.patient)]: assignment(IDS.target, IDS.patient)
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  for (const accion of ["actualizar", "otorgar"]) {
    await assert.rejects(
      service.managePatientPermission({ uid: IDS.patient }, {
        accion,
        pacienteId: IDS.patient,
        profesionalUid: IDS.target,
        tipoPermiso: "colaborador"
      }),
      assertErrorCode("failed-precondition")
    );
  }

  assert.equal(db.data(`usuarios/${IDS.patient}`).medicoTratanteUid, IDS.target);
  assert.equal(db.data(permissionPath).rolPermiso, "tratante");
  assert.ok(db.data(quotaAssignmentPath(IDS.target, IDS.patient)));
});

test("la eliminación definitiva libera los slots del paciente para todos los profesionales gratuitos", async () => {
  const secondProfessionalUid = "profesionalGratisDos";
  const db = new FakeFirestore({
    [`usuarios/${IDS.free}`]: freeProfessional({ pacientesEnCuenta: 1 }),
    [`usuarios/${secondProfessionalUid}`]: freeProfessional({ pacientesEnCuenta: 1 }),
    [quotaAssignmentPath(IDS.free, IDS.patient)]: assignment(IDS.free, IDS.patient),
    [quotaAssignmentPath(secondProfessionalUid, IDS.patient)]: assignment(secondProfessionalUid, IDS.patient)
  });

  const result = await releasePatientSlotsForPatient({ db, patientUid: IDS.patient });

  assert.deepEqual(result, { released: 2 });
  assert.equal(db.data(`usuarios/${IDS.free}`).pacientesEnCuenta, 0);
  assert.equal(db.data(`usuarios/${secondProfessionalUid}`).pacientesEnCuenta, 0);
  assert.equal(db.data(quotaAssignmentPath(IDS.free, IDS.patient)), undefined);
  assert.equal(db.data(quotaAssignmentPath(secondProfessionalUid, IDS.patient)), undefined);
});

test("un profesional puede renunciar a su acceso y la revocación limpia relaciones directas y libera su cupo", async () => {
  const permissionPath = `usuarios/${IDS.patient}/permisosMedicos/${IDS.target}`;
  const db = new FakeFirestore({
    [`usuarios/${IDS.target}`]: freeProfessional({ pacientesEnCuenta: 1 }),
    [`usuarios/${IDS.patient}`]: patientProfile({
      creadoPor: IDS.target,
      medicoTratanteUid: IDS.target,
      medicoTratante: "Profesional de destino",
      medicosAutorizados: [IDS.target]
    }),
    [permissionPath]: {
      lectura: true,
      administrarPermisos: false,
      rolPermiso: "colaborador"
    },
    [quotaAssignmentPath(IDS.target, IDS.patient)]: assignment(IDS.target, IDS.patient)
  });
  const service = createProfessionalPatientAccessService({ db, now: fixedClock });

  const result = await service.managePatientPermission({ uid: IDS.target }, {
    accion: "revocar",
    pacienteId: IDS.patient,
    profesionalUid: IDS.target
  });

  assert.deepEqual(result.quota, { current: 0, limited: true, limit: FREE_PATIENT_LIMIT });
  const patient = db.data(`usuarios/${IDS.patient}`);
  assert.equal(patient.creadoPor, "");
  assert.equal(patient.medicoTratanteUid, "");
  assert.equal(patient.medicoTratante, "");
  assert.deepEqual(patient.medicosAutorizados, []);
  assert.equal(db.data(permissionPath), undefined);
  assert.equal(db.data(quotaAssignmentPath(IDS.target, IDS.patient)), undefined);
  assert.equal(db.data(`usuarios/${IDS.target}`).pacientesEnCuenta, 0);
});

test("las callables conservan los códigos de validación compartidos con la vinculación", () => {
  for (const code of ["unauthenticated", "invalid-argument", "failed-precondition"]) {
    const converted = toHttpsError(new AccountLinkingError(code, `error ${code}`), "prueba");
    assert.equal(converted.code, code);
    assert.equal(converted.message, `error ${code}`);
  }
});

test("los permisos no cambian durante una vinculación ni desde el expediente ya vinculado", async () => {
  for (const patientPatch of [
    { vinculacionReservaEstado: "reservado" },
    { estado: "vinculado", vinculadoA: IDS.patientOther }
  ]) {
    const db = new FakeFirestore({
      [`usuarios/${IDS.patient}`]: patientProfile(patientPatch),
      [`usuarios/${IDS.target}`]: freeProfessional({ pacientesEnCuenta: 0 })
    });
    const service = createProfessionalPatientAccessService({ db, now: fixedClock });

    await assert.rejects(
      service.managePatientPermission({ uid: IDS.patient }, {
        accion: "otorgar",
        pacienteId: IDS.patient,
        profesionalUid: IDS.target,
        tipoPermiso: "colaborador"
      }),
      assertErrorCode("failed-precondition")
    );
    assert.equal(db.data(`usuarios/${IDS.patient}/permisosMedicos/${IDS.target}`), undefined);
    assert.equal(db.data(quotaAssignmentPath(IDS.target, IDS.patient)), undefined);
  }
});
