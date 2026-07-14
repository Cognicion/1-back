import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { CRITERIOS_DIAGNOSTICOS_EXTENDIDOS } from "../js/data/diagnosticosClinicosExtendidos.js";

const dryRun = process.argv.includes("--dry-run");
const salida = resolve("reports/diagnosticos-clinicos-import.json");

const porCodigo = new Map();
CRITERIOS_DIAGNOSTICOS_EXTENDIDOS.forEach((dx) => {
  if (!porCodigo.has(dx.codigo)) porCodigo.set(dx.codigo, dx);
});

const reporte = {
  fecha: new Date().toISOString(),
  modo: dryRun ? "dry-run" : "write-report",
  totalEntrada: CRITERIOS_DIAGNOSTICOS_EXTENDIDOS.length,
  totalUnicos: porCodigo.size,
  duplicados: CRITERIOS_DIAGNOSTICOS_EXTENDIDOS.length - porCodigo.size,
  codigos: [...porCodigo.keys()].sort()
};

if (dryRun) {
  console.log(JSON.stringify(reporte, null, 2));
} else {
  await mkdir(dirname(salida), { recursive: true });
  await writeFile(salida, JSON.stringify(reporte, null, 2), "utf8");
  console.log(`Reporte generado: ${salida}`);
}

