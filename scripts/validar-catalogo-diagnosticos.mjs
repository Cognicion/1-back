import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.codigosCFaltantes, 0);
assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.codigosDFaltantes, 0);
assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.codigosEFaltantes, 0);
assert.equal(METADATOS_CATALOGO_DIAGNOSTICOS.integridad.codigosLegacyOmitidos, 0);
assert.equal(CATALOGO_DIAGNOSTICOS.length, 3202);
assert.equal(new Set(CATALOGO_DIAGNOSTICOS.map((diagnostico) => diagnostico.id)).size, CATALOGO_DIAGNOSTICOS.length);
assert.equal(CIE10.length, 3183);
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
  Object.fromEntries(["A", "B", "C", "D", "E", "F"].map((letra) => [letra, CIE10.filter((diagnostico) => diagnostico.codigo.startsWith(letra)).length])),
  { A: 465, B: 459, C: 539, D: 527, E: 412, F: 467 }
);
for (const [letra, esperado] of [["C", "24b24733336786e991118109fa484698b9e4000f8a04469247e7dcb2029e7059"], ["D", "5fcf520a101357c413137aef708ed043297a3772616d6d0c7145f5cf577248ac"], ["E", "29c25e23e56c983272f5083a6eba16212a866430c9a14459ab46da650226b8a1"]]) {
  const codigos = CIE10.filter((diagnostico) => diagnostico.codigo.startsWith(letra)).map((diagnostico) => diagnostico.codigo).sort();
  assert.equal(createHash("sha256").update(codigos.join("\n")).digest("hex"), esperado, `Conjunto oficial ${letra} alterado`);
}
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
  ["paciente.html", "js/paciente.js?v=20260818-grafica-signos-ejes-v2"],
  ["nota.html", "js/nota.js?v=20260818-envio-piso-header-v1"],
  ["biblioteca.html", "js/biblioteca.js?v=20260816-cie10-cde-v1"],
  ["laboratorio-farmacologia.html", "js/laboratorio-farmacologia.js?v=20260816-cie10-cde-v1"]
]) {
  assert.match(await readFile(resolve(root, archivo), "utf8"), new RegExp(modulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
const appVersionSource = await readFile(resolve(root, "js/config/appVersion.js"), "utf8");
const appVersionMatch = appVersionSource.match(/APP_VERSION = "(\d+\.\d+)"/);
assert.ok(appVersionMatch, "appVersion.js debe declarar una versión visible válida");

const resultadoFarmacologia = evaluarMedicamentosPaciente({
  paciente: { diagnosticos: [{ codigo: "6C70", diagnostico: "Piromanía", estado: "confirmado" }] },
  medicamentos: [{ medicamento: "Pramipexol" }]
});
assert.ok(resultadoFarmacologia.alertas.some((alerta) => /control de los impulsos/i.test(alerta.titulo)));

const resultadoOncologia = evaluarMedicamentosPaciente({
  paciente: { diagnosticos: [{ codigo: "C71.9", diagnostico: "Tumor maligno del encéfalo", estado: "confirmado" }] },
  medicamentos: [{ medicamento: "Bupropion 150 mg" }]
});
assert.ok(resultadoOncologia.alertas.some((alerta) => /tumor del sistema nervioso central/i.test(alerta.titulo)));

const resultadoEndocrino = evaluarMedicamentosPaciente({
  paciente: { diagnosticos: [{ codigo: "E87.5", diagnostico: "Hiperpotasemia", estado: "confirmado" }] },
  medicamentos: [{ medicamento: "Espironolactona 25 mg" }]
});
assert.ok(resultadoEndocrino.alertas.some((alerta) => alerta.severidad === "critica" && /hiperpotasemia/i.test(alerta.titulo)));

console.log(JSON.stringify({
  archivoUnico: "js/data/catalogoDiagnosticos.js",
  entidades: CATALOGO_DIAGNOSTICOS.length,
  cie10: CIE10.length,
  cie11: CIE11.length,
  dsm5: DSM5.length,
  capitulosCompletos: { A: 465, B: 459, C: 539, D: 527, E: 412, F: 467 },
  panelesVacios: 0,
  duplicados: 0,
  version: appVersionMatch[1],
  alertaFarmacologicaCie11: true
}, null, 2));
