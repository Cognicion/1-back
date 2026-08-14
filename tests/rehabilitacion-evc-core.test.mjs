import assert from "node:assert/strict";
import {
  DOMINIOS_EVC,
  generarPlanEvc,
  nivelDificultadEvc,
  normalizarEvaluacionEvc,
  resumirPlanEvc
} from "../js/rehabilitacion-evc-core.js";

assert.equal(DOMINIOS_EVC.length, 6);
assert.deepEqual(DOMINIOS_EVC.map((dominio) => dominio.id), [
  "atencion",
  "memoria",
  "ejecutivas",
  "lenguaje",
  "velocidad",
  "visuoespacial"
]);

const sinEvaluar = generarPlanEvc({ dominios: {} });
assert.equal(sinEvaluar.valido, false);
assert.match(sinEvaluar.errores[0], /al menos un dominio/i);

const plan = generarPlanEvc({
  dominios: {
    atencion: 2,
    memoria: 1,
    ejecutivas: 3,
    lenguaje: 0,
    velocidad: 2,
    visuoespacial: 0
  },
  metaPrincipal: "Preparar el desayuno con una lista de pasos",
  fatiga: 2,
  apoyo: "disponible",
  diasSemana: 4,
  nombrePaciente: "Paciente de prueba"
});

assert.equal(plan.valido, true);
assert.equal(plan.minutosSesion, 15);
assert.equal(plan.diasSemana, 4);
assert.deepEqual(plan.prioridades.map((item) => item.id), ["ejecutivas", "atencion", "velocidad"]);
assert.equal(new Set(plan.actividades.map((actividad) => actividad.id)).size, plan.actividades.length);
assert.ok(plan.actividades.some((actividad) => actividad.id === "go-nogo"));
assert.ok(plan.actividades.some((actividad) => actividad.id === "cpt"));
assert.ok(plan.apoyos.some((apoyo) => /cuidador/i.test(apoyo)));
assert.ok(plan.alertas.some((alerta) => /dificultad marcada/i.test(alerta)));

const normalizada = normalizarEvaluacionEvc({
  dominios: { atencion: 9, memoria: -5 },
  diasSemana: 99,
  fatiga: 20,
  apoyo: "valor-invalido",
  metaPrincipal: "  Meta    con espacios  "
});
assert.equal(normalizada.dominios.atencion, 3);
assert.equal(normalizada.dominios.memoria, 0);
assert.equal(normalizada.diasSemana, 5);
assert.equal(normalizada.fatiga, 3);
assert.equal(normalizada.apoyo, "ocasional");
assert.equal(normalizada.metaPrincipal, "Meta con espacios");

const mantenimiento = generarPlanEvc({ dominios: { atencion: 0, memoria: 0 } });
assert.equal(mantenimiento.valido, true);
assert.equal(mantenimiento.prioridades.length, 2);
assert.equal(nivelDificultadEvc(0), "Sin dificultad observada");

const resumen = resumirPlanEvc(plan);
assert.match(resumen, /BORRADOR DE REHABILITACIÓN COGNITIVA POST-EVC/);
assert.match(resumen, /Preparar el desayuno/);
assert.match(resumen, /Paciente de prueba/);

console.log("Rehabilitación EVC core tests passed");
