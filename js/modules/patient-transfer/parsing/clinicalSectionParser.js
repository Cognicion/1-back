import { flattenNormalizedBlocks } from "../docx/docxBlockNormalizer.js";

const SECTION_DEFINITIONS = Object.freeze([
  { key: "subjetivo", aliases: ["subjetivo", "motivo de atencion", "motivo de consulta", "motivo de ingreso", "actualizacion del cuadro clinico", "motivo de atencion actualizacion del cuadro clinico", "padecimiento actual", "enfermedad actual", "evolucion", "interrogatorio", "refiere", "subjetivo evolucion"] },
  { key: "objetivo", aliases: ["objetivo", "exploracion fisica", "exploracion fisica y neurologica", "exploracion neurologica", "objetivo exploracion fisica", "signos vitales", "somatometria", "resultados de estudios", "laboratorios"] },
  { key: "examenMental", aliases: ["examen mental", "estado mental", "exploracion psicopatologica"] },
  { key: "analisis", aliases: ["analisis", "comentario", "comentario y analisis clinico", "impresion clinica", "discusion clinica", "integracion diagnostica", "valoracion", "formulacion", "consideraciones clinicas", "impresion diagnostica"] },
  { key: "diagnosticos", aliases: ["diagnostico", "diagnosticos", "diagnosticos de ingreso", "diagnosticos de egreso", "dx"] },
  { key: "tratamiento", aliases: ["tratamiento", "tratamiento actual", "medicacion actual", "medicamentos", "esquema farmacologico", "manejo"] },
  { key: "plan", aliases: ["plan", "plan terapeutico", "plan de manejo", "indicaciones"] },
  { key: "pronostico", aliases: ["pronostico"] },
  { key: "destino", aliases: ["destino"] }
]);

export const SECTION_RULES = Object.freeze(Object.fromEntries(
  SECTION_DEFINITIONS.map(({ key, aliases }) => [key, aliases])
));

function normalizar(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.:;]+$/g, "")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function detectarEncabezado(texto = "") {
  const normalizado = normalizar(texto);
  if (!normalizado || normalizado.length > 120) return null;
  return SECTION_DEFINITIONS.find(({ aliases }) => aliases.includes(normalizado))?.key || null;
}

/** Separa únicamente por encabezados delimitados y conserva el orden original. */
export function parseClinicalSections(blocks = []) {
  const secciones = Object.fromEntries(SECTION_DEFINITIONS.map(({ key }) => [key, ""]));
  const encabezados = [];
  let actual = "";

  flattenNormalizedBlocks(blocks).forEach((block, position) => {
    const encabezado = detectarEncabezado(block.text);
    if (encabezado) {
      actual = encabezado;
      encabezados.push({ key: encabezado, position, source: block.source || {} });
      return;
    }
    if (actual) secciones[actual] = [secciones[actual], block.text].filter(Boolean).join("\n");
  });

  return { secciones, encontradas: encabezados.map((item) => item.key), encabezados };
}
