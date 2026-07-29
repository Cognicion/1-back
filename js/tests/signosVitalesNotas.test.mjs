import test from "node:test";
import assert from "node:assert/strict";
import { construirActualizacionSignosVitalesDesdeNota, extraerSignosVitalesEstructuradosDeNota } from "../services/signosVitalesNotas.js";

test("extrae únicamente signos vitales estructurados de la nota", () => {
  const valores = extraerSignosVitalesEstructuradosDeNota({
    observacionFray: { presionArterial: "100/70", frecuenciaCardiaca: "74", fechaNota: "2026-07-27", horaNota: "16:30" },
    objetivo: "PA 120/80 en texto libre"
  });
  assert.deepEqual(valores, { presionArterial: "100/70", frecuenciaCardiaca: "74" });
});

test("actualiza el registro vinculado por sourceNoteId sin duplicarlo", () => {
  const nota = { observacionFray: { presionArterial: "100/70", peso: "43", fechaNota: "2026-07-27", horaNota: "16:30" } };
  const paciente = { historialSignosVitales: { presionArterial: [{ sourceNoteId: "nota-1", valor: "90/60" }] } };
  const actualizacion = construirActualizacionSignosVitalesDesdeNota({ paciente, nota, sourceNoteId: "nota-1", createdBy: "medico-1" });
  assert.equal(actualizacion.historialSignosVitales.presionArterial.length, 1);
  assert.equal(actualizacion.historialSignosVitales.presionArterial[0].valor, "100/70");
  assert.equal(actualizacion.historialSignosVitales.peso[0].sourceType, "clinical_note");
  assert.match(actualizacion.historialSignosVitales.peso[0].takenAt, /^2026-07-27T/);
});
