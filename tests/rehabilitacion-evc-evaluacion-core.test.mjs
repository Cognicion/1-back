import assert from "node:assert/strict";
import {
  BATERIA_EVC_VERSION,
  PRUEBAS_EVC,
  calificarPruebaEvc,
  crearResultadoNoEvaluable,
  normalizarPalabrasFluidez,
  progresoBateriaEvc
} from "../js/rehabilitacion-evc-evaluacion-core.js";

assert.equal(BATERIA_EVC_VERSION, "0.2.0");
assert.deepEqual(Object.keys(PRUEBAS_EVC), ["atencion", "memoria", "ejecutivas", "lenguaje", "velocidad", "visuoespacial"]);

const atencionAlta = calificarPruebaEvc("atencion", {
  objetivos: 10,
  aciertos: 10,
  comisiones: 0,
  omisionesIzquierda: 0,
  omisionesDerecha: 0,
  duracionSegundos: 45
});
assert.equal(atencionAlta.nivelApoyo, 0);
assert.equal(atencionAlta.metricas.precisionAjustada, 100);

const atencionAsimetrica = calificarPruebaEvc("atencion", {
  objetivos: 10,
  aciertos: 8,
  comisiones: 0,
  omisionesIzquierda: 0,
  omisionesDerecha: 2,
  duracionSegundos: 45
});
assert.equal(atencionAsimetrica.nivelApoyo, 2);
assert.ok(atencionAsimetrica.advertencias.some((item) => /diferencia lateral/i.test(item)));

const memoria = calificarPruebaEvc("memoria", { objetivos: 5, reconocidos: 4, falsosPositivos: 1, demoraSegundos: 30 });
assert.equal(memoria.nivelApoyo, 2);

const ejecutivas = calificarPruebaEvc("ejecutivas", { total: 16, correctas: 15, cambios: 10, cambiosCorrectos: 9, medianaRespuestaMs: 850 });
assert.equal(ejecutivas.nivelApoyo, 0);

const lenguaje = calificarPruebaEvc("lenguaje", { palabrasValidas: 12, repeticiones: 2, ayuda: "claves", modoRegistro: "acompañante", duracionSegundos: 60 });
assert.equal(lenguaje.nivelApoyo, 2, "las claves fijan un piso de apoyo moderado");
assert.ok(lenguaje.advertencias.some((item) => /normas/i.test(item)));

const velocidad = calificarPruebaEvc("velocidad", { intentos: 20, correctas: 18, duracionSegundos: 40, medianaRespuestaMs: 900 });
assert.equal(velocidad.nivelApoyo, 0);

const visuoespacial = calificarPruebaEvc("visuoespacial", { erroresPorcentaje: [9, 10, 8, 9, 10] });
assert.equal(visuoespacial.nivelApoyo, 2);
assert.ok(visuoespacial.advertencias.some((item) => /sesgo direccional/i.test(item)));

const palabras = normalizarPalabrasFluidez("Perro, gato\nperro; Águila");
assert.deepEqual(palabras.unicas, ["perro", "gato", "aguila"]);
assert.equal(palabras.repeticiones, 1);

const resultados = {
  atencion: atencionAlta,
  memoria,
  ejecutivas,
  lenguaje,
  velocidad,
  visuoespacial: crearResultadoNoEvaluable("visuoespacial", "Acceso motor insuficiente")
};
assert.deepEqual(progresoBateriaEvc(resultados), { total: 6, abordados: 6, completados: 5, noEvaluables: 1, completa: true });

console.log("Rehabilitación EVC assessment tests passed");
