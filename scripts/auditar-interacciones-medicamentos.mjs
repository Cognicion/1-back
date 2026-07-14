import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  INGREDIENTES_MEDICAMENTOS,
  REGLAS_INTERACCIONES_CLINICAS,
  REGLAS_MEDICAMENTO_DIAGNOSTICO,
  UMBRALES_RIESGO_ACUMULATIVO
} from "../js/data/reglasClinicasMedicamentosExtendidas.js";

const dryRun = process.argv.includes("--dry-run");
const salida = resolve("reports/auditoria-interacciones-medicamentos.json");

const ingredientesCubiertos = new Set();
const clasesCubiertas = new Set();

function agregarRegla(regla = {}) {
  ["ingrediente", "ingredientesA", "ingredientesB"].forEach((clave) => {
    const valor = regla[clave];
    if (Array.isArray(valor)) valor.forEach((item) => ingredientesCubiertos.add(item));
    else if (valor) ingredientesCubiertos.add(valor);
  });
  ["clase", "clases", "clasesA", "clasesB"].forEach((clave) => {
    const valor = regla[clave];
    if (Array.isArray(valor)) valor.forEach((item) => clasesCubiertas.add(item));
    else if (valor) clasesCubiertas.add(valor);
  });
}

[...REGLAS_INTERACCIONES_CLINICAS, ...REGLAS_MEDICAMENTO_DIAGNOSTICO].forEach(agregarRegla);

const clasesCatalogo = new Set(INGREDIENTES_MEDICAMENTOS.flatMap((ing) => ing.clases || []));
const reporte = {
  fecha: new Date().toISOString(),
  medicamentosReconocibles: INGREDIENTES_MEDICAMENTOS.length,
  reglasInteracciones: REGLAS_INTERACCIONES_CLINICAS.length,
  reglasMedicamentoDiagnostico: REGLAS_MEDICAMENTO_DIAGNOSTICO.length,
  umbralesAcumulativos: Object.keys(UMBRALES_RIESGO_ACUMULATIVO).length,
  ingredientesCubiertos: ingredientesCubiertos.size,
  clasesCatalogo: clasesCatalogo.size,
  clasesCubiertas: clasesCubiertas.size,
  clasesSinReglaDirecta: [...clasesCatalogo].filter((clase) => !clasesCubiertas.has(clase)).sort()
};

if (dryRun) {
  console.log(JSON.stringify(reporte, null, 2));
} else {
  await mkdir(dirname(salida), { recursive: true });
  await writeFile(salida, JSON.stringify(reporte, null, 2), "utf8");
  console.log(`Reporte generado: ${salida}`);
}

