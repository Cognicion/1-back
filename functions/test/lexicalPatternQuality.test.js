const assert = require("assert");
const { asIso } = require("../patternDiscoveryHandler");
const {
  assessLexicalPattern,
  selectUsefulLexicalPatterns
} = require("../lexicalPatternQuality");

function row(clave, frecuencia, notes, patients, physicians = ["m1"]) {
  return {
    clave,
    n: clave.split(/\s+/).length,
    frecuencia,
    notas: new Set(notes),
    pacientes: new Set(patients),
    medicos: new Set(physicians),
    primeraAparicion: "2026-01-01T00:00:00.000Z",
    ultimaAparicion: "2026-02-01T00:00:00.000Z"
  };
}

assert.strictEqual(asIso(), "");
assert.strictEqual(assessLexicalPattern(row("de la", 10, ["n1", "n2"], ["p1", "p2"])).eligible, false);
assert.strictEqual(assessLexicalPattern(row("tabletas de", 10, ["n1", "n2"], ["p1", "p2"])).eligible, false);
assert.strictEqual(assessLexicalPattern(row("via oral vez al dia", 10, ["n1", "n2"], ["p1", "p2"])).eligible, false);
assert.strictEqual(assessLexicalPattern(row("insomnio irritabilidad", 5, ["n1", "n2", "n3"], ["p1", "p2", "p3"])).eligible, true);

const selected = selectUsefulLexicalPatterns([
  row("insomnio irritabilidad", 5, ["n1", "n2", "n3"], ["p1", "p2", "p3"]),
  row("insomnio irritabilidad recaida", 5, ["n1", "n2", "n3"], ["p1", "p2", "p3"]),
  row("de la", 20, ["n1", "n2", "n3"], ["p1", "p2", "p3"])
], { threshold: 3 });
assert.deepStrictEqual(selected.patterns.map((item) => item.phrase), ["insomnio irritabilidad recaida"]);
assert.strictEqual(selected.stats.redundantPatterns, 1);
assert.strictEqual(selected.stats.rejected.low_information_phrase, 1);
assert.ok(selected.patterns[0].relevanceScore >= 0.4);

console.log("lexicalPatternQuality.test.js: ok");
