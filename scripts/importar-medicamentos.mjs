import { writeFile } from "node:fs/promises";
import { MEDICAMENTOS_MAESTROS, MEDICAMENTOS_PRESENTACIONES, normalizarNombreMedicamento } from "../js/data/medicamentos.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || !args.has("--commit");
const salida = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "medicamentos-import-preview.json";

const nombres = MEDICAMENTOS_MAESTROS.map((medicamento) => normalizarNombreMedicamento(medicamento.nombre));
const duplicados = nombres.filter((nombre, index) => nombres.indexOf(nombre) !== index);
const sinPresentaciones = MEDICAMENTOS_MAESTROS.filter((medicamento) => !medicamento.presentaciones?.length);

const reporte = {
  dryRun,
  generadoEn: new Date().toISOString(),
  totalMedicamentos: MEDICAMENTOS_MAESTROS.length,
  totalPresentacionesTratamiento: MEDICAMENTOS_PRESENTACIONES.length,
  duplicados,
  sinPresentaciones: sinPresentaciones.map((medicamento) => medicamento.nombre),
  medicamentos: MEDICAMENTOS_MAESTROS
};

await writeFile(salida, JSON.stringify(reporte, null, 2), "utf8");

if (!dryRun) {
  console.warn("Importación real no ejecutada: este proyecto no incluye credenciales de administrador de Firebase en el repositorio.");
  console.warn("Usa este reporte como fuente revisada para un importador con credenciales seguras fuera del cliente web.");
}

console.log(`Reporte generado en ${salida}`);
console.log(`${reporte.totalMedicamentos} medicamentos, ${reporte.totalPresentacionesTratamiento} opciones de tratamiento.`);
if (duplicados.length) {
  console.warn(`Duplicados detectados: ${duplicados.join(", ")}`);
}
if (sinPresentaciones.length) {
  console.warn(`Medicamentos sin presentaciones: ${sinPresentaciones.map((m) => m.nombre).join(", ")}`);
}
