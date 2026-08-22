import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CATALOGO_FARMACOLOGICO_OFICIAL,
  obtenerMedicamentoPorId,
  resolverMedicamentoCanonico
} from "../data/catalogoFarmacologicoUnificado.js";

const IDS_ESPERADOS = [
  "amoxicilina",
  "piperacilina_tazobactam",
  "cefepima",
  "meropenem",
  "vancomicina",
  "linezolid",
  "delafloxacino",
  "clindamicina",
  "trimetoprim_sulfametoxazol",
  "nitrofurantoina",
  "rifampicina",
  "isoniazida"
];

IDS_ESPERADOS.forEach((id) => {
  const antibiotico = obtenerMedicamentoPorId(id);
  assert.ok(antibiotico, `${id} debe estar disponible en el catálogo maestro`);
  assert.ok((antibiotico.clases || []).some((clase) => /antibi|antimicobacter/i.test(clase)), `${id} debe conservar su categoría antibacteriana o antimicobacteriana`);
  assert.equal(antibiotico.estadoFuente, "fuente_regulatoria_parcial", `${id} debe declarar el alcance de sus fuentes regulatorias`);
  assert.ok((antibiotico.regulatorySources || []).some((fuente) => fuente.organismo === "FDA" && /^https:\/\//.test(fuente.url)), `${id} debe enlazar una fuente FDA`);
  assert.ok((antibiotico.regulatorySources || []).some((fuente) => fuente.organismo === "COFEPRIS" && /^https:\/\//.test(fuente.url)), `${id} debe enlazar el visor COFEPRIS`);
});

const ciprofloxacino = obtenerMedicamentoPorId("ciprofloxacino");
assert.ok(ciprofloxacino.warningDetails.length >= 2, "ciprofloxacino debe exponer advertencias regulatorias de la clase fluoroquinolona");
assert.ok(ciprofloxacino.warningDetails.every((advertencia) => advertencia.fuentes?.some((fuente) => fuente.organismo === "FDA" && /^https:\/\//.test(fuente.url))), "cada advertencia de fluoroquinolona debe conservar su cita FDA");
assert.ok(ciprofloxacino.warnings.every((advertencia) => typeof advertencia === "string"), "la proyección histórica warnings debe seguir siendo texto");

const vancomicina = resolverMedicamentoCanonico("vancomicina");
assert.equal(vancomicina.clinicalMedicationId, "vancomicina", "un antibiótico añadido debe resolverse por su nombre genérico");
assert.match(obtenerMedicamentoPorId("vancomicina").halfLife, /fuente pendiente/i, "no deben inventarse propiedades no extraídas de una fuente regulatoria específica");

const antibioticosRegulatorios = CATALOGO_FARMACOLOGICO_OFICIAL.filter((medicamento) => medicamento.estadoFuente === "fuente_regulatoria_parcial");
assert.ok(antibioticosRegulatorios.length >= 70, "el complemento debe cubrir al menos 70 antibacterianos/antimicobacterianos normalizados");

const interfazLaboratorio = fs.readFileSync("js/laboratorio-farmacologia.js", "utf8");
assert.match(interfazLaboratorio, /warningDetails/, "la ficha debe consumir las advertencias estructuradas");
assert.match(interfazLaboratorio, /Fuente:\s*\$\{fuentes\}/, "cada advertencia con fuente debe rotular su cita en la ficha");
assert.match(interfazLaboratorio, /regulatorySources/, "la ficha debe diferenciar las fuentes regulatorias FDA y COFEPRIS");

console.log("antibioticosRegulatorios.test.mjs OK");
