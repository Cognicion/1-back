"use strict";

const { Timestamp } = require("firebase-admin/firestore");
const LEGAL_VERSION = "2026-08-01";

function requireBirthDate(value, now, ErrorType) {
  const date = typeof value === "string" ? value.trim() : "";
  const parsed = /^\d{4}-\d{2}-\d{2}$/u.test(date)
    ? new Date(`${date}T00:00:00.000Z`)
    : new Date(NaN);
  if (!date || date.startsWith("0000-") || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== date || date > now.toISOString().slice(0, 10)) {
    throw new ErrorType("invalid-argument", "La fecha de nacimiento es obligatoria, debe ser una fecha real y no puede estar en el futuro.");
  }
  return date;
}

// Mismo esquema que legalConsentService, persistido en la transacción del alta.
function buildRegistrationConsents(now, communications = false) {
  const acceptedAt = Timestamp.fromDate(now);
  const consent = (documentType, accepted) => ({
    accepted, version: LEGAL_VERSION, acceptedAt, source: "signup", documentType
  });
  return {
    legalConsents: {
      privacyNotice: consent("privacy_notice", true),
      betaConsent: consent("beta_consent", true),
      communications: consent("communications", communications === true)
    },
    legalConsentVersion: LEGAL_VERSION,
    legalConsentUpdatedAt: acceptedAt
  };
}

module.exports = { LEGAL_VERSION, requireBirthDate, buildRegistrationConsents };
