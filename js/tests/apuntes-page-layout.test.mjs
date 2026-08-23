import assert from "node:assert/strict";
import test from "node:test";
import {
  etiquetaDisposicionHoja,
  normalizarDisposicionHoja,
  obtenerMedidasHoja
} from "../apuntes-page-layout.js";

test("normaliza formato, orientación, zoom, márgenes y tamaño de fuente", () => {
  const disposicion = normalizarDisposicionHoja({
    formato: "CARTA",
    orientacion: "horizontal",
    zoom: 999,
    margenes: { superior: 1, derecho: 26, inferior: 90, izquierdo: "12" },
    tamanioFuente: 8
  });
  assert.deepEqual(disposicion, {
    formato: "CARTA",
    orientacion: "horizontal",
    zoom: 200,
    margenes: { superior: 5, derecho: 26, inferior: 50, izquierdo: 12 },
    tamanioFuente: 10
  });
});

test("calcula las medidas reales y etiqueta visible de la hoja", () => {
  const disposicion = { formato: "A4", orientacion: "horizontal" };
  assert.deepEqual(obtenerMedidasHoja(disposicion), {
    id: "A4",
    etiqueta: "A4",
    anchoMm: 297,
    altoMm: 210
  });
  assert.match(etiquetaDisposicionHoja(disposicion), /A4 · 297\.0 × 210\.0 mm · horizontal/);
});
