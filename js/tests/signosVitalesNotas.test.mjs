import test from "node:test";
import assert from "node:assert/strict";
import {
  construirActualizacionSignosVitalesDesdeNota,
  extraerSignosVitalesEstructuradosDeNota,
  resolverSignosVitalesNota
} from "../services/signosVitalesNotas.js";

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

test("resuelve todos los signos estructurados de una nota y conserva su fecha clinica", () => {
  const signos = resolverSignosVitalesNota({
    signosVitales: {
      presionArterial: "100/70",
      frecuenciaCardiaca: 74,
      frecuenciaRespiratoria: 18,
      temperatura: 36.6,
      saturacionOxigeno: 98,
      peso: 68,
      talla: 1.68,
      imc: 24.09,
      glucosa: 95,
      takenAt: "2026-07-27T16:30:00"
    }
  });

  assert.deepEqual(signos, {
    presionArterial: "100/70",
    frecuenciaCardiaca: 74,
    frecuenciaRespiratoria: 18,
    temperatura: 36.6,
    saturacionOxigeno: 98,
    peso: 68,
    talla: 1.68,
    imc: 24.09,
    glucosa: 95,
    fechaToma: "2026-07-27",
    horaToma: "16:30"
  });
});

test("omite campos ausentes y calcula el IMC con la funcion central", () => {
  const signos = resolverSignosVitalesNota({
    observacionFray: {
      presionArterial: "100/70",
      frecuenciaCardiaca: "74",
      temperatura: "36.6",
      peso: "68",
      talla: "1.68",
      fechaNota: "2026-07-27",
      horaNota: "16:30"
    }
  });

  assert.equal(signos.imc, 24.09);
  assert.equal(signos.frecuenciaRespiratoria, undefined);
  assert.equal(signos.saturacionOxigeno, undefined);
  assert.equal(signos.fechaToma, "2026-07-27");
  assert.equal(signos.horaToma, "16:30");
});

test("resuelve una nota parcial sin inventar campos faltantes", () => {
  const signos = resolverSignosVitalesNota({
    observacionFray: {
      presionArterial: "100/70",
      frecuenciaCardiaca: "74",
      temperatura: "36.6"
    }
  });

  assert.deepEqual(signos, {
    presionArterial: "100/70",
    frecuenciaCardiaca: "74",
    temperatura: "36.6",
    fechaToma: "",
    horaToma: ""
  });
});

test("tolera nombres historicos y una nota sin signos vitales", () => {
  assert.deepEqual(resolverSignosVitalesNota({
    pa: "110/70",
    fc: "72",
    temperature: "36.4",
    fechaNota: "26/07/2026",
    horaNota: "08:15"
  }), {
    presionArterial: "110/70",
    frecuenciaCardiaca: "72",
    temperatura: "36.4",
    fechaToma: "2026-07-26",
    horaToma: "08:15"
  });
  assert.equal(resolverSignosVitalesNota({ subjetivo: "Sin datos estructurados" }), null);
});

test("usa el historial vinculado exclusivamente por sourceNoteId", () => {
  const paciente = {
    historialSignosVitales: {
      presionArterial: [
        { sourceNoteId: "nota-otra", valor: "140/90", takenAt: "2026-07-29T10:00:00" },
        { sourceNoteId: "nota-previa", valor: "100/70", takenAt: "2026-06-20T09:45:00" }
      ]
    }
  };
  const signos = resolverSignosVitalesNota(
    { id: "nota-previa" },
    { paciente, sourceNoteId: "nota-previa" }
  );

  assert.equal(signos.presionArterial, "100/70");
  assert.equal(signos.fechaToma, "2026-06-20");
  assert.equal(signos.horaToma, "09:45");
});
