import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  formatearResumenDiarioTratamiento,
  normalizarEntradasClinicas,
  obtenerDosisDiariaTratamiento
} from "../js/utils/tratamientoIndicaciones.js";

test("Clonazepam importado suma fracciones y muestra 2 mg/día", () => {
  const tratamiento = {
    medicamento: "Clonazepam",
    dosisValor: 2,
    dosisUnidad: "mg",
    frecuencia: "3 veces al día",
    horarios: [
      { time: "08:00", quantity: 0.25, administrationUnit: "tableta" },
      { time: "15:00", quantity: 0.25, administrationUnit: "tableta" },
      { time: "22:00", quantity: 0.5, administrationUnit: "tableta" }
    ]
  };

  assert.equal(obtenerDosisDiariaTratamiento(tratamiento), "2 mg/día");
  assert.equal(formatearResumenDiarioTratamiento(tratamiento), "Clonazepam 2 mg/día");
});

test("tratamiento manual multiplica unidades administradas por la presentación", () => {
  const tratamiento = {
    medicamento: "Sertralina, tabletas de 50 mg.",
    presentacion: "Tableta 50 mg",
    frecuencia: "1 vez al día",
    tomas: [{ cantidad: "1", horario: "08:00" }]
  };

  assert.equal(
    formatearResumenDiarioTratamiento(tratamiento, "Sertralina"),
    "Sertralina 50 mg/día"
  );
});

test("dosis por toma sin horarios se multiplica por la frecuencia", () => {
  assert.equal(obtenerDosisDiariaTratamiento({
    medicamento: "Risperidona",
    dosis: "2 mg",
    frecuencia: "2 veces al día"
  }), "4 mg/día");
});

test("una solución usa la proporción concentración/volumen", () => {
  assert.equal(obtenerDosisDiariaTratamiento({
    medicamento: "Solución de prueba",
    presentacion: "Solución oral 20 mg/5 mL",
    horarios: [
      { quantity: 5, administrationUnit: "mL" },
      { quantity: 5, administrationUnit: "mL" }
    ]
  }), "40 mg/día");
});

test("respeta dosis diaria explícita y no inventa total fijo para PRN", () => {
  assert.equal(obtenerDosisDiariaTratamiento({ dosisTotalDia: "150mg/dia" }), "150 mg/día");
  assert.equal(obtenerDosisDiariaTratamiento({
    dosisTotalDia: "1 unidad/día",
    presentacion: "Tableta 2 mg"
  }), "2 mg/día");
  assert.equal(obtenerDosisDiariaTratamiento({ dosis: "1 mg", frecuencia: "PRN" }), "dosis diaria variable (PRN)");
});

test("valores nulos no se convierten en renglones clínicos", () => {
  assert.deepEqual(
    normalizarEntradasClinicas([null, undefined, false, "null", "undefined", "Sertralina 50 mg"]),
    [{ texto: "Sertralina 50 mg", condicionada: false }]
  );
});

test("la tarjeta del expediente usa el resumen diario y filtra null", async () => {
  const [pacienteJs, pacienteHtml] = await Promise.all([
    readFile(new URL("../js/paciente.js", import.meta.url), "utf8"),
    readFile(new URL("../paciente.html", import.meta.url), "utf8")
  ]);

  assert.match(pacienteJs, /function listaTratamientosLaboratorio/);
  assert.match(pacienteJs, /formatearResumenDiarioTratamiento/);
  assert.match(pacienteJs, /nombreMedicamentoResumenTratamiento/);
  assert.match(pacienteJs, /\^\(\?:null\|undefined\)\$/);
  assert.match(pacienteJs, /VERSION_RESUMEN_EXPEDIENTE = "1\.42"/);
  assert.match(pacienteHtml, /treatment-daily-dose-summary-v1/);
});
