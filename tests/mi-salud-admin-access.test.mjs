import test from "node:test";
import assert from "node:assert/strict";
import { resolverAccesoMiSalud } from "../js/services/miSaludAccess.js";

test("un administrador puede abrir la vista previa de Mi Salud sin relación clínica", () => {
  const acceso = resolverAccesoMiSalud({
    actor: { rol: "admin" },
    pacientePreview: "paciente-prueba"
  });

  assert.equal(acceso.permitido, true);
  assert.equal(acceso.vistaPrevia, true);
  assert.equal(acceso.administrador, true);
  assert.equal(acceso.requiereRelacionClinica, false);
});

test("el personal clínico conserva la validación de relación para vista previa", () => {
  const acceso = resolverAccesoMiSalud({
    actor: { rol: "medico" },
    pacientePreview: "paciente-prueba"
  });

  assert.equal(acceso.permitido, true);
  assert.equal(acceso.requiereRelacionClinica, true);
});

test("la vista personal de Mi Salud permanece disponible para paciente y administrador", () => {
  assert.equal(resolverAccesoMiSalud({ actor: { rol: "paciente" } }).permitido, true);
  assert.equal(resolverAccesoMiSalud({ actor: { rol: "admin" } }).permitido, true);
});

test("una cuenta paciente no puede abrir la vista previa de otra persona", () => {
  const acceso = resolverAccesoMiSalud({
    actor: { rol: "paciente" },
    pacientePreview: "paciente-prueba"
  });

  assert.equal(acceso.permitido, false);
  assert.equal(acceso.requiereRelacionClinica, false);
});
