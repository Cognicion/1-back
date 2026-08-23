"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MAX_STORAGE_BYTES } = require("../cloudStorage/config");
const {
  availableBytes,
  commitReservedBytes,
  normalizeUsage,
  reconcileBytes,
  releaseReservedBytes,
  releaseUsedBytes,
  reserveBytes
} = require("../cloudStorage/quotaTransitions");

test("la cuota normaliza campos manipulados y conserva el máximo del servidor", () => {
  assert.deepEqual(normalizeUsage({ usedBytes: -20, reservedBytes: "x", maxBytes: 999999999, revision: 4 }), {
    usedBytes: 0,
    reservedBytes: 0,
    maxBytes: MAX_STORAGE_BYTES,
    revision: 4
  });
});

test("una reserva considera simultáneamente bytes usados y reservados", () => {
  const usage = {
    usedBytes: 200 * 1024 * 1024,
    reservedBytes: 40 * 1024 * 1024,
    revision: 8
  };
  const next = reserveBytes(usage, 10 * 1024 * 1024);
  assert.equal(next.usedBytes, usage.usedBytes);
  assert.equal(next.reservedBytes, 50 * 1024 * 1024);
  assert.equal(availableBytes(next), 0);
  assert.equal(next.revision, 9);

  assert.throws(() => reserveBytes(next, 1), (error) => {
    assert.equal(error.code, "resource-exhausted");
    assert.equal(error.details.availableBytes, 0);
    assert.equal(error.details.missingBytes, 1);
    return true;
  });
});

test("confirmar mueve exactamente la reserva a uso sin duplicar bytes", () => {
  const reserved = reserveBytes({ usedBytes: 100, reservedBytes: 0, revision: 0 }, 50);
  const committed = commitReservedBytes(reserved, 50, 50);
  assert.equal(committed.usedBytes, 150);
  assert.equal(committed.reservedBytes, 0);
  assert.equal(committed.revision, 2);
  assert.throws(() => commitReservedBytes(reserved, 50, 49), (error) => error.code === "failed-precondition");
});

test("cancelar y eliminar nunca producen contadores negativos", () => {
  assert.equal(releaseReservedBytes({ reservedBytes: 10 }, 20).reservedBytes, 0);
  assert.equal(releaseUsedBytes({ usedBytes: 10 }, 20).usedBytes, 0);
});

test("reconciliar reemplaza ambos agregados y rechaza registros sobre cuota", () => {
  const reconciled = reconcileBytes({ usedBytes: 50, reservedBytes: 20, revision: 3 }, 40, 10);
  assert.deepEqual(reconciled, {
    usedBytes: 40,
    reservedBytes: 10,
    maxBytes: MAX_STORAGE_BYTES,
    revision: 4
  });
  assert.throws(() => reconcileBytes({}, MAX_STORAGE_BYTES, 1), (error) => error.code === "failed-precondition");
});
