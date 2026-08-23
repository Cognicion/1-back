"use strict";

const { MAX_STORAGE_BYTES } = require("./config");
const { assertDomain } = require("./errors");

function nonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

function normalizeUsage(value = {}) {
  return {
    usedBytes: nonNegativeInteger(value.usedBytes),
    reservedBytes: nonNegativeInteger(value.reservedBytes),
    maxBytes: MAX_STORAGE_BYTES,
    revision: nonNegativeInteger(value.revision)
  };
}

function availableBytes(usage) {
  const normalized = normalizeUsage(usage);
  return Math.max(0, normalized.maxBytes - normalized.usedBytes - normalized.reservedBytes);
}

function reserveBytes(usage, sizeBytes) {
  const current = normalizeUsage(usage);
  const requested = nonNegativeInteger(sizeBytes, -1);
  assertDomain(requested > 0, "invalid-argument", "El tamaño reservado no es válido.");
  const available = availableBytes(current);
  assertDomain(requested <= available, "resource-exhausted", "No tienes suficiente espacio disponible en Mi nube.", {
    availableBytes: available,
    missingBytes: Math.max(0, requested - available),
    maxBytes: current.maxBytes,
    requestedBytes: requested,
    usedBytes: current.usedBytes
  });
  return {
    ...current,
    reservedBytes: current.reservedBytes + requested,
    revision: current.revision + 1
  };
}

function releaseReservedBytes(usage, sizeBytes) {
  const current = normalizeUsage(usage);
  const released = nonNegativeInteger(sizeBytes, -1);
  assertDomain(released >= 0, "invalid-argument", "El tamaño de la reserva no es válido.");
  return {
    ...current,
    reservedBytes: Math.max(0, current.reservedBytes - released),
    revision: current.revision + 1
  };
}

function commitReservedBytes(usage, reservedSizeBytes, actualSizeBytes) {
  const current = normalizeUsage(usage);
  const reserved = nonNegativeInteger(reservedSizeBytes, -1);
  const actual = nonNegativeInteger(actualSizeBytes, -1);
  assertDomain(reserved > 0 && actual > 0, "invalid-argument", "Los tamaños de confirmación no son válidos.");
  assertDomain(actual === reserved, "failed-precondition", "El tamaño almacenado no coincide con la reserva.", {
    actualSizeBytes: actual,
    reservedSizeBytes: reserved
  });

  const nextReserved = Math.max(0, current.reservedBytes - reserved);
  assertDomain(current.usedBytes + actual + nextReserved <= current.maxBytes, "resource-exhausted", "La confirmación excedería la cuota de Mi nube.");
  return {
    ...current,
    reservedBytes: nextReserved,
    usedBytes: current.usedBytes + actual,
    revision: current.revision + 1
  };
}

function releaseUsedBytes(usage, sizeBytes) {
  const current = normalizeUsage(usage);
  const released = nonNegativeInteger(sizeBytes, -1);
  assertDomain(released >= 0, "invalid-argument", "El tamaño contabilizado no es válido.");
  return {
    ...current,
    usedBytes: Math.max(0, current.usedBytes - released),
    revision: current.revision + 1
  };
}

function reconcileBytes(usage, expectedUsedBytes, expectedReservedBytes) {
  const current = normalizeUsage(usage);
  const usedBytes = nonNegativeInteger(expectedUsedBytes, -1);
  const reservedBytes = nonNegativeInteger(expectedReservedBytes, -1);
  assertDomain(usedBytes >= 0 && reservedBytes >= 0, "invalid-argument", "Los valores de reconciliación no son válidos.");
  assertDomain(usedBytes + reservedBytes <= current.maxBytes, "failed-precondition", "Los registros de Mi nube exceden la cuota configurada.", {
    maxBytes: current.maxBytes,
    reservedBytes,
    usedBytes
  });
  return {
    ...current,
    reservedBytes,
    usedBytes,
    revision: current.revision + 1
  };
}

module.exports = {
  availableBytes,
  commitReservedBytes,
  normalizeUsage,
  reconcileBytes,
  releaseReservedBytes,
  releaseUsedBytes,
  reserveBytes
};
