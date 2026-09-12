import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

const PROJECT_ID = "cognicion-57052";
const ADMIN_UID = "organizationAdmin";
const SENSITIVE_ADMIN_UID = "organizationSensitiveAdmin";
const MEDICO_UID = "organizationMedico";
let environment;

before(async () => {
  const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || "").split(":");
  if (!host || !port) throw new Error("FIRESTORE_EMULATOR_HOST es obligatorio");
  const rules = await readFile(resolve(process.cwd(), "firestore.rules"), "utf8");
  environment = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { host, port: Number(port), rules } });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "usuarios", ADMIN_UID), { rol: "admin" }),
      setDoc(doc(db, "usuarios", SENSITIVE_ADMIN_UID), { rol: "admin", permisosOrganizacion: { sensitive: true } }),
      setDoc(doc(db, "usuarios", MEDICO_UID), { rol: "medico" }),
      setDoc(doc(db, "organizations", "cognicion-labs"), { name: "COGNICIÓN Labs" }),
      setDoc(doc(db, "organizations", "cognicion-labs", "members", "m1"), { name: "Miembro de prueba" }),
      setDoc(doc(db, "organizations", "cognicion-labs", "privateRecords", "p1"), { category: "vesting" })
    ]);
  });
});

after(async () => environment?.cleanup());

test("admin puede leer y escribir datos organizacionales ordinarios", async () => {
  const db = environment.authenticatedContext(ADMIN_UID).firestore();
  await assertSucceeds(getDoc(doc(db, "organizations", "cognicion-labs", "members", "m1")));
  await assertSucceeds(setDoc(doc(db, "organizations", "cognicion-labs", "areas", "a1"), { name: "Tecnología" }));
});

test("usuarios no admin no pueden leer información empresarial", async () => {
  const db = environment.authenticatedContext(MEDICO_UID).firestore();
  await assertFails(getDoc(doc(db, "organizations", "cognicion-labs")));
  await assertFails(getDoc(doc(db, "organizations", "cognicion-labs", "members", "m1")));
});

test("datos sensibles exigen permiso adicional incluso para admin", async () => {
  const adminDb = environment.authenticatedContext(ADMIN_UID).firestore();
  const sensitiveDb = environment.authenticatedContext(SENSITIVE_ADMIN_UID).firestore();
  await assertFails(getDoc(doc(adminDb, "organizations", "cognicion-labs", "privateRecords", "p1")));
  await assertSucceeds(getDoc(doc(sensitiveDb, "organizations", "cognicion-labs", "privateRecords", "p1")));
});

test("borrado físico está denegado por diseño", async () => {
  const db = environment.authenticatedContext(ADMIN_UID).firestore();
  const { deleteDoc } = await import("firebase/firestore");
  await assertFails(deleteDoc(doc(db, "organizations", "cognicion-labs", "members", "m1")));
});
