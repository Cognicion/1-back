import assert from "node:assert/strict";
import {
  evaluarMedicamentosPaciente,
  resolverDiagnosticosClinicos
} from "../services/motorClinicoMedicamentos.js";
import { CIE10 } from "../data/catalogoDiagnosticos.js";

function titulos(resultado) {
  return resultado.alertas.map((alerta) => alerta.titulo);
}

function tiene(resultado, fragmento) {
  return titulos(resultado).some((titulo) => titulo.toLowerCase().includes(fragmento.toLowerCase()));
}

let resultado = evaluarMedicamentosPaciente({
  paciente: { alergias: "Alergia grave a sertralina" },
  medicamentos: [{ medicamento: "Sertralina, tabletas de 50 mg." }]
});
assert.ok(tiene(resultado, "alergia registrada"));
assert.equal(resultado.indicador.estado, "bloqueo");

resultado = evaluarMedicamentosPaciente({
  medicamentos: [
    { medicamento: "Linezolid 600 mg" },
    { medicamento: "Sertralina 50 mg" }
  ]
});
assert.ok(tiene(resultado, "Linezolid + serotoninérgico"));
assert.equal(resultado.indicador.estado, "bloqueo");

resultado = evaluarMedicamentosPaciente({
  medicamentos: [
    { medicamento: "Sildenafil 50 mg" },
    { medicamento: "Nitroglicerina sublingual" }
  ]
});
assert.ok(tiene(resultado, "PDE5 + nitrato"));

resultado = evaluarMedicamentosPaciente({
  medicamentos: [
    { medicamento: "Metotrexato 15 mg semanal" },
    { medicamento: "Trimetoprim/sulfametoxazol" }
  ]
});
assert.ok(tiene(resultado, "Metotrexato + trimetoprim"));

resultado = evaluarMedicamentosPaciente({
  paciente: { eGFR: 42 },
  medicamentos: [{ medicamento: "Gabapentina 300 mg" }]
});
assert.ok(tiene(resultado, "Gabapentinoide con función renal reducida"));

const diagnosticos = resolverDiagnosticosClinicos(["Paciente con demencia y adulto mayor fragil"]);
assert.ok(diagnosticos.categorias.includes("demencia"));
assert.ok(diagnosticos.categorias.includes("adulto_mayor"));

assert.equal(CIE10.length, 3183, "Debe usarse el catálogo CIE-10 consolidado.");
assert.ok(CIE10.some((dx) => dx.codigo === "E11"));
assert.ok(CIE10.some((dx) => dx.codigo === "I10"));
assert.ok(CIE10.some((dx) => dx.codigo === "L20"));
assert.ok(CIE10.some((dx) => dx.codigo === "Z63"));

resultado = evaluarMedicamentosPaciente({
  paciente: { diagnosticos: [{ codigo: "6C70", diagnostico: "Piromanía", estado: "confirmado" }] },
  medicamentos: [{ medicamento: "Pramipexol" }]
});
assert.ok(tiene(resultado, "control de los impulsos"));

console.log("Motor clínico extendido validado.");
