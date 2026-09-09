"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MembershipAdministrationError,
  createMembershipAdministrationService
} = require("../accountSecurity/membershipAdministration");

class Snapshot {
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
  }

  doc(path) {
    return {
      path,
      get: async () => new Snapshot(this.documents.get(path))
    };
  }

  async runTransaction(operation) {
    const updates = [];
    const result = await operation({
      get: async (reference) => new Snapshot(this.documents.get(reference.path)),
      update: (reference, patch) => updates.push({ path: reference.path, patch })
    });
    updates.forEach(({ path, patch }) => {
      this.documents.set(path, { ...this.documents.get(path), ...structuredClone(patch) });
    });
    return result;
  }
}

function authDirectory(users = []) {
  return {
    async listUsers() {
      return { users };
    }
  };
}

function fixture(extra = {}, users = []) {
  const db = new MemoryFirestore({
    "usuarios/adminUid": { nombre: "Admin", rol: "admin" },
    "usuarios/proUid": {
      limitePacientes: 5,
      modalidadRegistroProfesional: "gratuita",
      planCuentaProfesional: "profesional_gratuito",
      rol: "medico",
      tipoMembresia: "gratuita"
    },
    "usuarios/userUid": { rol: "paciente", tieneCuenta: true, tipoMembresia: "gratuita" },
    ...extra
  });
  return {
    db,
    service: createMembershipAdministrationService({
      authAdmin: authDirectory(users),
      db,
      now: () => new Date("2026-09-08T18:00:00.000Z")
    })
  };
}

const adminAuth = { uid: "adminUid", token: {} };

test("el directorio Auth solo está disponible para administración y expone campos acotados", async () => {
  const { service } = fixture({}, [{
    uid: "authOnly",
    email: "AUTH@EXAMPLE.TEST",
    displayName: "Cuenta pendiente",
    emailVerified: false,
    disabled: false,
    metadata: { creationTime: "Mon, 08 Sep 2026 18:00:00 GMT", lastSignInTime: "" },
    customClaims: { admin: true }
  }]);

  await assert.rejects(
    service.listAuthUsers({ uid: "userUid", token: {} }),
    (error) => error instanceof MembershipAdministrationError && error.code === "permission-denied"
  );
  const result = await service.listAuthUsers(adminAuth);
  assert.deepEqual(result.users, [{
    uid: "authOnly",
    email: "auth@example.test",
    nombre: "Cuenta pendiente",
    emailVerificado: false,
    deshabilitado: false,
    creadoEnAuth: "Mon, 08 Sep 2026 18:00:00 GMT",
    ultimoAccesoAuth: ""
  }]);
  assert.equal("customClaims" in result.users[0], false);
});

test("Pro elimina el límite profesional sin modificar el rol ni conceder administración", async () => {
  const { db, service } = fixture();
  assert.deepEqual(
    await service.setUserMembership(adminAuth, { uidUsuario: "proUid", tipoMembresia: "pro" }),
    { tipoMembresia: "pro", uid: "proUid" }
  );
  const stored = db.documents.get("usuarios/proUid");
  assert.equal(stored.tipoMembresia, "pro");
  assert.equal(stored.planCuentaProfesional, "profesional_codigo");
  assert.equal(stored.limitePacientes, null);
  assert.equal(stored.rol, "medico");
  assert.equal(stored.admin, undefined);
  assert.equal(stored.membresiaActualizadaPorUid, "adminUid");
});

test("el downgrade a gratuita restaura el límite y las cuentas Admin no usan membresía", async () => {
  const { db, service } = fixture({
    "usuarios/proUid": {
      limitePacientes: null,
      planCuentaProfesional: "profesional_codigo",
      rol: "psicologo",
      tipoMembresia: "pro"
    }
  });
  await service.setUserMembership(adminAuth, { uidUsuario: "proUid", tipoMembresia: "gratuita" });
  assert.equal(db.documents.get("usuarios/proUid").limitePacientes, 5);
  assert.equal(db.documents.get("usuarios/proUid").planCuentaProfesional, "profesional_gratuito");

  await assert.rejects(
    service.setUserMembership(adminAuth, { uidUsuario: "adminUid", tipoMembresia: "pro" }),
    (error) => error instanceof MembershipAdministrationError && error.code === "failed-precondition"
  );
});

test("la membresía rechaza valores desconocidos y perfiles todavía inexistentes", async () => {
  const { service } = fixture({
    "usuarios/provisionalUid": { rol: "paciente", tieneCuenta: false }
  });
  await assert.rejects(
    service.setUserMembership(adminAuth, { uidUsuario: "userUid", tipoMembresia: "plus" }),
    (error) => error instanceof MembershipAdministrationError && error.code === "invalid-argument"
  );
  await assert.rejects(
    service.setUserMembership(adminAuth, { uidUsuario: "authOnly", tipoMembresia: "pro" }),
    (error) => error instanceof MembershipAdministrationError && error.code === "failed-precondition"
  );
  await assert.rejects(
    service.setUserMembership(adminAuth, { uidUsuario: "provisionalUid", tipoMembresia: "pro" }),
    (error) => error instanceof MembershipAdministrationError && error.code === "failed-precondition"
  );
});
