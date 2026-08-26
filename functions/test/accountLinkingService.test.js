"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ACCOUNT_LINKING_ACTIONS } = require("../accountLinking/config");
const { createAccountLinkingService } = require("../accountLinking/service");
const { patientAllowsProfessionalAccess } = require("../accountLinking/validation");
const { quotaAssignmentPath } = require("../accountSecurity/professionalPatientQuota");

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

class FakeSnapshot {
  constructor(reference, value) {
    this.ref = reference;
    this.id = reference.path.split("/").at(-1);
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

  set(value, options = {}) {
    this.database.write(this.path, value, options.merge === true);
    return Promise.resolve();
  }

  update(value) {
    this.database.update(this.path, value);
    return Promise.resolve();
  }
}

class FakeCollectionReference {
  constructor(database, path) {
    this.database = database;
    this.path = path;
  }

  get() {
    const prefix = `${this.path}/`;
    const docs = [...this.database.records.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, value]) => new FakeSnapshot(new FakeDocumentReference(this.database, path), value));
    return Promise.resolve({ docs, empty: docs.length === 0, size: docs.length });
  }
}

class FakeTransaction {
  constructor(database, records) {
    this.database = database;
    this.records = records;
  }

  get(reference) {
    return Promise.resolve(new FakeSnapshot(reference, this.records.get(reference.path)));
  }

  create(reference, value) {
    if (this.records.has(reference.path)) throw Object.assign(new Error("exists"), { code: 6 });
    this.records.set(reference.path, clone(value));
  }

  set(reference, value, options = {}) {
    const previous = options.merge === true ? this.records.get(reference.path) || {} : {};
    this.records.set(reference.path, { ...clone(previous), ...clone(value) });
  }

  update(reference, value) {
    if (!this.records.has(reference.path)) throw Object.assign(new Error("missing"), { code: 5 });
    this.records.set(reference.path, { ...clone(this.records.get(reference.path)), ...clone(value) });
  }

  delete(reference) {
    this.records.delete(reference.path);
  }
}

class FakeFirestore {
  constructor(initial = {}) {
    this.records = new Map(Object.entries(initial).map(([path, value]) => [path, clone(value)]));
    this.transactionTail = Promise.resolve();
  }

  doc(path) {
    return new FakeDocumentReference(this, path);
  }

  collection(path) {
    return new FakeCollectionReference(this, path);
  }

  snapshot(path) {
    return new FakeSnapshot(this.doc(path), this.records.get(path));
  }

  data(path) {
    return clone(this.records.get(path));
  }

  write(path, value, merge = false) {
    const previous = merge ? this.records.get(path) || {} : {};
    this.records.set(path, { ...clone(previous), ...clone(value) });
  }

  update(path, value) {
    if (!this.records.has(path)) throw new Error(`Missing ${path}`);
    this.write(path, value, true);
  }

  async runTransaction(callback) {
    let release;
    const previous = this.transactionTail;
    this.transactionTail = new Promise((resolve) => { release = resolve; });
    await previous;
    const working = new Map([...this.records.entries()].map(([path, value]) => [path, clone(value)]));
    try {
      const result = await callback(new FakeTransaction(this, working));
      this.records = working;
      return result;
    } finally {
      release();
    }
  }
}

const IDS = Object.freeze({
  doctor: "uidDoctor",
  doctorOther: "uidDoctorOther",
  intruderPatient: "uidIntruderPatient",
  patientAccount: "uidPatientAccount",
  patientOther: "uidPatientOther",
  provisional: "uidProvisional"
});

function baseRecords() {
  return {
    [`usuarios/${IDS.doctor}`]: { nombre: "Profesional", rol: "medico", tieneCuenta: true },
    [`usuarios/${IDS.doctorOther}`]: { nombre: "Otro profesional", rol: "medico", tieneCuenta: true },
    [`usuarios/${IDS.intruderPatient}`]: { rol: "paciente", tieneCuenta: true },
    [`usuarios/${IDS.patientAccount}`]: {
      email: "cuenta@example.invalid",
      nombre: "Nombre de cuenta",
      rol: "paciente",
      estado: "activo",
      tieneCuenta: true
    },
    [`usuarios/${IDS.patientOther}`]: { nombre: "Otra cuenta", rol: "paciente", estado: "activo", tieneCuenta: true },
    [`usuarios/${IDS.provisional}`]: {
      creadoPor: IDS.doctor,
      email: "provisional@example.invalid",
      estado: "provisional",
      medicosAutorizados: [IDS.doctor, IDS.intruderPatient],
      medicoTratanteUid: IDS.doctor,
      nombre: "Nombre provisional",
      rol: "paciente",
      tieneCuenta: false
    },
    [`usuarios/${IDS.provisional}/notas/n1`]: { texto: "dato" },
    [`usuarios/${IDS.provisional}/apuntesMedico/a1`]: { titulo: "apunte" },
    [`usuarios/${IDS.provisional}/permisosMedicos/${IDS.intruderPatient}`]: { lectura: true },
    [`pacientes/${IDS.provisional}/registrosDiarios/r1`]: { valor: 1 },
    [`pacientes/${IDS.provisional}/miSalud/metas`]: { objetivo: "dato" },
    [`pacientes/${IDS.provisional}/miSalud/agenda`]: { eventos: [1] }
  };
}

function fixedClock() {
  return new Date("2026-08-22T12:00:00.000Z");
}

function codeGenerator(...codes) {
  let index = 0;
  return () => codes[Math.min(index++, codes.length - 1)];
}

function assertErrorCode(expectedCode) {
  return (error) => {
    assert.equal(error.code, expectedCode);
    return true;
  };
}

test("la creación médico→paciente usa el UID autenticado e impide expedientes ajenos", async () => {
  const db = new FakeFirestore(baseRecords());
  const service = createAccountLinkingService({
    db,
    now: fixedClock,
    generateCode: codeGenerator("COG-AAAA-2222")
  });

  const response = await service.execute({ uid: IDS.doctor }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
    pacienteId: IDS.provisional,
    medicoUid: IDS.doctorOther
  });
  assert.equal(response.codigo, "COG-AAAA-2222");
  assert.deepEqual(db.data("codigosVinculacion/COG-AAAA-2222"), {
    codigo: "COG-AAAA-2222",
    usado: false,
    fechaCreacion: "2026-08-22T12:00:00.000Z",
    expiraEn: "2026-09-05T12:00:00.000Z",
    tipo: "medico_a_paciente",
    pacienteProvisionalId: IDS.provisional,
    pacienteNombre: "Nombre provisional",
    medicoUid: IDS.doctor,
    emitidoPorUid: IDS.doctor,
    versionSeguridad: 1,
    estadoProceso: "disponible"
  });
  assert.equal(db.data(`usuarios/${IDS.provisional}`).codigoVinculacionActivo, "COG-AAAA-2222");

  await assert.rejects(
    service.execute({ uid: IDS.doctorOther }, {
      accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
      pacienteId: IDS.provisional
    }),
    assertErrorCode("permission-denied")
  );
});

test("un colaborador de solo lectura o listado en arrays no puede crear ni consumir vínculos", async () => {
  const records = baseRecords();
  records[`usuarios/${IDS.provisional}`] = {
    ...records[`usuarios/${IDS.provisional}`],
    medicosAutorizados: [
      ...records[`usuarios/${IDS.provisional}`].medicosAutorizados,
      IDS.doctorOther
    ]
  };
  records[`usuarios/${IDS.provisional}/permisosMedicos/${IDS.doctorOther}`] = {
    administrarPermisos: false,
    lectura: true,
    rolPermiso: "colaborador"
  };
  const db = new FakeFirestore(records);
  const service = createAccountLinkingService({
    db,
    now: fixedClock,
    generateCode: codeGenerator("COG-WWWW-5555", "COG-XXXX-6666")
  });

  await assert.rejects(
    service.execute({ uid: IDS.doctorOther }, {
      accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
      pacienteId: IDS.provisional
    }),
    assertErrorCode("permission-denied")
  );
  assert.equal(db.data("codigosVinculacion/COG-WWWW-5555"), undefined);

  const patientCode = await service.execute({ uid: IDS.patientAccount }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_PATIENT_CODE
  });
  await assert.rejects(
    service.execute({ uid: IDS.doctorOther }, {
      accion: ACCOUNT_LINKING_ACTIONS.LINK_FROM_PATIENT_CODE,
      codigo: patientCode.codigo,
      expedienteProvisionalId: IDS.provisional
    }),
    assertErrorCode("permission-denied")
  );
  assert.equal(db.data(`codigosVinculacion/${patientCode.codigo}`).estadoProceso, "disponible");
  assert.equal(db.data(`usuarios/${IDS.provisional}`).vinculacionReservaEstado, undefined);
});

test("un profesional tratante directo puede crear y consumir vínculos", async () => {
  const directRecords = baseRecords();
  directRecords[`usuarios/${IDS.provisional}`] = {
    ...directRecords[`usuarios/${IDS.provisional}`],
    creadoPor: IDS.doctorOther,
    medicoTratanteUid: IDS.doctorOther
  };
  const creationDb = new FakeFirestore(directRecords);
  const creationService = createAccountLinkingService({
    db: creationDb,
    now: fixedClock,
    generateCode: codeGenerator("COG-YYYY-7777")
  });
  const doctorCode = await creationService.execute({ uid: IDS.doctorOther }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
    pacienteId: IDS.provisional
  });
  assert.equal(doctorCode.codigo, "COG-YYYY-7777");

  const linkingDb = new FakeFirestore(directRecords);
  const linkingService = createAccountLinkingService({
    db: linkingDb,
    now: fixedClock,
    generateCode: codeGenerator("COG-ZZZZ-8888")
  });
  const patientCode = await linkingService.execute({ uid: IDS.patientAccount }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_PATIENT_CODE
  });
  const linked = await linkingService.execute({ uid: IDS.doctorOther }, {
    accion: ACCOUNT_LINKING_ACTIONS.LINK_FROM_PATIENT_CODE,
    codigo: patientCode.codigo,
    expedienteProvisionalId: IDS.provisional
  });
  assert.equal(linked.pacienteUid, IDS.patientAccount);
  assert.equal(linkingDb.data(`codigosVinculacion/${patientCode.codigo}`).usadoPor, IDS.doctorOther);
});

test("un permiso explícito para administrar permite crear un vínculo sin relación directa", async () => {
  const records = baseRecords();
  records[`usuarios/${IDS.provisional}/permisosMedicos/${IDS.doctorOther}`] = {
    administrarPermisos: true,
    lectura: true,
    rolPermiso: "tratante"
  };
  const db = new FakeFirestore(records);
  const service = createAccountLinkingService({
    db,
    now: fixedClock,
    generateCode: codeGenerator("COG-2222-AAAA")
  });

  const response = await service.execute({ uid: IDS.doctorOther }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
    pacienteId: IDS.provisional
  });
  assert.equal(response.codigo, "COG-2222-AAAA");
});

test("la creación paciente→médico se vincula a request.auth y rechaza perfiles no paciente", async () => {
  const db = new FakeFirestore(baseRecords());
  const service = createAccountLinkingService({
    db,
    now: fixedClock,
    generateCode: codeGenerator("COG-BBBB-3333")
  });

  const response = await service.execute({ uid: IDS.patientAccount }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_PATIENT_CODE,
    pacienteUid: IDS.patientOther
  });
  assert.equal(response.codigo, "COG-BBBB-3333");
  const code = db.data("codigosVinculacion/COG-BBBB-3333");
  assert.equal(code.pacienteCuentaUid, IDS.patientAccount);
  assert.equal(code.emitidoPorUid, IDS.patientAccount);

  await assert.rejects(
    service.execute({ uid: IDS.doctor }, {
      accion: ACCOUNT_LINKING_ACTIONS.CREATE_PATIENT_CODE,
      pacienteUid: IDS.patientAccount
    }),
    assertErrorCode("failed-precondition")
  );
});

test("médico→paciente reserva, copia IDs estables, sanea privilegios y finaliza idempotentemente", async () => {
  const records = baseRecords();
  records[`usuarios/${IDS.doctor}`] = {
    ...records[`usuarios/${IDS.doctor}`],
    modalidadRegistroProfesional: "gratuita",
    planCuentaProfesional: "profesional_gratuito",
    limitePacientes: 5,
    pacientesEnCuenta: 1
  };
  records[quotaAssignmentPath(IDS.doctor, IDS.provisional)] = {
    professionalUid: IDS.doctor,
    patientUid: IDS.provisional,
    estado: "activo",
    origen: "alta_profesional"
  };
  records[`usuarios/${IDS.doctorOther}`] = {
    ...records[`usuarios/${IDS.doctorOther}`],
    modalidadRegistroProfesional: "gratuita",
    planCuentaProfesional: "profesional_gratuito",
    limitePacientes: 5,
    pacientesEnCuenta: 1
  };
  records[`usuarios/${IDS.provisional}/permisosMedicos/${IDS.doctorOther}`] = {
    lectura: true,
    agregarNotas: true,
    editarPaciente: false,
    administrarPermisos: false,
    rolPermiso: "colaborador"
  };
  records[quotaAssignmentPath(IDS.doctorOther, IDS.provisional)] = {
    professionalUid: IDS.doctorOther,
    patientUid: IDS.provisional,
    estado: "activo",
    origen: "permiso_compartido"
  };
  const db = new FakeFirestore(records);
  const service = createAccountLinkingService({
    db,
    now: fixedClock,
    generateCode: codeGenerator("COG-CCCC-4444")
  });
  const created = await service.execute({ uid: IDS.doctor }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
    pacienteId: IDS.provisional
  });

  const payload = {
    accion: ACCOUNT_LINKING_ACTIONS.LINK_FROM_DOCTOR_CODE,
    codigo: created.codigo,
    cuentaPacienteUid: IDS.patientOther
  };
  const first = await service.execute({ uid: IDS.patientAccount }, payload);
  const second = await service.execute({ uid: IDS.patientAccount }, payload);

  assert.deepEqual(second, first);
  assert.equal(first.pacienteUid, IDS.patientAccount);
  assert.equal(first.expedientePrevioUid, IDS.provisional);
  assert.equal(first.medicoUid, IDS.doctor);
  assert.deepEqual(db.data(`usuarios/${IDS.patientAccount}/notas/n1`), { texto: "dato" });
  assert.deepEqual(db.data(`usuarios/${IDS.patientAccount}/apuntesMedico/a1`), { titulo: "apunte" });
  assert.deepEqual(db.data(`pacientes/${IDS.patientAccount}/registrosDiarios/r1`), { valor: 1 });
  assert.deepEqual(db.data(`pacientes/${IDS.patientAccount}/miSalud/metas`), { objetivo: "dato" });
  assert.deepEqual(db.data(`pacientes/${IDS.patientAccount}/miSalud/agenda`), { eventos: [1] });

  const destination = db.data(`usuarios/${IDS.patientAccount}`);
  assert.equal(destination.admin, undefined, "un expediente provisional no puede elevar privilegios");
  assert.equal(destination.email, "cuenta@example.invalid", "la identidad de la cuenta prevalece");
  assert.deepEqual(destination.medicosAutorizados, [IDS.doctor]);
  assert.equal(db.data(`usuarios/${IDS.patientAccount}/permisosMedicos/${IDS.intruderPatient}`), undefined);
  assert.equal(db.data(`usuarios/${IDS.patientAccount}/permisosMedicos/${IDS.doctor}`).lectura, true);
  assert.deepEqual({
    administrarPermisos: db.data(`usuarios/${IDS.patientAccount}/permisosMedicos/${IDS.doctorOther}`).administrarPermisos,
    agregarNotas: db.data(`usuarios/${IDS.patientAccount}/permisosMedicos/${IDS.doctorOther}`).agregarNotas,
    editarPaciente: db.data(`usuarios/${IDS.patientAccount}/permisosMedicos/${IDS.doctorOther}`).editarPaciente,
    lectura: db.data(`usuarios/${IDS.patientAccount}/permisosMedicos/${IDS.doctorOther}`).lectura,
    rolPermiso: db.data(`usuarios/${IDS.patientAccount}/permisosMedicos/${IDS.doctorOther}`).rolPermiso
  }, {
    administrarPermisos: false,
    agregarNotas: true,
    editarPaciente: false,
    lectura: true,
    rolPermiso: "colaborador"
  });
  const linkedOrigin = db.data(`usuarios/${IDS.provisional}`);
  assert.deepEqual(linkedOrigin.vinculadoA, IDS.patientAccount);
  assert.equal(linkedOrigin.creadoPor, "");
  assert.equal(linkedOrigin.medicoTratanteUid, "");
  assert.deepEqual(linkedOrigin.medicosAutorizados, []);
  assert.equal(linkedOrigin.accesoRetiradoTrasVinculacion, true);
  assert.equal(patientAllowsProfessionalAccess(linkedOrigin, IDS.doctor, { lectura: true }), false);
  assert.equal(db.data(`usuarios/${IDS.provisional}/permisosMedicos/${IDS.doctorOther}`), undefined);
  assert.equal(db.data(`usuarios/${IDS.provisional}/permisosMedicos/${IDS.intruderPatient}`), undefined);
  assert.equal(db.data(`usuarios/${IDS.doctor}`).pacientesEnCuenta, 1);
  assert.equal(db.data(quotaAssignmentPath(IDS.doctor, IDS.provisional)), undefined);
  assert.equal(db.data(quotaAssignmentPath(IDS.doctor, IDS.patientAccount)).patientUid, IDS.patientAccount);
  assert.equal(db.data(`usuarios/${IDS.doctorOther}`).pacientesEnCuenta, 1);
  assert.equal(db.data(quotaAssignmentPath(IDS.doctorOther, IDS.provisional)), undefined);
  assert.equal(db.data(quotaAssignmentPath(IDS.doctorOther, IDS.patientAccount)).patientUid, IDS.patientAccount);

  const code = db.data(`codigosVinculacion/${created.codigo}`);
  assert.equal(code.usado, true);
  assert.equal(code.estadoProceso, "completado");
  assert.equal(code.reservadoPorUid, IDS.patientAccount);
  assert.equal(code.destinoReservadoUid, IDS.patientAccount);
  assert.equal(destination.vinculacionReservaEstado, "completado");
});

test("un profesional presente solo en arrays conserva lectura sin elevarse a tratante", async () => {
  const records = baseRecords();
  records[`usuarios/${IDS.provisional}`] = {
    ...records[`usuarios/${IDS.provisional}`],
    medicosAutorizados: [
      ...records[`usuarios/${IDS.provisional}`].medicosAutorizados,
      IDS.doctorOther
    ]
  };
  const db = new FakeFirestore(records);
  const service = createAccountLinkingService({
    db,
    now: fixedClock,
    generateCode: codeGenerator("COG-ABCD-2345")
  });
  const created = await service.execute({ uid: IDS.doctor }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
    pacienteId: IDS.provisional
  });

  await service.execute({ uid: IDS.patientAccount }, {
    accion: ACCOUNT_LINKING_ACTIONS.LINK_FROM_DOCTOR_CODE,
    codigo: created.codigo
  });

  const permission = db.data(`usuarios/${IDS.patientAccount}/permisosMedicos/${IDS.doctorOther}`);
  assert.deepEqual({
    administrarPermisos: permission.administrarPermisos,
    agregarNotas: permission.agregarNotas,
    editarPaciente: permission.editarPaciente,
    lectura: permission.lectura,
    rolPermiso: permission.rolPermiso
  }, {
    administrarPermisos: false,
    agregarNotas: false,
    editarPaciente: false,
    lectura: true,
    rolPermiso: "estudiante"
  });
  assert.deepEqual(db.data(`usuarios/${IDS.patientAccount}`).medicosAutorizados, [IDS.doctor]);
});

test("un permiso embebido sin subdocumento conserva su rol y flags explícitos", async () => {
  const records = baseRecords();
  records[`usuarios/${IDS.provisional}`] = {
    ...records[`usuarios/${IDS.provisional}`],
    permisosMedicos: {
      [IDS.doctorOther]: {
        administrarPermisos: false,
        agregarNotas: true,
        editarPaciente: false,
        lectura: true,
        rolPermiso: "colaborador"
      }
    }
  };
  const db = new FakeFirestore(records);
  const service = createAccountLinkingService({
    db,
    now: fixedClock,
    generateCode: codeGenerator("COG-BCDE-3456")
  });
  const created = await service.execute({ uid: IDS.doctor }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
    pacienteId: IDS.provisional
  });

  await service.execute({ uid: IDS.patientAccount }, {
    accion: ACCOUNT_LINKING_ACTIONS.LINK_FROM_DOCTOR_CODE,
    codigo: created.codigo
  });

  const permission = db.data(`usuarios/${IDS.patientAccount}/permisosMedicos/${IDS.doctorOther}`);
  assert.deepEqual({
    administrarPermisos: permission.administrarPermisos,
    agregarNotas: permission.agregarNotas,
    editarPaciente: permission.editarPaciente,
    lectura: permission.lectura,
    rolPermiso: permission.rolPermiso
  }, {
    administrarPermisos: false,
    agregarNotas: true,
    editarPaciente: false,
    lectura: true,
    rolPermiso: "colaborador"
  });
});

test("paciente→médico ignora el medicoUid suministrado y exige acceso real al expediente", async () => {
  const db = new FakeFirestore(baseRecords());
  const service = createAccountLinkingService({
    db,
    now: fixedClock,
    generateCode: codeGenerator("COG-DDDD-5555")
  });
  const created = await service.execute({ uid: IDS.patientAccount }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_PATIENT_CODE,
    pacienteUid: IDS.patientOther
  });

  const linked = await service.execute({ uid: IDS.doctor }, {
    accion: ACCOUNT_LINKING_ACTIONS.LINK_FROM_PATIENT_CODE,
    codigo: created.codigo,
    expedienteProvisionalId: IDS.provisional,
    medicoUid: IDS.doctorOther
  });
  assert.equal(linked.pacienteUid, IDS.patientAccount);
  assert.equal(db.data(`codigosVinculacion/${created.codigo}`).usadoPor, IDS.doctor);
  assert.equal(db.data(`usuarios/${IDS.patientAccount}/permisosMedicos/${IDS.doctor}`).lectura, true);

  const isolatedDb = new FakeFirestore(baseRecords());
  const isolatedService = createAccountLinkingService({
    db: isolatedDb,
    now: fixedClock,
    generateCode: codeGenerator("COG-EEEE-6666")
  });
  const isolatedCode = await isolatedService.execute({ uid: IDS.patientOther }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_PATIENT_CODE
  });
  await assert.rejects(
    isolatedService.execute({ uid: IDS.doctorOther }, {
      accion: ACCOUNT_LINKING_ACTIONS.LINK_FROM_PATIENT_CODE,
      codigo: isolatedCode.codigo,
      expedienteProvisionalId: IDS.provisional,
      medicoUid: IDS.doctor
    }),
    assertErrorCode("permission-denied")
  );
});

test("dos consumos concurrentes del mismo código convergen sin duplicar documentos", async () => {
  const db = new FakeFirestore(baseRecords());
  const service = createAccountLinkingService({
    db,
    now: fixedClock,
    generateCode: codeGenerator("COG-FFFF-7777")
  });
  const created = await service.execute({ uid: IDS.doctor }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
    pacienteId: IDS.provisional
  });
  const request = {
    accion: ACCOUNT_LINKING_ACTIONS.LINK_FROM_DOCTOR_CODE,
    codigo: created.codigo
  };

  const [left, right] = await Promise.all([
    service.execute({ uid: IDS.patientAccount }, request),
    service.execute({ uid: IDS.patientAccount }, request)
  ]);
  assert.deepEqual(left, right);
  const copiedNotes = [...db.records.keys()].filter((path) => path === `usuarios/${IDS.patientAccount}/notas/n1`);
  assert.equal(copiedNotes.length, 1);
  assert.equal(db.data(`codigosVinculacion/${created.codigo}`).estadoProceso, "completado");
});

test("dos códigos distintos no pueden reservar el mismo expediente para destinos diferentes", async () => {
  const db = new FakeFirestore(baseRecords());
  const service = createAccountLinkingService({
    db,
    now: fixedClock,
    generateCode: codeGenerator("COG-QQQQ-8888", "COG-RRRR-9999")
  });
  const firstCode = await service.execute({ uid: IDS.doctor }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
    pacienteId: IDS.provisional
  });
  const secondCode = await service.execute({ uid: IDS.doctor }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
    pacienteId: IDS.provisional
  });

  const outcomes = await Promise.allSettled([
    service.execute({ uid: IDS.patientAccount }, {
      accion: ACCOUNT_LINKING_ACTIONS.LINK_FROM_DOCTOR_CODE,
      codigo: firstCode.codigo
    }),
    service.execute({ uid: IDS.patientOther }, {
      accion: ACCOUNT_LINKING_ACTIONS.LINK_FROM_DOCTOR_CODE,
      codigo: secondCode.codigo
    })
  ]);

  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
  const rejection = outcomes.find((outcome) => outcome.status === "rejected").reason;
  assert.equal(rejection.code, "aborted");
  const origin = db.data(`usuarios/${IDS.provisional}`);
  assert.equal(origin.estado, "vinculado");
  assert.equal(origin.vinculadoA, origin.vinculacionReservaDestinoUid);
  assert.equal(origin.vinculacionReservaEstado, "completado");
});

test("un fallo parcial conserva la reserva y un reintento autorizado termina sin duplicar", async () => {
  const db = new FakeFirestore(baseRecords());
  let failOnce = true;
  const service = createAccountLinkingService({
    db,
    now: fixedClock,
    generateCode: codeGenerator("COG-GGGG-8888"),
    hooks: {
      beforeCopy() {
        if (failOnce) {
          failOnce = false;
          throw new Error("simulated-copy-failure");
        }
      }
    }
  });
  const created = await service.execute({ uid: IDS.doctor }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
    pacienteId: IDS.provisional
  });
  const request = {
    accion: ACCOUNT_LINKING_ACTIONS.LINK_FROM_DOCTOR_CODE,
    codigo: created.codigo
  };

  await assert.rejects(service.execute({ uid: IDS.patientAccount }, request), /simulated-copy-failure/u);
  assert.equal(db.data(`codigosVinculacion/${created.codigo}`).estadoProceso, "reservado");

  const result = await service.execute({ uid: IDS.patientAccount }, request);
  assert.equal(result.pacienteUid, IDS.patientAccount);
  assert.equal(db.data(`codigosVinculacion/${created.codigo}`).estadoProceso, "completado");
  assert.deepEqual(db.data(`usuarios/${IDS.patientAccount}/notas/n1`), { texto: "dato" });
});

test("rechaza códigos expirados, heredados, del tipo incorrecto, usados o reservados por otro UID", async () => {
  const records = baseRecords();
  records["codigosVinculacion/COG-HHHH-9999"] = {
    codigo: "COG-HHHH-9999",
    usado: false,
    expiraEn: "2026-08-21T00:00:00.000Z",
    tipo: "medico_a_paciente",
    pacienteProvisionalId: IDS.provisional,
    medicoUid: IDS.doctor,
    emitidoPorUid: IDS.doctor,
    versionSeguridad: 1,
    estadoProceso: "disponible"
  };
  records["codigosVinculacion/COG-JJJJ-2222"] = {
    codigo: "COG-JJJJ-2222",
    usado: false,
    expiraEn: "2026-09-01T00:00:00.000Z",
    tipo: "medico_a_paciente",
    pacienteProvisionalId: IDS.provisional,
    medicoUid: IDS.doctor
  };
  records["codigosVinculacion/COG-KKKK-3333"] = {
    codigo: "COG-KKKK-3333",
    usado: true,
    expiraEn: "2026-09-01T00:00:00.000Z",
    tipo: "medico_a_paciente",
    pacienteProvisionalId: IDS.provisional,
    medicoUid: IDS.doctor,
    emitidoPorUid: IDS.doctor,
    versionSeguridad: 1,
    estadoProceso: "completado"
  };
  records["codigosVinculacion/COG-LLLL-4444"] = {
    codigo: "COG-LLLL-4444",
    usado: false,
    expiraEn: "2026-09-01T00:00:00.000Z",
    tipo: "medico_a_paciente",
    pacienteProvisionalId: IDS.provisional,
    medicoUid: IDS.doctor,
    emitidoPorUid: IDS.doctor,
    versionSeguridad: 1,
    estadoProceso: "reservado",
    reservadoPorUid: IDS.patientOther,
    accionReservada: ACCOUNT_LINKING_ACTIONS.LINK_FROM_DOCTOR_CODE,
    origenReservadoUid: IDS.provisional,
    destinoReservadoUid: IDS.patientOther
  };
  records["codigosVinculacion/COG-MMMM-5555"] = {
    codigo: "COG-MMMM-5555",
    usado: false,
    expiraEn: "2026-09-01T00:00:00.000Z",
    tipo: "paciente_a_medico",
    pacienteCuentaUid: IDS.patientAccount,
    emitidoPorUid: IDS.patientAccount,
    versionSeguridad: 1,
    estadoProceso: "disponible"
  };
  const service = createAccountLinkingService({ db: new FakeFirestore(records), now: fixedClock });
  const doctorCodeRequest = (codigo) => service.execute({ uid: IDS.patientAccount }, {
    accion: ACCOUNT_LINKING_ACTIONS.LINK_FROM_DOCTOR_CODE,
    codigo
  });

  await assert.rejects(doctorCodeRequest("COG-HHHH-9999"), assertErrorCode("deadline-exceeded"));
  await assert.rejects(doctorCodeRequest("COG-JJJJ-2222"), assertErrorCode("failed-precondition"));
  await assert.rejects(doctorCodeRequest("COG-KKKK-3333"), assertErrorCode("already-exists"));
  await assert.rejects(doctorCodeRequest("COG-LLLL-4444"), assertErrorCode("aborted"));
  await assert.rejects(doctorCodeRequest("COG-MMMM-5555"), assertErrorCode("failed-precondition"));
});

test("rechaza sesión ausente, acción desconocida y valores de ruta manipulados", async () => {
  const service = createAccountLinkingService({ db: new FakeFirestore(baseRecords()), now: fixedClock });
  await assert.rejects(
    service.execute(null, { accion: ACCOUNT_LINKING_ACTIONS.CREATE_PATIENT_CODE }),
    assertErrorCode("unauthenticated")
  );
  await assert.rejects(
    service.execute({ uid: IDS.patientAccount }, { accion: "borrarTodo" }),
    assertErrorCode("invalid-argument")
  );
  await assert.rejects(
    service.execute({ uid: IDS.doctor }, {
      accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
      pacienteId: "../otro"
    }),
    assertErrorCode("invalid-argument")
  );
});

test("una colisión de código se reintenta sin sobrescribir el documento existente", async () => {
  const records = baseRecords();
  records["codigosVinculacion/COG-NNNN-6666"] = { codigo: "COG-NNNN-6666", usado: false };
  const db = new FakeFirestore(records);
  const service = createAccountLinkingService({
    db,
    now: fixedClock,
    generateCode: codeGenerator("COG-NNNN-6666", "COG-PPPP-7777")
  });

  const result = await service.execute({ uid: IDS.patientAccount }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_PATIENT_CODE
  });
  assert.equal(result.codigo, "COG-PPPP-7777");
  assert.deepEqual(db.data("codigosVinculacion/COG-NNNN-6666"), { codigo: "COG-NNNN-6666", usado: false });
});

test("las marcas de eliminación bloquean la emisión y el consumo residual de códigos", async () => {
  const actorRecords = baseRecords();
  actorRecords[`accountDeletionTombstones/${IDS.doctor}`] = {
    accountUid: IDS.doctor,
    deletionState: "in_progress"
  };
  const blockedActorDb = new FakeFirestore(actorRecords);
  const blockedActorService = createAccountLinkingService({
    db: blockedActorDb,
    now: fixedClock,
    generateCode: codeGenerator("COG-TTTT-2222")
  });

  await assert.rejects(
    blockedActorService.execute({ uid: IDS.doctor }, {
      accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
      pacienteId: IDS.provisional
    }),
    assertErrorCode("failed-precondition")
  );
  assert.equal(blockedActorDb.data("codigosVinculacion/COG-TTTT-2222"), undefined);

  const destinationDb = new FakeFirestore(baseRecords());
  const destinationService = createAccountLinkingService({
    db: destinationDb,
    now: fixedClock,
    generateCode: codeGenerator("COG-UUUU-3333")
  });
  const created = await destinationService.execute({ uid: IDS.doctor }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
    pacienteId: IDS.provisional
  });
  destinationDb.write(`accountDeletionTombstones/${IDS.patientAccount}`, {
    accountUid: IDS.patientAccount,
    deletionState: "in_progress"
  });

  await assert.rejects(
    destinationService.execute({ uid: IDS.patientAccount }, {
      accion: ACCOUNT_LINKING_ACTIONS.LINK_FROM_DOCTOR_CODE,
      codigo: created.codigo
    }),
    assertErrorCode("failed-precondition")
  );
  assert.equal(destinationDb.data(`codigosVinculacion/${created.codigo}`).estadoProceso, "disponible");
  assert.equal(destinationDb.data(`usuarios/${IDS.provisional}`).vinculacionReservaEstado, undefined);
});

test("si un profesional entra en eliminación tras reservar, la vinculación libera ambos pacientes sin copiar datos", async () => {
  const db = new FakeFirestore(baseRecords());
  let markDuringMerge = false;
  const service = createAccountLinkingService({
    db,
    now: fixedClock,
    generateCode: codeGenerator("COG-VVVV-4444"),
    hooks: {
      beforeMergeTransaction() {
        if (!markDuringMerge) return;
        db.write(`accountDeletionTombstones/${IDS.doctor}`, {
          accountUid: IDS.doctor,
          deletionState: "in_progress"
        });
      }
    }
  });
  const created = await service.execute({ uid: IDS.doctor }, {
    accion: ACCOUNT_LINKING_ACTIONS.CREATE_DOCTOR_CODE,
    pacienteId: IDS.provisional
  });
  markDuringMerge = true;

  await assert.rejects(
    service.execute({ uid: IDS.patientAccount }, {
      accion: ACCOUNT_LINKING_ACTIONS.LINK_FROM_DOCTOR_CODE,
      codigo: created.codigo
    }),
    assertErrorCode("failed-precondition")
  );

  assert.equal(db.data(`codigosVinculacion/${created.codigo}`).estadoProceso, "disponible");
  assert.equal(db.data(`usuarios/${IDS.provisional}`).vinculacionReservaEstado, "disponible");
  assert.equal(db.data(`usuarios/${IDS.patientAccount}`).vinculacionReservaEstado, "disponible");
  assert.equal(db.data(`usuarios/${IDS.provisional}`).estado, "provisional");
  assert.equal(db.data(`usuarios/${IDS.patientAccount}/notas/n1`), undefined);
});
