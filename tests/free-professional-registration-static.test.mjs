import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  registrationHtml,
  registrationSource,
  professionalRegistrationService,
  professionalPatientAccessService,
  professionalRegistrationBackend
] = await Promise.all([
  readFile(new URL("../registro.html", import.meta.url), "utf8"),
  readFile(new URL("../js/registro.js", import.meta.url), "utf8"),
  readFile(new URL("../js/services/professionalRegistrationService.js", import.meta.url), "utf8"),
  readFile(new URL("../js/services/professionalPatientAccessService.js", import.meta.url), "utf8"),
  readFile(new URL("../functions/accountSecurity/professionalRegistration.js", import.meta.url), "utf8")
]);

test("registro ofrece una modalidad profesional gratuita con límite visible de cinco pacientes", () => {
  assert.match(registrationHtml, /data-modalidad-profesional="gratuita"[^>]*>Cuenta gratuita</u);
  assert.match(registrationHtml, /Sin código\. Incluye hasta 5 pacientes distintos/u);
  assert.match(registrationSource, /modalidadProfesionalSeleccionada\s*=\s*"gratuita"/u);
  assert.match(registrationSource, /Sin código\. Incluye hasta 5 pacientes distintos/u);
  assert.match(registrationSource, /limitePacientes:\s*usaCodigo\s*\?\s*null\s*:\s*5/u);
});

test("registro delega las altas profesionales y de pacientes en callables backend", () => {
  assert.match(
    registrationSource,
    /import\s*\{\s*registrarProfesional\s*\}\s*from\s*"\.\/services\/professionalRegistrationService\.js\?v=20260826-cuenta-profesional-gratuita-v1"/u
  );
  assert.match(registrationSource, /await\s+registrarProfesional\(\{/u);
  assert.match(professionalRegistrationService, /httpsCallable\(functions,\s*"registerProfessional"\)/u);

  assert.match(
    registrationSource,
    /import\s*\{\s*descartarCuentaSinPerfil,\s*registrarPerfilPacienteSeguro\s*\}\s*from\s*"\.\/services\/professionalPatientAccessService\.js\?v=20260826-cuenta-profesional-gratuita-v1"/u
  );
  assert.match(registrationSource, /await\s+registrarPerfilPacienteSeguro\(\{/u);
  assert.match(professionalPatientAccessService, /callProfessionalPatientFunction\("registerPatientProfile"/u);
  assert.match(professionalPatientAccessService, /callProfessionalPatientFunction\("discardUnregisteredAccount"\)/u);
  assert.match(registrationSource, /ERRORES_DEFINITIVOS_REGISTRO/u);
  assert.match(registrationSource, /"functions\/permission-denied"/u);
  assert.match(registrationSource, /await descartarCuentaSinPerfil\(\)/u);
  assert.match(registrationSource, /await signOut\(auth\)/u);
  assert.match(registrationSource, /async function crearOReanudarCuentaAuth\(email, password\)/u);
  assert.match(registrationSource, /error\?\.code !== "auth\/email-already-in-use"/u);
  assert.match(registrationSource, /return signInWithEmailAndPassword\(auth, email, password\)/u);
  assert.equal(
    [...registrationSource.matchAll(/await crearOReanudarCuentaAuth\(email, password\)/gu)].length,
    2,
    "Los registros profesional y paciente deben poder retomar un cleanup Auth fallido."
  );
  assert.match(registrationSource, /async function limpiarAuthDeRegistroFallido\(error\)/u);
  assert.match(registrationSource, /catch \(cleanupError\)[\s\S]*finally\s*\{[\s\S]*await signOut\(auth\)/u);
  assert.doesNotMatch(registrationSource, /authCreadaEnEsteIntento/u);
  assert.equal(
    [...registrationSource.matchAll(/await limpiarAuthDeRegistroFallido\(registrationError\)/gu)].length,
    2,
    "Los flujos profesional y paciente deben limpiar también una cuenta Auth reutilizada."
  );
});

test("el alta profesional exige verificar el correo antes de crear el perfil", () => {
  assert.match(registrationSource, /\breload\b/u);
  assert.match(registrationSource, /\bsendEmailVerification\b/u);
  assert.match(registrationSource, /if \(!credencial\.user\.emailVerified\)/u);
  assert.match(registrationSource, /Te enviamos un correo de verificación/u);
  assert.match(professionalRegistrationBackend, /auth\?\.token\?\.email_verified\s*!==\s*true/u);
});

test("la cuenta de paciente conserva su selección y rol existentes", () => {
  assert.match(registrationHtml, /data-tipo-cuenta="paciente"[^>]*>Cuenta de paciente</u);
  assert.match(registrationSource, /tipoCuentaSeleccionada\s*=\s*"paciente"/u);
  assert.match(registrationSource, /perfil:\s*\{\s*nombre,\s*email,\s*rol:\s*"paciente"\s*\}/u);
  assert.match(registrationSource, /usuarioRol:\s*"paciente"/u);
});
