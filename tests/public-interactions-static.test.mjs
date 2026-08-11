import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../index.html");
const ui = read("../js/public/interaccionesFarmacologicasPublicas.js");
const analytics = read("../js/services/analyticsInteraccionesFarmacologicas.js");
const rules = read("../js/data/reglasClinicasMedicamentosExtendidas.js");

assert.match(html, /Consultar interacciones farmacol/);
assert.match(html, /data-public-interactions/);
assert.match(html, /data-close-public-interactions/);
assert.match(html, /public-interactions\.js|interaccionesFarmacologicasPublicas/);
assert.match(ui, /interaction_tool_opened/);
assert.match(ui, /interaction_tool_analyzed/);
assert.match(ui, /Escape/);
assert.match(ui, /analizarInteraccionesPublicas/);
assert.match(analytics, /analytics_interacciones_farmacologicas/);
assert.match(analytics, /INVITADO/);
assert.match(analytics, /serverTimestamp/);
assert.match(rules, /serotoninergico_triptan/);
assert.match(rules, /bupropion_tramadol_convulsivo/);
assert.match(rules, /clozapina_mielosupresor/);

console.log("public-interactions-static.test.mjs OK");
