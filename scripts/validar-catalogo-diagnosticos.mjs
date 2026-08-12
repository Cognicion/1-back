import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOGO_DIAGNOSTICOS,
  CIE10,
  CIE11,
  DSM5,
  METADATOS_CATALOGO_DIAGNOSTICOS
} from "../js/data/catalogoDiagnosticos.js";
import { evaluarMedicamentosPaciente } from "../js/services/motorClinicoMedicamentos.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = resolve(root, "js/data");
const antiguos = [
  "cie10.js",
  "cie11.js",
  "diagnosticosBiblioteca.js",
  "diagnosticosClinicosExtendidos.js",
  "bibliotecaClinica.js",
  "vinculosClinicos.js"
];

async function existe(ruta) {
  try {
    await access(ruta);
    return true;
  } catch {
    return false;
  }
}

function codigosUnicos(catalogo, nombre) {
  const codigos = catalogo.map((diagnostico) => diagnostico.codigo);
  assert.equal(new Set(codigos).size, codigos.length, `${nombre} contiene códigos duplicados`);
}

assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.fuenteUnica, true);
assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.codigosAbfFaltantes, 0);
assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.codigosLegacyOmitidos, 0);
assert.equal(CATALOGO_DIAGNOSTICOS.length, 1757);
assert.equal(new Set(CATALOGO_DIAGNOSTICOS.map((diagnostico) => diagnostico.id)).size, CATALOGO_DIAGNOSTICOS.length);
assert.equal(CIE10.length, 1738);
assert.equal(CIE11.length, 28);
assert.equal(DSM5.length, 12);
codigosUnicos(CIE10, "CIE-10");
codigosUnicos(CIE11, "CIE-11");
codigosUnicos(DSM5, "DSM-5-TR");
for (const catalogo of [CIE10, CIE11, DSM5]) {
  assert.ok(catalogo.every((diagnostico) =>
    diagnostico.nombre && diagnostico.aliases.includes(diagnostico.codigo) && diagnostico.aliases.includes(diagnostico.nombre)
  ), "Todo diagnóstico debe ser buscable por código, nombre y alias");
}

assert.deepEqual(
  Object.fromEntries(["A", "B", "F"].map((letra) => [letra, CIE10.filter((diagnostico) => diagnostico.codigo.startsWith(letra)).length])),
  { A: 465, B: 459, F: 467 }
);
assert.ok(CATALOGO_DIAGNOSTICOS.every((diagnostico) =>
  Object.values(diagnostico.sistemas || {}).every((sistema) => sistema.codigo && sistema.nombre && sistema.criterios?.length)
), "Existe al menos un panel diagnóstico vacío");
assert.ok(CATALOGO_DIAGNOSTICOS.every((diagnostico) => !Object.hasOwn(diagnostico, "criterios")), "Los criterios deben vivir dentro de su sistema fuente");

const impulsos = new Set(["6C70", "6C71", "6C72", "6C73", "6C7Y", "6C7Z"]);
assert.deepEqual(new Set(CIE11.filter((diagnostico) => impulsos.has(diagnostico.codigo)).map((diagnostico) => diagnostico.codigo)), impulsos);
for (const codigo of impulsos) {
  const entidad = CATALOGO_DIAGNOSTICOS.find((diagnostico) => diagnostico.sistemas?.cie11?.codigo === codigo);
  assert.ok(entidad.sistemas.cie11.criterios.length > 1, `${codigo} carece de criterios CIE-11`);
  assert.ok(entidad.farmacologia.reglas.some((regla) => regla.id === "agonista_dopaminergico_control_impulsos"));
}

for (const archivo of antiguos) assert.equal(await existe(resolve(dataDir, archivo)), false, `Sigue existiendo el catálogo antiguo ${archivo}`);
const archivosDatos = await readdir(dataDir);
assert.deepEqual(archivosDatos.filter((archivo) => /(?:diagnostic|cie10|cie11)/i.test(archivo)).sort(), ["catalogoDiagnosticos.js"]);

for (const [archivo, modulo] of [
  ["paciente.html", "js/paciente.js?v=20260811-diagnosticos-unificados-v1"],
  ["nota.html", "js/nota.js?v=20260811-diagnosticos-unificados-v1"],
  ["biblioteca.html", "js/biblioteca.js?v=20260811-diagnosticos-unificados-v1"],
  ["laboratorio-farmacologia.html", "js/laboratorio-farmacologia.js?v=20260811-diagnosticos-unificados-v1"]
]) {
  assert.match(await readFile(resolve(root, archivo), "utf8"), new RegExp(modulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(await readFile(resolve(root, "js/config/appVersion.js"), "utf8"), /APP_VERSION = "1\.898"/);

const resultadoFarmacologia = evaluarMedicamentosPaciente({
  paciente: { diagnosticos: [{ codigo: "6C70", diagnostico: "Piromanía", estado: "confirmado" }] },
  medicamentos: [{ medicamento: "Pramipexol" }]
});
assert.ok(resultadoFarmacologia.alertas.some((alerta) => /control de los impulsos/i.test(alerta.titulo)));

console.log(JSON.stringify({
  archivoUnico: "js/data/catalogoDiagnosticos.js",
  entidades: CATALOGO_DIAGNOSTICOS.length,
  cie10: CIE10.length,
  cie11: CIE11.length,
  dsm5: DSM5.length,
  capitulosCompletos: { A: 465, B: 459, F: 467 },
  panelesVacios: 0,
  duplicados: 0,
  version: "1.898",
  alertaFarmacologicaCie11: true
}, null, 2));
