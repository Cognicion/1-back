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
    const writes = [];
    const result = await operation({
      get: async (reference) => new Snapshot(this.documents.get(reference.path)),
      set: (reference, value, options = {}) => writes.push({
        merge: options.merge === true,
        path: reference.path,
        value
      }),
      update: (reference, value) => writes.push({ merge: true, path: reference.path, value })
    });
    writes.forEach(({ merge, path, value }) => {
      const next = merge
        ? { ...(this.documents.get(path) || {}), ...structuredClone(value) }
        : structuredClone(value);
      this.documents.set(path, next);
    });
    return result;
  }
}

function authDirectory(users = []) {
  const activeUsers = [...users];
  const deletedUids = [];
  return {
    deletedUids,
    async getUser(uid) {
      const user = activeUsers.find((item) => item.uid === uid);
      if (!user) {
        throw Object.assign(new Error("Usuario Auth no encontrado"), { code: "auth/user-not-found" });
      }
      return structuredClone(user);
    },
    async deleteUser(uid) {
      const index = activeUsers.findIndex((user) => user.uid === uid);
      if (index < 0) {
        throw Object.assign(new Error("Usuario Auth no encontrado"), { code: "auth/user-not-found" });
      }
      activeUsers.splice(index, 1);
      deletedUids.push(uid);
    },
    async listUsers() {
      return { users: activeUsers };
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
  const authAdmin = authDirectory(users);
  return {
    authAdmin,
    db,
    service: createMembershipAdministrationService({
      authAdmin,
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

test("Admin completa un perfil pendiente verificado sin permitir rol Admin ni sobrescrituras", async () => {
  const pendingUid = "pendingVerifiedUid";
  const { db, service } = fixture({}, [{
    uid: pendingUid,
    email: "PENDING@EXAMPLE.TEST",
    emailVerified: true,
    disabled: false,
    metadata: { creationTime: "Mon, 08 Sep 2026 17:30:00 GMT" }
  }]);

  await assert.rejects(
    service.completePendingAuthUserProfile({ uid: "userUid", token: {} }, {
      uidUsuario: pendingUid,
      nombre: "Profesional Pendiente",
      rol: "medico",
      tipoMembresia: "pro"
    }),
    (error) => error instanceof MembershipAdministrationError && error.code === "permission-denied"
  );
  await assert.rejects(
    service.completePendingAuthUserProfile(adminAuth, {
      uidUsuario: pendingUid,
      nombre: "Profesional Pendiente",
      rol: "admin",
      tipoMembresia: "pro"
    }),
    (error) => error instanceof MembershipAdministrationError && error.code === "invalid-argument"
  );

  assert.deepEqual(
    await service.completePendingAuthUserProfile(adminAuth, {
      uidUsuario: pendingUid,
      nombre: "Profesional Pendiente",
      rol: "medico",
      tipoMembresia: "pro"
    }),
    { rol: "medico", tipoMembresia: "pro", uid: pendingUid }
  );
  const profile = db.documents.get(`usuarios/${pendingUid}`);
  assert.equal(profile.nombre, "Profesional Pendiente");
  assert.equal(profile.email, "pending@example.test");
  assert.equal(profile.rol, "medico");
  assert.equal(profile.tipoMembresia, "pro");
  assert.equal(profile.planCuentaProfesional, "profesional_codigo");
  assert.equal(profile.limitePacientes, null);
  assert.equal(profile.registroCompletadoPorAdminUid, "adminUid");
  assert.equal(profile.requiereConfirmacionConsentimientosLegales, true);
  assert.equal(profile.admin, undefined);

  await assert.rejects(
    service.completePendingAuthUserProfile(adminAuth, {
      uidUsuario: pendingUid,
      nombre: "Nombre Distinto",
      rol: "psicologo",
      tipoMembresia: "gratuita"
    }),
    (error) => error instanceof MembershipAdministrationError && error.code === "already-exists"
  );
});

test("Admin no completa cuentas pendientes sin correo verificado o en eliminación", async () => {
  const unverifiedUid = "pendingUnverifiedUid";
  const deletingUid = "pendingDeletingUid";
  const { service } = fixture({
    [`accountDeletionTombstones/${deletingUid}`]: {
      accountType: "registro_incompleto",
      accountUid: deletingUid,
      deletionState: "in_progress"
    }
  }, [
    {
      uid: unverifiedUid,
      email: "unverified@example.test",
      emailVerified: false,
      disabled: false,
      metadata: {}
    },
    {
      uid: deletingUid,
      email: "deleting@example.test",
      emailVerified: true,
      disabled: false,
      metadata: {}
    }
  ]);

  await assert.rejects(
    service.completePendingAuthUserProfile(adminAuth, {
      uidUsuario: unverifiedUid,
      nombre: "Sin verificar",
      rol: "medico",
      tipoMembresia: "pro"
    }),
    (error) => error instanceof MembershipAdministrationError && error.code === "failed-precondition"
  );
  await assert.rejects(
    service.completePendingAuthUserProfile(adminAuth, {
      uidUsuario: deletingUid,
      nombre: "En eliminación",
      rol: "medico",
      tipoMembresia: "pro"
    }),
    (error) => error instanceof MembershipAdministrationError && error.code === "failed-precondition"
  );
});

test("Admin elimina de Authentication solo registros pendientes y deja una barrera de eliminación", async () => {
  const pendingUid = "pendingAuthUid";
  const { authAdmin, db, service } = fixture({}, [{
    uid: pendingUid,
    email: "pending@example.test",
    metadata: {}
  }]);

  await assert.rejects(
    service.deletePendingAuthUser({ uid: "userUid", token: {} }, { uidUsuario: pendingUid }),
    (error) => error instanceof MembershipAdministrationError && error.code === "permission-denied"
  );
  await assert.rejects(
    service.deletePendingAuthUser(adminAuth, { uidUsuario: "userUid" }),
    (error) => error instanceof MembershipAdministrationError && error.code === "failed-precondition"
  );

  assert.deepEqual(
    await service.deletePendingAuthUser(adminAuth, { uidUsuario: pendingUid }),
    { auth: "eliminada", deleted: true, uid: pendingUid }
  );
  assert.deepEqual(authAdmin.deletedUids, [pendingUid]);
  assert.equal((await service.listAuthUsers(adminAuth)).users.some((user) => user.uid === pendingUid), false);
  const tombstone = db.documents.get(`accountDeletionTombstones/${pendingUid}`);
  assert.equal(tombstone.accountType, "registro_incompleto");
  assert.equal(tombstone.deletionState, "completed");
  assert.equal(tombstone.deletedByAdminUid, "adminUid");

  assert.deepEqual(
    await service.deletePendingAuthUser(adminAuth, { uidUsuario: pendingUid }),
    { auth: "no_existia", deleted: true, uid: pendingUid }
  );
});
