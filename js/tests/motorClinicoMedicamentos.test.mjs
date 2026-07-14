import assert from "node:assert/strict";
import {
  evaluarMedicamentosPaciente,
  normalizarMedicamentoClinico,
  resolverDiagnosticosClinicos
} from "../services/motorClinicoMedicamentos.js";

function titulos(resultado) {
  return resultado.alertas.map((alerta) => alerta.titulo);
}

function tiene(resultado, fragmento) {
  return titulos(resultado).some((titulo) => titulo.toLowerCase().includes(fragmento.toLowerCase()));
}

let resultado = evaluarMedicamentosPaciente({
  paciente: {
    diagnosticos: ["Insuficiencia hepática crónica Child-Pugh A, antecedente hepatitis B"]
  },
  medicamentos: [{ medicamento: "Paracetamol, tabletas de 500 mg." }]
});
assert.ok(tiene(resultado, "Paracetamol en hepatopatía"), "Paracetamol debe alertar en hepatopatía Child-Pugh A.");
assert.equal(resultado.alertas.find((a) => a.titulo.includes("Paracetamol"))?.severidad, "moderada");

resultado = evaluarMedicamentosPaciente({
  paciente: { diagnosticos: ["Cirrosis Child-Pugh C descompensada"] },
  medicamentos: [{ medicamento: "Acetaminofén 500 mg" }]
});
assert.equal(resultado.alertas.find((a) => a.titulo.includes("Paracetamol"))?.severidad, "alta");

resultado = evaluarMedicamentosPaciente({
  paciente: { diagnosticos: ["Paciente sin hepatopatía ni insuficiencia renal"] },
  medicamentos: [{ medicamento: "Paracetamol, tabletas de 500 mg." }]
});
assert.ok(!tiene(resultado, "Paracetamol en hepatopatía"), "No debe alertar hepatopatía sin diagnóstico compatible.");

resultado = evaluarMedicamentosPaciente({
  paciente: { diagnosticos: ["Enfermedad renal crónica estadio 3"] },
  medicamentos: [{ medicamento: "Ibuprofeno 400 mg" }]
});
assert.ok(tiene(resultado, "AINE en insuficiencia renal"));

resultado = evaluarMedicamentosPaciente({
  paciente: { diagnosticos: ["Insuficiencia renal crónica"] },
  medicamentos: [{ medicamento: "Metformina 850 mg" }]
});
assert.ok(tiene(resultado, "Metformina"));

resultado = evaluarMedicamentosPaciente({
  paciente: { diagnosticos: ["Epilepsia desde la infancia"] },
  medicamentos: [{ medicamento: "Bupropión 150 mg" }]
});
assert.ok(tiene(resultado, "Bupropión"));

resultado = evaluarMedicamentosPaciente({
  paciente: { diagnosticos: ["Embarazo de 9 semanas"] },
  medicamentos: [{ medicamento: "Ácido valproico 500 mg" }]
});
assert.ok(tiene(resultado, "Valproato en embarazo"));
assert.equal(resultado.indicador.estado, "bloqueo");

resultado = evaluarMedicamentosPaciente({
  medicamentos: [
    { medicamento: "Lorazepam, tabletas de 1 mg." },
    { medicamento: "Tramadol con paracetamol, tabletas." }
  ]
});
assert.ok(tiene(resultado, "Opioide + benzodiacepina"));
assert.ok(resultado.alertas.some((alerta) => alerta.titulo.includes("Carga sedante")));

resultado = evaluarMedicamentosPaciente({
  medicamentos: [
    { medicamento: "Haloperidol 5 mg" },
    { medicamento: "Escitalopram 10 mg" }
  ]
});
assert.ok(resultado.alertas.some((alerta) => alerta.titulo.includes("Carga acumulativa de QT")));

resultado = evaluarMedicamentosPaciente({
  medicamentos: [
    { medicamento: "Warfarina 5 mg" },
    { medicamento: "Naproxeno 250 mg" }
  ]
});
assert.ok(tiene(resultado, "Anticoagulante/antiagregante + AINE"));

resultado = evaluarMedicamentosPaciente({
  medicamentos: [
    { medicamento: "Carbonato de litio 300 mg" },
    { medicamento: "Diclofenaco 50 mg" }
  ]
});
assert.ok(tiene(resultado, "Litio + AINE"));

resultado = evaluarMedicamentosPaciente({
  medicamentos: [
    { medicamento: "Litio 300 mg" },
    { medicamento: "Furosemida 40 mg" }
  ]
});
assert.ok(tiene(resultado, "Litio + diurético"));

resultado = evaluarMedicamentosPaciente({
  medicamentos: [
    { medicamento: "Biperideno 2 mg" },
    { medicamento: "Amitriptilina 25 mg" }
  ]
});
assert.ok(tiene(resultado, "Carga anticolinérgica"));

assert.ok(normalizarMedicamentoClinico("Tempra 500 mg").ingredienteIds.includes("paracetamol"));
assert.ok(normalizarMedicamentoClinico("Zaldiar").ingredienteIds.includes("tramadol"));
assert.ok(normalizarMedicamentoClinico("Zaldiar").ingredienteIds.includes("paracetamol"));

resultado = evaluarMedicamentosPaciente({
  medicamentos: [
    { medicamento: "Carbamazepina 200 mg" },
    { medicamento: "Quetiapina 100 mg" }
  ]
});
assert.ok(resultado.alertas.some((alerta) => alerta.tipo === "interaccion_farmacocinetica_inferida" && alerta.evidencia === "potencial"));

resultado = evaluarMedicamentosPaciente({
  paciente: { diagnosticos: ["insufisiencia hepatica cronica child pugh a"] },
  medicamentos: [{ medicamento: "paracetamol" }, { medicamento: "paracetamol" }]
});
assert.ok(tiene(resultado, "Paracetamol en hepatopatía"), "Debe activar con typo clínico frecuente.");
const ids = resultado.alertas.map((alerta) => alerta.id);
assert.equal(new Set(ids).size, ids.length, "No debe duplicar alertas idénticas.");

resultado = evaluarMedicamentosPaciente({
  medicamentos: [{ medicamento: "Medicamento prueba", dosisDia: "-5 mg/día" }]
});
assert.equal(resultado.indicador.estado, "bloqueo");
assert.equal(resultado.alertas[0].tipo, "bloqueo_tecnico");

const diagnosticos = resolverDiagnosticosClinicos(["antecedente hepatitis B child pugh A"]);
assert.ok(diagnosticos.categorias.includes("funcion_hepatica"));

console.log("Motor clínico de medicamentos validado.");
