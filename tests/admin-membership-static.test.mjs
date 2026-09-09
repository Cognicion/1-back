import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, adminSource, registrationBackend, patientBackend, membershipBackend, functionsIndex, rules] = await Promise.all([
  readFile(new URL("../admin.html", import.meta.url), "utf8"),
  readFile(new URL("../js/admin.js", import.meta.url), "utf8"),
  readFile(new URL("../functions/accountSecurity/professionalRegistration.js", import.meta.url), "utf8"),
  readFile(new URL("../functions/accountSecurity/professionalPatientAccess.js", import.meta.url), "utf8"),
  readFile(new URL("../functions/accountSecurity/membershipAdministration.js", import.meta.url), "utf8"),
  readFile(new URL("../functions/index.js", import.meta.url), "utf8"),
  readFile(new URL("../firestore.rules", import.meta.url), "utf8")
]);

test("Usuarios registrados une perfiles con cuentas Auth pendientes", () => {
  assert.match(html, /estadoDirectorioUsuariosAdmin/u);
  assert.match(adminSource, /httpsCallable\(await obtenerFunctions\(\), "listAdminAuthUsers"\)/u);
  assert.match(adminSource, /perfilPendiente:\s*true/u);
  assert.match(adminSource, /Perfil pendiente/u);
  assert.match(functionsIndex, /exports\.listAdminAuthUsers\s*=/u);
});

test("Admin puede eliminar un perfil pendiente de Authentication sin saltarse la eliminación de perfiles completos", () => {
  assert.match(adminSource, /"deletePendingAuthUser"/u);
  assert.match(adminSource, /Eliminar registro pendiente/u);
  assert.match(functionsIndex, /exports\.deletePendingAuthUser\s*=/u);
  assert.match(membershipBackend, /if \(profileSnapshot\.exists\)/u);
  assert.match(membershipBackend, /await authAdmin\.deleteUser\(targetUid\)/u);
});

test("el Centro de Control administra únicamente membresías gratuita y Pro", () => {
  assert.match(html, /id="filtroUsuariosMembresia"/u);
  assert.match(html, /value="gratuita">Gratuita/u);
  assert.match(html, /value="pro">Pro/u);
  assert.match(adminSource, /"setUserMembership"/u);
  assert.match(adminSource, /cambiarMembresiaUsuarioAdmin/u);
  assert.match(functionsIndex, /exports\.setUserMembership\s*=/u);
});

test("las altas persisten membresía y las reglas impiden autoelevarla", () => {
  assert.match(registrationBackend, /tipoMembresia:\s*isFree\s*\?\s*MEMBERSHIP_TYPES\.FREE\s*:\s*MEMBERSHIP_TYPES\.PRO/u);
  assert.match(patientBackend, /tipoMembresia:\s*existing\?\.tipoMembresia\s*\|\|\s*"gratuita"/u);
  assert.match(rules, /membershipFieldsChanged\(\)[\s\S]*"tipoMembresia"/u);
});
