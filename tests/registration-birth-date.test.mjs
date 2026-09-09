import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fechaMaximaNacimiento, fechaNacimientoValida } from "../js/utils/fechaNacimientoRegistro.js";

const require = createRequire(import.meta.url);
const { requireBirthDate, buildRegistrationConsents } = require("../functions/accountSecurity/registrationProfile.js");
class ValidationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const now = new Date("2026-09-09T02:00:00Z");

test("nacimiento: página y servidor coinciden en fechas reales, bisiestos y límite futuro", () => {
  for (const [value, valid] of [
    ["1990-05-17", true], ["2000-02-29", true], ["2024-02-29", true],
    ["1900-02-29", false], ["2001-02-29", false], ["2024-04-31", false],
    ["2026-09-09", true], ["2026-09-10", false], ["0000-01-01", false],
    ["2024-00-01", false], ["2024-13-01", false], ["2024-01-00", false],
    ["17/05/1990", false], ["1990-05-17T00:00:00Z", false], ["", false],
    [undefined, false], [null, false], [{}, false], [19900517, false]
  ]) {
    assert.equal(fechaNacimientoValida(value, now), valid);
    if (valid) assert.equal(requireBirthDate(value, now, ValidationError), value);
    else assert.throws(() => requireBirthDate(value, now, ValidationError), { code: "invalid-argument" });
  }
  assert.equal(fechaMaximaNacimiento(now), "2026-09-09");
});

test("los consentimientos conservan el esquema legal y fecha Timestamp del servidor", () => {
  const result = buildRegistrationConsents(now, true);
  for (const [key, type] of [["privacyNotice", "privacy_notice"], ["betaConsent", "beta_consent"], ["communications", "communications"]]) {
    assert.equal(result.legalConsents[key].accepted, true);
    assert.equal(result.legalConsents[key].acceptedAt.toDate().toISOString(), now.toISOString());
    assert.equal(result.legalConsents[key].source, "signup");
    assert.equal(result.legalConsents[key].documentType, type);
  }
  assert.equal(buildRegistrationConsents(now).legalConsents.communications.accepted, false);
  assert.equal(buildRegistrationConsents(now, "true").legalConsents.communications.accepted, false);
});
