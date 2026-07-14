import assert from "node:assert/strict";
import {
  evaluarMedicamentosPaciente,
  resolverDiagnosticosClinicos
} from "../services/motorClinicoMedicamentos.js";
import { CRITERIOS_DIAGNOSTICOS_EXTENDIDOS } from "../data/diagnosticosClinicosExtendidos.js";

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

assert.ok(CRITERIOS_DIAGNOSTICOS_EXTENDIDOS.length >= 100, "Debe existir catálogo extendido de al menos 100 diagnósticos.");
assert.ok(CRITERIOS_DIAGNOSTICOS_EXTENDIDOS.some((dx) => dx.codigo === "E11"));
assert.ok(CRITERIOS_DIAGNOSTICOS_EXTENDIDOS.some((dx) => dx.codigo === "I10"));
assert.ok(CRITERIOS_DIAGNOSTICOS_EXTENDIDOS.some((dx) => dx.codigo === "L20"));
assert.ok(CRITERIOS_DIAGNOSTICOS_EXTENDIDOS.some((dx) => dx.codigo === "Z63"));

console.log("Motor clínico extendido validado.");

