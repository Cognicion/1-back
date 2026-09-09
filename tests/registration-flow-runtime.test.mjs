import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { fechaMaximaNacimiento, fechaNacimientoValida } from "../js/utils/fechaNacimientoRegistro.js";

const source = await readFile(new URL("../js/registro.js", import.meta.url), "utf8");
// Solo reemplaza los imports de infraestructura. Se ejecutan los manejadores
// reales de registro sin inicializar Firebase ni conectarse a producción.
const withoutImports = (text) => text.replace(/^import\s+[\s\S]*?\s+from\s+"[^"]+";\r?\n/gmu, "");
const plain = (value) => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function element(value = "", dataset = {}) {
  const handlers = {};
  return {
    value, dataset, disabled: false, checked: true, textContent: "", handlers,
    classList: { toggle() {} }, focus() {},
    addEventListener(name, fn) { handlers[name] = fn; },
    click() { if (!this.disabled) return handlers.click?.(); }
  };
}

function page({ verified = true, verifyGate = null, register = async () => ({}) } = {}) {
  const fields = Object.fromEntries([
    "nombre", "fechaNacimiento", "email", "password", "correoMedico", "codigoVinculacion",
    "codigoAutorizacionMedico", "aceptaAviso", "aceptaBeta", "aceptaComunicaciones", "btnCrearCuenta",
    "mensaje", "mensajeLegal", "campoCodigoProfesional", "notaModalidadProfesional",
    "tituloRegistro", "descripcionRegistro", "camposPacienteRegistro", "camposMedicoRegistro"
  ].map((id) => [id, element()]));
  Object.assign(fields.nombre, { value: "Usuario de prueba" });
  fields.fechaNacimiento.value = "1990-05-17";
  fields.email.value = "cuenta@example.test";
  fields.password.value = "test-only-password";
  fields.correoMedico.value = "medico@example.test";
  fields.codigoAutorizacionMedico.value = "CODE-TEST";
  const roles = ["paciente", "medico", "psicologo", "enfermeria_salud_mental"]
    .map((tipoCuenta) => element("", { tipoCuenta }));
  const modes = ["gratuita", "codigo_admin"].map((modalidadProfesional) => element("", { modalidadProfesional }));
  const controls = [...Object.values(fields).slice(0, 10), ...roles, ...modes];
  const events = {};
  const calls = [];
  let authCreates = 0;
  let reloads = 0;
  const user = { uid: "uidSignupTest", email: fields.email.value, emailVerified: verified, getIdToken: async () => "test-token" };
  const auth = { currentUser: null };
  const window = { location: { href: "registro.html" }, setTimeout: (fn) => queueMicrotask(fn), addEventListener: (name, fn) => { events[name] = fn; } };
  const context = {
    document: {
      getElementById: (id) => fields[id],
      querySelectorAll: (selector) => selector === "[data-tipo-cuenta]" ? roles
        : selector === "[data-modalidad-profesional]" ? modes
          : selector.startsWith(".auth-card") ? controls : []
    },
    window, auth, console: { log() {}, warn() {}, error() {} },
    fechaMaximaNacimiento, fechaNacimientoValida,
    ROL_ENFERMERIA_SALUD_MENTAL: "enfermeria_salud_mental",
    ETIQUETA_ROL_ENFERMERIA_SALUD_MENTAL: "Enfermería / Salud Mental",
    createUserWithEmailAndPassword: async () => { authCreates++; auth.currentUser = user; return { user }; },
    signInWithEmailAndPassword: async () => ({ user }), signOut: async () => {},
    reload: async () => { if (++reloads > 1) user.emailVerified = true; },
    sendEmailVerification: async () => { if (verifyGate) await verifyGate.promise; },
    registrarProfesional: async (payload) => { calls.push(plain(payload)); return register(payload); },
    registrarPerfilPacienteSeguro: async (payload) => { calls.push(plain(payload)); return register(payload); },
    descartarCuentaSinPerfil: async () => {},
    vincularCuentaConCodigoMedico: async () => ({}),
    registrarEventoAuditoria: async () => {}, registrarVisita: async () => {}, abrirLegalModal() {},
    betaConsent: {}, privacyNotice: {}
  };
  vm.runInNewContext(withoutImports(source), context, { filename: "registro.js" });
  return { fields, roles, modes, controls, calls, window, events, authCreates: () => authCreates };
}

for (const role of ["medico", "psicologo", "enfermeria_salud_mental"]) {
  for (const mode of ["gratuita", "codigo_admin"]) {
    test(`UI ${role}/${mode}: espera verificación, conserva datos y solo continúa tras guardar`, async () => {
      const verifyGate = deferred();
      const saveGate = deferred();
      const app = page({ verified: false, verifyGate, register: () => saveGate.promise });
      app.roles.find((button) => button.dataset.tipoCuenta === role).click();
      app.modes.find((button) => button.dataset.modalidadProfesional === mode).click();
      const pending = app.fields.btnCrearCuenta.click();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(app.calls.length, 0, "No asigna un rol sin verificar el correo.");
      assert.ok(app.controls.every((control) => control.disabled));
      app.roles[0].click();
      app.modes.find((button) => button.dataset.modalidadProfesional !== mode).click();
      assert.equal(app.fields.btnCrearCuenta.click(), undefined, "Bloquea el doble clic.");
      let prevented = false;
      app.events.beforeunload({ preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
      verifyGate.resolve();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(app.window.location.href, "registro.html");
      assert.deepEqual(app.calls[0], {
        nombre: "Usuario de prueba", fechaNacimiento: "1990-05-17", aceptaComunicaciones: true,
        rol: role, modalidadRegistro: mode, codigoAutorizacion: "CODE-TEST", aceptaAviso: true, aceptaBeta: true
      });
      saveGate.resolve({ alreadyRegistered: false, role, uid: "uidSignupTest" });
      await pending;
      assert.equal(app.window.location.href, "dashboard.html");
      assert.equal(app.authCreates(), 1);
      assert.ok(app.controls.every((control) => !control.disabled));
      prevented = false;
      app.events.beforeunload({ preventDefault() { prevented = true; } });
      assert.equal(prevented, false);
    });
  }
}

test("UI paciente envía fecha y consentimientos por correo o código de vinculación", async () => {
  for (const withCode of [false, true]) {
    const app = page();
    if (withCode) { app.fields.correoMedico.value = ""; app.fields.codigoVinculacion.value = "LINK-TEST"; }
    await app.fields.btnCrearCuenta.click();
    assert.equal(app.calls[0].fechaNacimiento, "1990-05-17");
    assert.equal(app.calls[0].usaCodigoVinculacion, withCode);
    assert.equal(app.calls[0].aceptaComunicaciones, true);
    assert.equal(app.window.location.href, "dashboard.html");
  }
});

test("UI no crea Auth si falta nacimiento o es inválido, en cualquier rol", async () => {
  for (const role of ["paciente", "medico", "psicologo", "enfermeria_salud_mental"]) {
    for (const value of ["", "2001-02-29", "2999-01-01"]) {
      const app = page();
      app.roles.find((button) => button.dataset.tipoCuenta === role).click();
      app.fields.fechaNacimiento.value = value;
      await app.fields.btnCrearCuenta.click();
      assert.equal(app.authCreates(), 0);
      assert.equal(app.calls.length, 0);
      assert.match(app.fields.mensaje.textContent, /fecha de nacimiento válida/u);
      assert.equal(app.fields.btnCrearCuenta.disabled, false);
    }
  }
});

test("un fallo transitorio mantiene formulario y selección; reintentar no duplica Auth", async () => {
  let attempts = 0;
  const app = page({ register: async () => {
    if (++attempts === 1) throw Object.assign(new Error("No se pudo guardar; reintenta."), { code: "functions/unavailable" });
    return {};
  } });
  app.roles[2].click();
  app.modes[1].click();
  await app.fields.btnCrearCuenta.click();
  assert.equal(app.window.location.href, "registro.html");
  assert.equal(app.fields.fechaNacimiento.value, "1990-05-17");
  assert.equal(app.fields.btnCrearCuenta.disabled, false);
  await app.fields.btnCrearCuenta.click();
  assert.deepEqual(app.calls[0], app.calls[1]);
  assert.equal(app.authCreates(), 1);
  assert.equal(app.window.location.href, "dashboard.html");
});

test("adaptadores envían fecha y preferencias hasta las tres callables de registro", async () => {
  const calls = [];
  for (const [path, names] of [
    ["../js/services/professionalRegistrationService.js", ["registrarProfesional", "registrarProfesionalConCodigo"]],
    ["../js/services/professionalPatientAccessService.js", ["registrarPerfilPacienteSeguro"]]
  ]) {
    const raw = await readFile(new URL(path, import.meta.url), "utf8");
    const context = {
      obtenerFunctions: async () => ({}),
      httpsCallable: (_functions, name) => async (data) => { calls.push({ name, data: plain(data) }); return { data: {} }; }
    };
    vm.runInNewContext(withoutImports(raw).replace(/\bexport /gu, "")
      .replace(/import\("https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.2\/firebase-functions\.js"\)/gu, "Promise.resolve({ httpsCallable })"), context);
    for (const name of names) await context[name]({ fechaNacimiento: "1990-05-17", aceptaComunicaciones: true });
  }
  assert.deepEqual(calls.map((call) => call.name), ["registerProfessional", "registerProfessionalWithCode", "registerPatientProfile"]);
  assert.ok(calls.every((call) => call.data.fechaNacimiento === "1990-05-17" && call.data.aceptaComunicaciones === true));
  assert.doesNotMatch(source, /guardarConsentimientosLegales/u, "No debe quedar una segunda escritura obligatoria para completar el alta.");
});
