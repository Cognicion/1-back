import assert from "node:assert/strict";
import test from "node:test";
import {
  SCAS_CHILD_FILLER_ITEMS,
  SCAS_CHILD_PUNCTUABLE_ITEMS,
  scoreScasChild,
  validateAuthorizedScasItems
} from "../data/scasChild.js";

function responses(value, includeFillers = true) {
  const numbers = includeFillers ? Array.from({ length: 44 }, (_, index) => index + 1) : SCAS_CHILD_PUNCTUABLE_ITEMS;
  return numbers.map((numero) => ({ numero, valor: value }));
}

test("SCAS: los seis reactivos de relleno no puntúan", () => {
  const result = scoreScasChild(responses(0).map((item) => ({ ...item, valor: SCAS_CHILD_FILLER_ITEMS.includes(item.numero) ? 3 : 0 })));
  assert.equal(result.total, 0);
  assert.deepEqual(Object.values(result.subscales), [0, 0, 0, 0, 0, 0]);
});

test("SCAS: 38 reactivos puntuables en 3 alcanzan 114", () => {
  const result = scoreScasChild(responses(3));
  assert.equal(result.total, 114);
  assert.deepEqual(Object.values(result.subscales), [18, 18, 18, 27, 15, 18]);
  assert.equal(result.complete, true);
});

test("SCAS: detecta faltantes sin convertirlos en ceros definitivos", () => {
  const result = scoreScasChild(responses(1, false).slice(1));
  assert.equal(result.complete, false);
  assert.equal(result.missingItems.length, 1);
});

test("SCAS: valida un paquete autorizado de 44 reactivos", () => {
  const items = Array.from({ length: 44 }, (_, index) => ({ numero: index + 1, texto: `Texto autorizado ${index + 1}` }));
  const validated = validateAuthorizedScasItems(items);
  assert.equal(validated.length, 44);
  assert.equal(validated[10].puntuable, false);
  assert.equal(validated[4].subescala, "ansiedadSeparacion");
});
