import assert from "node:assert/strict";
import { evaluarMedicamentosPaciente } from "../services/motorClinicoMedicamentos.js";

function textoAlertas(resultado) {
  return JSON.stringify(resultado.alertas).toLowerCase();
}

function tieneAlerta(resultado, fragmento) {
  return textoAlertas(resultado).includes(fragmento.toLowerCase());
}

let resultado = evaluarMedicamentosPaciente({
  paciente: { comorbilidades: "E66.1 - Obesidad endógena" },
  medicamentos: [{ medicamento: "Risperidona" }]
});

assert.ok(tieneAlerta(resultado, "antipsicótico en obesidad"), "Risperidona + E66.1 debe advertir riesgo metabólico por antipsicótico.");
assert.ok(tieneAlerta(resultado, "peso/imc"), "La alerta metabólica debe pedir vigilancia ponderal.");
assert.ok(tieneAlerta(resultado, "glucosa"), "La alerta metabólica debe pedir vigilancia glucémica.");

resultado = evaluarMedicamentosPaciente({
  paciente: {
    diagnosticos: [
      { codigo: "E11", nombre: "Diabetes mellitus no insulinodependiente", estado: "confirmado" }
    ]
  },
  medicamentos: [{ medicamento: "Olanzapina" }]
});

assert.ok(tieneAlerta(resultado, "olanzapina en diabetes"), "Olanzapina + diabetes debe generar alerta metabólica alta.");
assert.ok(tieneAlerta(resultado, "hba1c"), "La alerta de diabetes debe incluir HbA1c.");

resultado = evaluarMedicamentosPaciente({
  paciente: {
    diagnosticos: [
      { codigo: "E66.1", nombre: "Obesidad endógena", estado: "descartado" }
    ]
  },
  medicamentos: [{ medicamento: "Risperidona" }]
});

assert.ok(!tieneAlerta(resultado, "antipsicótico en obesidad"), "Un diagnóstico metabólico descartado no debe activar alerta contextual.");

console.log("Motor clínico: alertas metabólicas medicamento-diagnóstico validadas.");
