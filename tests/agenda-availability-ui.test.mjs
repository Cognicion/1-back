import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

// Real browser DOM and the production controller; only the domain transport is
// replaced. No server, Firebase session, credentials or production writes.
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright"); } catch {}
const source = (await readFile(new URL("../js/services/agendaAvailabilitySettings.js", import.meta.url), "utf8"))
  .replace(/^import[^\n]+\n/u, "const executeAppointmentCommand = (...args) => window.command(...args); const appointmentErrorCode = (error) => error.code || 'internal';\n");
let browser;
before(async () => { if (playwright) browser = await playwright.chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "chrome", headless: true }); });
after(async () => { await browser?.close(); });

const settings = {
  timeZone: "America/Mexico_City", bookingEnabled: true,
  weeklySchedule: { monday: [{ start: "09:00", end: "14:00" }, { start: "16:00", end: "24:00" }] },
  dateExceptions: [{ date: "2026-12-24", intervals: [] }],
  slotDurationMinutes: 45, bufferBeforeMinutes: 10, bufferAfterMinutes: 15,
  minimumBookingNoticeMinutes: 180, maximumBookingAdvanceDays: 90
};
const result = { settings, bookingReady: true, availabilityMode: "configured" };
async function fixture(t) {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.route("**/*", (route) => route.abort());
  await page.setContent('<section id="settings"><form><input data-timezone required><input type="checkbox" data-booking-enabled><div data-weekly-schedule></div><button type="submit" data-save-availability>Guardar</button><button type="button" data-reload-availability>Volver a cargar</button><p data-availability-status role="status"></p></form></section>');
  await page.evaluate(async ({ source, result }) => {
    window.calls = [];
    window.saved = [];
    window.result = result;
    window.command = async (command) => {
      window.calls.push(command);
      return command.action === "availabilitySettings" ? window.result : { ...window.result, settings: command.settings };
    };
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const module = await import(url);
    URL.revokeObjectURL(url);
    window.initialize = module.initializeAgendaAvailabilitySettings;
    window.root = document.querySelector("#settings");
  }, { source, result });
  return page;
}
const options = { skip: !playwright, timeout: 15000 };

test("disponibilidad: reutiliza lectura inicial y conserva ajustes no expuestos al guardar", options, async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.initialize(window.root, { initialResult: window.result, onSaved: (value) => window.saved.push(value) }));
  assert.equal(await page.evaluate(() => window.calls.length), 0);
  assert.equal(await page.locator(".schedule-day").count(), 7);
  assert.equal(await page.locator("[data-closed-day]:visible").count(), 6);
  assert.equal(await page.locator('[data-day="monday"] [data-end]').nth(1).inputValue(), "24:00");
  await page.fill("[data-timezone]", "America/Tijuana");
  await page.click("[data-save-availability]");
  await page.waitForFunction(() => window.saved.length === 1);
  const actual = await page.evaluate(() => window.calls[0]);
  assert.equal(actual.action, "updateAvailabilitySettings");
  assert.equal(actual.settings.timeZone, "America/Tijuana");
  for (const key of ["dateExceptions", "slotDurationMinutes", "bufferBeforeMinutes", "bufferAfterMinutes", "minimumBookingNoticeMinutes", "maximumBookingAdvanceDays"]) assert.deepEqual(actual.settings[key], settings[key], key);
  assert.deepEqual(actual.settings.weeklySchedule.monday, settings.weeklySchedule.monday);
  assert.deepEqual(actual.settings.weeklySchedule.tuesday, []);
  assert.equal(await page.evaluate(() => window.result.settings.timeZone), "America/Mexico_City");
});

test("disponibilidad: error de lectura bloquea guardado y reintento recupera estado real", options, async (t) => {
  const page = await fixture(t);
  await page.evaluate(async () => {
    window.command = async (command) => { window.calls.push(command); throw Object.assign(new Error(), { code: "unavailable" }); };
    window.loaded = [];
    await window.initialize(window.root, { onLoaded: (result) => window.loaded.push(result) });
    window.root.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  assert.equal(await page.locator("[data-save-availability]").isDisabled(), true);
  assert.match(await page.locator("[data-availability-status]").textContent(), /No se pudo cargar/);
  assert.equal(await page.evaluate(() => window.calls.length), 1);
  await page.evaluate(() => { window.command = async (command) => { window.calls.push(command); return window.result; }; });
  await page.click("[data-reload-availability]");
  await page.waitForFunction(() => window.root.dataset.availabilityState === "ready");
  assert.equal(await page.locator("[data-save-availability]").isDisabled(), false);
  assert.equal(await page.inputValue("[data-timezone]"), settings.timeZone);
  assert.equal(await page.evaluate(() => window.calls.length), 2);
  assert.equal(await page.evaluate(() => window.loaded.length), 1);
  assert.equal(await page.evaluate(() => window.loaded[0].settings.timeZone), settings.timeZone);
});

test("disponibilidad: falta de autorización se diferencia de configuración ausente", options, async (t) => {
  const page = await fixture(t);
  await page.evaluate(async () => {
    window.command = async () => { throw Object.assign(new Error(), { code: "permission-denied" }); };
    window.cleanup = await window.initialize(window.root);
  });
  assert.match(await page.locator("[data-availability-status]").textContent(), /No autorizado/);
  await page.evaluate(async () => { window.cleanup(); await window.initialize(window.root, { initialResult: { settings: null, bookingReady: false } }); });
  assert.match(await page.locator("[data-availability-status]").textContent(), /Aún no hay una configuración/);
  assert.equal(await page.locator("[data-closed-day]:visible").count(), 7);
  assert.equal(await page.locator("[data-save-availability]").isDisabled(), false);
});

test("disponibilidad: agregar/eliminar intervalos conserva día cerrado y foco de teclado", options, async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => window.initialize(window.root, { initialResult: window.result }));
  const day = page.locator('[data-day="tuesday"]');
  await day.locator("[data-add-interval]").click();
  assert.equal(await day.locator("[data-closed-day]").isVisible(), false);
  assert.equal(await day.locator("[data-start]").evaluate((element) => element === document.activeElement), true);
  await day.locator("[data-remove-interval]").click();
  assert.equal(await day.locator("[data-closed-day]").isVisible(), true);
  assert.equal(await day.locator("[data-add-interval]").evaluate((element) => element === document.activeElement), true);
});

test("disponibilidad: inicializar dos veces y doble submit sólo envía una operación", options, async (t) => {
  const page = await fixture(t);
  await page.evaluate(async () => {
    window.cleanup = await window.initialize(window.root, { initialResult: window.result });
    window.secondCleanup = await window.initialize(window.root);
    window.command = (command) => { window.calls.push(command); return new Promise((resolve) => { window.finishSave = () => resolve({ ...window.result, settings: command.settings }); }); };
    const form = window.root.querySelector("form");
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  assert.equal(await page.evaluate(() => window.cleanup === window.secondCleanup), true);
  assert.equal(await page.evaluate(() => window.calls.length), 1);
  assert.equal(await page.locator("[data-save-availability]").isDisabled(), true);
  await page.evaluate(() => window.finishSave());
  await page.waitForFunction(() => !window.root.querySelector("[data-save-availability]").disabled);
  await page.evaluate(() => { window.cleanup(); window.root.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  assert.equal(await page.evaluate(() => window.calls.length), 1);
});

test("disponibilidad: solapamiento rechazado conserva edición y permite reintentar", options, async (t) => {
  const page = await fixture(t);
  await page.evaluate(async () => {
    await window.initialize(window.root, { initialResult: window.result });
    window.command = async (command) => { window.calls.push(command); throw Object.assign(new Error(), { code: "overlapping-working-interval" }); };
  });
  await page.locator('[data-day="monday"] [data-start]').nth(1).fill("13:00");
  await page.click("[data-save-availability]");
  await page.waitForFunction(() => window.root.querySelector("[data-availability-status]").textContent.includes("sin solapamientos"));
  assert.equal(await page.locator('[data-day="monday"] [data-start]').nth(1).inputValue(), "13:00");
  assert.equal(await page.locator("[data-save-availability]").isDisabled(), false);
  assert.equal(await page.evaluate(() => window.calls.length), 1);
});

test("disponibilidad: respuesta tardía tras cleanup no actualiza UI ni registra listeners", options, async (t) => {
  const page = await fixture(t);
  await page.evaluate(async () => {
    window.cleanup = await window.initialize(window.root, { initialResult: window.result });
    window.command = () => new Promise((resolve) => { window.finishLoad = () => resolve({ ...window.result, settings: { ...window.result.settings, timeZone: "Europe/Madrid" } }); });
    window.root.querySelector("[data-reload-availability]").click();
    window.cleanup();
    window.finishLoad();
    await Promise.resolve();
  });
  assert.equal(await page.inputValue("[data-timezone]"), settings.timeZone);
  assert.equal(await page.evaluate(() => window.root.dataset.availabilityReady), undefined);
});

test("disponibilidad: recargar tras guardar recupera jornada persistida por el servicio", options, async (t) => {
  const page = await fixture(t);
  await page.evaluate(async () => {
    window.persisted = structuredClone(window.result);
    window.command = async (command) => {
      window.calls.push(command);
      if (command.action === "updateAvailabilitySettings") window.persisted.settings = structuredClone(command.settings);
      return structuredClone(window.persisted);
    };
    await window.initialize(window.root);
  });
  await page.fill("[data-timezone]", "America/Tijuana");
  await page.locator('[data-day="monday"] [data-start]').nth(0).fill("08:00");
  await page.click("[data-save-availability]");
  await page.waitForFunction(() => window.root.querySelector("[data-availability-status]").textContent.includes("guardada"));
  await page.fill("[data-timezone]", "Europe/Madrid");
  await page.click("[data-reload-availability]");
  await page.waitForFunction(() => window.root.querySelector("[data-timezone]").value === "America/Tijuana");
  assert.equal(await page.locator('[data-day="monday"] [data-start]').nth(0).inputValue(), "08:00");
  assert.deepEqual(await page.evaluate(() => window.calls.map(({ action }) => action)), ["availabilitySettings", "updateAvailabilitySettings", "availabilitySettings"]);
  assert.deepEqual(await page.evaluate(() => window.persisted.settings.dateExceptions), settings.dateExceptions);
});

test("disponibilidad: abortar carga inicial permite cambiar de sesión sin respuestas cruzadas", options, async (t) => {
  const page = await fixture(t);
  await page.evaluate(async () => {
    const abort = new AbortController();
    const pending = new Promise((resolve) => { window.oldLoad = resolve; });
    window.oldInitialization = window.initialize(window.root, { initialResult: pending, signal: abort.signal });
    abort.abort();
    await window.initialize(window.root, { initialResult: { ...window.result, settings: { ...window.result.settings, timeZone: "Europe/Madrid" } } });
    window.oldLoad(window.result);
    const oldCleanup = await window.oldInitialization;
    oldCleanup();
  });
  assert.equal(await page.inputValue("[data-timezone]"), "Europe/Madrid");
  assert.equal(await page.evaluate(() => window.root.dataset.availabilityReady), "true");
  assert.equal(await page.locator("[data-save-availability]").isDisabled(), false);
});
