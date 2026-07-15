import assert from "node:assert/strict";
import {
  evaluarMedicamentosPaciente,
  extraerDiagnosticosEstructuradosPaciente
} from "../services/motorClinicoMedicamentos.js";

function textoAlertas(resultado) {
  return JSON.stringify(resultado.alertas);
}

function tieneAlerta(resultado, fragmento) {
  const texto = textoAlertas(resultado).toLowerCase();
  return texto.includes(fragmento.toLowerCase());
}

let resultado = evaluarMedicamentosPaciente({
  medicamentos: [
    { medicamento: "Metilfenidato 10 mg", indicacion: "cada 24 horas" },
    { medicamento: "Atomoxetina 10 mg", indicacion: "cada 24 horas" },
    { medicamento: "Metilfenidato 10 mg", indicacion: "cada 24 horas" }
  ]
});

assert.equal(resultado.medicamentosNormalizados.length, 2, "Las prescripciones exactas repetidas no deben duplicar medicamentos evaluados.");
assert.ok(tieneAlerta(resultado, "presión arterial"), "Metilfenidato + atomoxetina debe advertir riesgo cardiovascular acumulativo.");
assert.ok(tieneAlerta(resultado, "frecuencia cardiaca"), "La alerta debe mencionar frecuencia cardiaca.");
assert.ok(!/carga\s+(?:de\s+)?presi[oó]n\s*\d/i.test(textoAlertas(resultado)), "La UI no debe exponer puntuaciones internas como carga presión 3.");

const repeticion = evaluarMedicamentosPaciente({
  medicamentos: [
    { medicamento: "Metilfenidato 10 mg", indicacion: "cada 24 horas" },
    { medicamento: "Atomoxetina 10 mg", indicacion: "cada 24 horas" },
    { medicamento: "Metilfenidato 10 mg", indicacion: "cada 24 horas" }
  ]
});
assert.equal(repeticion.alertas.length, resultado.alertas.length, "Evaluar varias veces el mismo arreglo no debe acumular alertas.");

resultado = evaluarMedicamentosPaciente({
  medicamentos: [
    { medicamento: "Paracetamol 500 mg", indicacion: "cada 8 horas" },
    { medicamento: "Acetaminofén 750 mg", indicacion: "cada 12 horas" }
  ]
});
assert.equal(resultado.medicamentosNormalizados.length, 2, "Mismo principio activo con posologías distintas debe conservarse para revisión.");
assert.ok(tieneAlerta(resultado, "duplicidad terapéutica"), "Debe alertar duplicidad de principio activo.");

resultado = evaluarMedicamentosPaciente({
  paciente: {
    diagnosticos: [
      { codigo: "I10", nombre: "Hipertensión arterial", estado: "descartado" }
    ]
  },
  medicamentos: [
    { medicamento: "Metilfenidato 10 mg" },
    { medicamento: "Atomoxetina 10 mg" }
  ]
});
assert.ok(resultado.diagnosticosEvaluados.some((dx) => dx.estado === "descartado"), "Los diagnósticos descartados deben conservarse como evaluados.");
assert.ok(!resultado.alertas.some((alerta) => (alerta.diagnosticos || []).includes("Hipertensión arterial / riesgo cardiovascular")), "Un diagnóstico descartado no debe generar contraindicación activa.");

resultado = evaluarMedicamentosPaciente({
  paciente: {
    diagnosticos: [
      { codigo: "I49", nombre: "Taquiarritmia en estudio", estado: "probable" }
    ]
  },
  medicamentos: [
    { medicamento: "Metilfenidato 10 mg" },
    { medicamento: "Atomoxetina 10 mg" }
  ]
});
assert.ok(resultado.diagnosticosProbables.some((dx) => dx.texto.includes("Taquiarritmia")), "Los diagnósticos probables deben separarse.");

const estructurados = extraerDiagnosticosEstructuradosPaciente({
  diagnosticos: [{ codigo: "F33.2", nombre: "Trastorno depresivo recurrente", estado: "confirmado" }]
});
assert.deepEqual(estructurados.map((dx) => dx.codigo), ["F33.2"], "No debe inventar ni perder códigos diagnósticos existentes.");

console.log("Laboratorio de farmacología: interacciones, duplicados y estados diagnósticos validados.");
