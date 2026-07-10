import assert from "node:assert/strict";
import fs from "node:fs";

function cargarModulo(ruta, nombres) {
  let code = fs.readFileSync(ruta, "utf8")
    .replace(/import[^;]+;\n/g, "")
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ");
  code += `\nreturn { ${nombres.join(", ")} };`;
  return new Function(code)();
}

const ion = cargarModulo("D:/Escritorio/PROYECTO COGNICION/1-back/js/neurofisiologia/ionModel.js", ["ESTADO_MEMBRANA_BASE", "aplicarPresetMembrana", "calcularNernst", "calcularGHK", "calcularPotencialesEquilibrio", "validarEstadoMembrana"]);
const action = cargarModulo("D:/Escritorio/PROYECTO COGNICION/1-back/js/neurofisiologia/actionPotentialModel.js", ["simularPotencialAccion"]);

let actionCode = fs.readFileSync("D:/Escritorio/PROYECTO COGNICION/1-back/js/neurofisiologia/actionPotentialModel.js", "utf8")
  .replace(/export const /g, "const ")
  .replace(/export function /g, "function ");
let axonCode = fs.readFileSync("D:/Escritorio/PROYECTO COGNICION/1-back/js/neurofisiologia/axonPropagationModel.js", "utf8")
  .replace(/import[^;]+;\n/g, "")
  .replace(/export const /g, "const ")
  .replace(/export function /g, "function ");
axonCode = `${actionCode}\n${axonCode}\nreturn { PARAMETROS_AXON_BASE, calcularVelocidadConduccion, simularPropagacionAxonal };`;
const axon = new Function(axonCode)();

const estado = ion.aplicarPresetMembrana("fisiologica");
const ek = ion.calcularNernst({ intra: 140, extra: 4, z: 1, temperaturaC: 37 });
assert.ok(ek < -80 && ek > -105, `EK fisiologico esperado aprox -95 mV, obtenido ${ek}`);
const ena = ion.calcularPotencialesEquilibrio(estado).na;
assert.ok(ena > 55 && ena < 75, `ENa esperado positivo alto, obtenido ${ena}`);
const vm = ion.calcularGHK(estado);
assert.ok(vm < -55 && vm > -85, `Vm reposo educativo esperado negativo, obtenido ${vm}`);
assert.equal(ion.validarEstadoMembrana(estado).valido, true);

const sub = action.simularPotencialAccion({ estimulo: { inicio: 5, duracion: 1, intensidad: 2 } });
assert.equal(sub.resumen.superoUmbral, false, "Estimulo subumbral no debe generar PA completo");
const supra = action.simularPotencialAccion({ estimulo: { inicio: 5, duracion: 1, intensidad: 14 } });
assert.equal(supra.resumen.superoUmbral, true, "Estimulo suprumbral debe generar PA");
assert.ok(supra.resumen.refractarioAbsoluto, "Debe identificar refractariedad absoluta aproximada");

const vAmiel = axon.calcularVelocidadConduccion({ mielina: false, diametroUm: 2 });
const vMiel = axon.calcularVelocidadConduccion({ mielina: true, diametroUm: 2 });
assert.ok(vMiel > vAmiel, "Mielina debe aumentar velocidad");
const vGrande = axon.calcularVelocidadConduccion({ mielina: false, diametroUm: 8 });
assert.ok(vGrande > vAmiel, "Mayor diametro debe aumentar velocidad");
const vLesion = axon.calcularVelocidadConduccion({ mielina: true, desmielinizacion: { activa: true, severidad: 0.8 } });
assert.ok(vLesion < vMiel, "Desmielinizacion debe reducir velocidad");
const prop = axon.simularPropagacionAxonal({ mielina: true, electrodos: [10, 30, 60] });
assert.equal(prop.electrodos.length, 3);
assert.ok(prop.electrodos[2].retraso > prop.electrodos[0].retraso, "Electrodos distales deben retrasarse mas");
console.log("Pruebas neurofisiologia OK");