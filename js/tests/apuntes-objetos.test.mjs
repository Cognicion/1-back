import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizarObjetoApunte,
  normalizarObjetosApunte,
  serializarObjetosApunte,
  textoObjetosApunte
} from "../apuntes-objetos.js";

test("normaliza, limita y conserva el contrato de objetos del lienzo", () => {
  const objeto = normalizarObjetoApunte({
    id: "cuadro-1",
    tipo: "texto",
    ajuste: "cuadrado",
    x: -5,
    y: 120,
    ancho: 2,
    alto: 99,
    texto: "Texto\u0000 seguro",
    color: "#A1B2C3"
  });

  assert.deepEqual(objeto, {
    id: "cuadro-1",
    tipo: "texto",
    ajuste: "cuadrado",
    x: 0,
    y: 94,
    ancho: 14,
    alto: 70,
    texto: "Texto seguro",
    color: "#a1b2c3"
  });
});

test("rechaza ajustes inválidos, elimina IDs duplicados y extrae texto buscable", () => {
  const objetos = normalizarObjetosApunte({ objetos: [
    { id: "uno", tipo: "texto", texto: "Idea clave", ajuste: "detras" },
    { id: "uno", tipo: "flecha" },
    { id: "dos", tipo: "flecha", ajuste: "no-existe" },
    { id: "tres", tipo: "texto", texto: "\nSegundo bloque\n" }
  ] });

  assert.equal(objetos.length, 3);
  assert.equal(objetos[1].ajuste, "delante");
  assert.equal(textoObjetosApunte(objetos), "Idea clave\nSegundo bloque");
  assert.deepEqual(serializarObjetosApunte(objetos), {
    version: 1,
    objetos: objetos.map((objeto) => ({ ...objeto }))
  });
});

test("las flechas conservan ambos extremos y anclas válidas de cuadros de texto", () => {
  const flecha = normalizarObjetoApunte({
    id: "flecha-anclada",
    tipo: "flecha",
    inicioX: 12,
    inicioY: 18,
    finX: 66,
    finY: 44,
    anclaInicio: { objetoId: "cuadro-a", lado: "derecha", proporcion: 0.4 },
    anclaFin: { objetoId: "cuadro-b", lado: "izquierda", proporcion: 0.75 }
  });

  assert.equal(flecha.inicioX, 12);
  assert.equal(flecha.finY, 44);
  assert.deepEqual(flecha.anclaInicio, { objetoId: "cuadro-a", lado: "derecha", proporcion: 0.4 });
  assert.deepEqual(flecha.anclaFin, { objetoId: "cuadro-b", lado: "izquierda", proporcion: 0.75 });
  assert.equal(normalizarObjetoApunte({ tipo: "flecha", anclaInicio: { objetoId: "cuadro", lado: "centro" } }).anclaInicio, null);
});
