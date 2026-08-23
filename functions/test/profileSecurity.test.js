"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ProfessionalRegistrationError,
  codeAllowsRole,
  createProfessionalRegistrationService
} = require("../accountSecurity/professionalRegistration");

class MemorySnapshot {
  constructor(value) {
    this.exists = value !== undefined;
    this.value = value;
  }

  data() {
    return this.exists ? structuredClone(this.value) : undefined;
  }
}

class MemoryFirestore {
  constructor(entries = {}) {
    this.documents = new Map(Object.entries(structuredClone(entries)));
    this.queue = Promise.resolve();
  }

  doc(path) {
    return { path };
  }

  runTransaction(operation) {
    const execute = this.queue.then(async () => {
      const writes = [];
      const transaction = {
        get: async (reference) => new MemorySnapshot(this.documents.get(reference.path)),
        create: (reference, value) => writes.push({ kind: "create", path: reference.path, value }),
        update: (reference, patch) => writes.push({ kind: "update", path: reference.path, value: patch })
      };
      const result = await operation(transaction);
      for (const write of writes) {
        if (write.kind === "create") {
          if (this.documents.has(write.path)) throw new Error(`Documento existente: ${write.path}`);
          this.documents.set(write.path, structuredClone(write.value));
          continue;
        }
        const current = this.documents.get(write.path);
        if (current === undefined) throw new Error(`Documento inexistente: ${write.path}`);
        this.documents.set(write.path, { ...structuredClone(current), ...structuredClone(write.value) });
      }
      return result;
    });
    this.queue = execute.catch(() => undefined);
    return execute;
  }
}

const NOW = new Date("2026-08-22T12:00:00.000Z");
const ADMIN_UID = "uidAdmin";

function validCode(overrides = {}) {
  return {
    codigo: "ABCD-EFGH-IJKL",
    creadoPorUid: ADMIN_UID,
    expiraEn: "2026-08-23T12:00:00.000Z",
    tipo: "medico",
    usado: false,
    ...overrides
  };
}

function fixture(code = validCode(), extra = {}) {
  const db = new MemoryFirestore({
    [`usuarios/${ADMIN_UID}`]: { email: "admin@example.test", rol: "admin" },
    "codigosAutorizacionMedico/ABCD-EFGH-IJKL": code,
    ...extra
  });
  return {
    db,
    service: createProfessionalRegistrationService({ db, now: () => new Date(NOW) })
  };
}

function request(uid, role = "medico") {
  return {
    auth: { uid, token: { email: `${uid}@example.test` } },
    data: {
      aceptaAviso: true,
      aceptaBeta: true,
      codigoAutorizacion: " abcd-efgh-ijkl ",
      nombre: `Profesional ${uid}`,
      rol: role
    }
  };
}

test("el backend consume el código y crea el perfil profesional en una sola transacción", async () => {
  const { db, service } = fixture();
  const result = await service.register(request("uidMedico"));

  assert.deepEqual(result, { alreadyRegistered: false, role: "medico", uid: "uidMedico" });
  assert.deepEqual(db.documents.get("usuarios/uidMedico"), {
    nombre: "Profesional uidMedico",
    email: "uidmedico@example.test",
    rol: "medico",
    tieneCuenta: true,
    estado: "activo",
    unidad: "",
    especialidad: "",
    institucion: "",
    cedula: "",
    aceptoAvisoPrivacidad: true,
    fechaAceptacionAviso: NOW.toISOString(),
    versionAvisoPrivacidad: "2026-08-01",
    fechaCreacion: NOW.toISOString(),
    creadoConCodigoAutorizacion: "ABCD-EFGH-IJKL",
    autorizadoPorAdminUid: ADMIN_UID
  });
  assert.equal(db.documents.get("codigosAutorizacionMedico/ABCD-EFGH-IJKL").usado, true);
  assert.equal(db.documents.get("codigosAutorizacionMedico/ABCD-EFGH-IJKL").usadoPorUid, "uidMedico");
});

test("el registro es idempotente para el mismo UID y el código no puede reutilizarse por otro UID", async () => {
  const { service } = fixture();
  const first = await service.register(request("uidOwner", "psicologo"));
  const retry = await service.register(request("uidOwner", "psicologo"));
  assert.equal(first.alreadyRegistered, false);
  assert.equal(retry.alreadyRegistered, true);

  await assert.rejects(
    service.register(request("uidOther", "medico")),
    (error) => error instanceof ProfessionalRegistrationError && error.code === "failed-precondition"
  );
});

test("dos consumos concurrentes del mismo código producen un solo perfil", async () => {
  const { db, service } = fixture();
  const settled = await Promise.allSettled([
    service.register(request("uidA")),
    service.register(request("uidB"))
  ]);
  assert.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(settled.filter((item) => item.status === "rejected").length, 1);
  assert.equal([...db.documents.keys()].filter((path) => /^usuarios\/uid[AB]$/u.test(path)).length, 1);
});

test("expiración, emisor administrativo y rol explícito se validan en servidor", async () => {
  const expired = fixture(validCode({ expiraEn: NOW.toISOString() }));
  await assert.rejects(
    expired.service.register(request("uidExpired")),
    (error) => error.code === "failed-precondition"
  );

  const unauthorizedIssuer = fixture(validCode({ creadoPorUid: "uidNoAdmin" }), {
    "usuarios/uidNoAdmin": { rol: "paciente" }
  });
  await assert.rejects(
    unauthorizedIssuer.service.register(request("uidForged")),
    (error) => error.code === "permission-denied"
  );

  const restricted = fixture(validCode({ rolPermitido: "medico" }));
  await assert.rejects(
    restricted.service.register(request("uidPsych", "psicologo")),
    (error) => error.code === "permission-denied"
  );
  assert.equal(codeAllowsRole({ rolesPermitidos: ["psicologo"] }, "psicologo"), true);
  assert.equal(codeAllowsRole({ rolesPermitidos: ["psicologo"] }, "medico"), false);
});

test("solo admite roles profesionales cerrados, correo autenticado y consentimientos", async () => {
  const { service } = fixture();
  await assert.rejects(
    service.register(request("uidAdminAttempt", "admin")),
    (error) => error.code === "invalid-argument"
  );
  await assert.rejects(
    service.register({ ...request("uidNoEmail"), auth: { uid: "uidNoEmail", token: {} } }),
    (error) => error.code === "failed-precondition"
  );
  await assert.rejects(
    service.register({ ...request("uidNoConsent"), data: { ...request("uidNoConsent").data, aceptaBeta: false } }),
    (error) => error.code === "failed-precondition"
  );
});
