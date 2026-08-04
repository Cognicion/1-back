import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const sourceDir = process.argv[2] || resolve("C:/Users/980027131/AppData/Local/Temp/icd102019enMeta");
const codesPath = resolve(sourceDir, "icd102019syst_codes.txt");
const groupsPath = resolve(sourceDir, "icd102019syst_groups.txt");
const outputPath = resolve(process.argv[3] || "js/data/catalogoCie10CapituloAB.js");

const rows = (await readFile(codesPath, "utf8"))
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => line.split(";"));
const groups = (await readFile(groupsPath, "utf8"))
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const [inicio, fin, capitulo, nombre] = line.split(";");
    return { inicio, fin, capitulo, nombre };
  });

function numero(codigo) {
  return Number(String(codigo).match(/^[A-Z](\d{2})/)?.[1] || 0);
}

function grupoPara(codigo) {
  const letra = codigo[0];
  const n = numero(codigo);
  return groups.find((grupo) => grupo.capitulo === "01" && grupo.inicio[0] === letra && n >= numero(grupo.inicio) && n <= numero(grupo.fin))
    || { inicio: `${letra}00`, fin: `${letra}99`, capitulo: "01", nombre: "Certain infectious and parasitic diseases" };
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function item(texto, orden) {
  return { numero: null, marcador: null, texto, orden, literal: false };
}

function criterios(codigo, nombre, grupo, nivel, sinonimos) {
  const referencia = "OMS, ICD-10 Version 2019 (including COVID-19 updates), lista tabular oficial.";
  const noEspecificado = "La clasificación tabular de la OMS no desarrolla este campo para esta entidad; requiere consulta de una guía clínica específica y revisión profesional.";
  return [
    ["CIE-10", [`Código ${codigo}. Nivel de clasificación: ${nivel === "3" ? "categoría" : "subcategoría diagnóstica"}.`, `Capítulo I: Certain infectious and parasitic diseases. Grupo oficial: ${grupo.nombre} (${grupo.inicio}–${grupo.fin}).`]],
    ["Definición", [`Entidad registrada oficialmente como “${nombre}”. La descripción corresponde al título tabular de la OMS y no se amplía más allá de la fuente oficial consultada.`]],
    ["Etiología", [noEspecificado]],
    ["Agente causal", [sinonimos.length ? `La nomenclatura oficial asociada incluye: ${sinonimos.join("; ")}. El agente causal específico no se infiere del título.` : noEspecificado]],
    ["Manifestaciones clínicas", [noEspecificado]],
    ["Diagnóstico", ["La codificación debe realizarse con la evaluación clínica completa, antecedentes, exploración y criterios de la guía aplicable. Este registro no sustituye criterios diagnósticos operativos." ]],
    ["Laboratorios", [noEspecificado]],
    ["Imagen", ["No se especifica en la ficha tabular de la OMS. Solicitar estudios solo cuando estén indicados por la presentación clínica y la guía correspondiente."]],
    ["Diagnóstico diferencial", [noEspecificado]],
    ["Tratamiento", ["La CIE-10 no prescribe tratamiento. Consultar guías terapéuticas oficiales según el agente, la gravedad, la localización y las resistencias locales."]],
    ["Complicaciones", [noEspecificado]],
    ["Prevención", ["No se especifica en la ficha tabular de la OMS; aplicar medidas de prevención y control de infecciones según el agente y la vía de transmisión confirmados."]],
    ["Pronóstico", [noEspecificado]],
    ["Exclusiones", ["Revisar las notas de inclusión y exclusión de la lista tabular de la OMS antes de asignar el código; no inferir exclusiones adicionales a partir del nombre."]],
    ["Referencias", [`${referencia} https://icd.who.int/browse10/2019/en`, "Contenido estructurado sin transcripción literal; validar la versión vigente antes del uso clínico."]]
  ].map(([titulo, textos], indice) => ({
    id: `${codigo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    clave: titulo,
    titulo,
    tipo: "resumen_estructurado",
    introduccion: "",
    literal: false,
    listType: "none",
    grupos: [],
    items: textos.map((texto, itemIndex) => item(texto, itemIndex + 1)),
    orden: indice + 1
  }));
}

const registros = rows
  .filter((parts) => parts[3] === "01" && /^[AB]/.test(parts[6] || ""))
  .map((parts) => {
    const [nivel, , , , bloque, , codigo, , nombre, sinonimo1, sinonimo2] = parts;
    const grupo = grupoPara(codigo);
    const sinonimos = unique([sinonimo1, sinonimo2]).filter((value) => value !== nombre);
    const jerarquia = {
      capitulo: { codigo: "I", nombre: "Certain infectious and parasitic diseases" },
      grupo: { codigo: `${grupo.inicio}-${grupo.fin}`, nombre: grupo.nombre },
      categoria: { codigo: bloque, nombre: rows.find((row) => row[6] === bloque)?.[8] || bloque },
      subcategoria: nivel === "3" ? null : { codigo, nombre }
    };
    return {
      id: `cie10-${codigo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      codigo,
      nombre,
      descripcionBreve: `${nombre} (${codigo}).`,
      categoria: "Enfermedades infecciosas y parasitarias",
      subcategoria: grupo.nombre,
      aliases: unique([codigo, nombre, ...sinonimos]),
      sistemas: {
        cie10: {
          visible: true,
          orden: 1,
          codigo,
          nombre,
          jerarquia,
          fuente: {
            organismo: "World Health Organization",
            documento: "ICD-10 Version 2019 (including COVID-19 updates), official tabular list",
            edicion: "2019",
            url: "https://icd.who.int/browse10/2019/en",
            sourceVerified: true
          },
          tipoContenido: "resumen_clinico_estructurado_no_literal",
          completionStatus: "complete_summary",
          review: { reviewed: false, reviewedAt: null, sourceVerified: true, notes: "Contenido clínico específico pendiente de la guía de enfermedad correspondiente; no se ha inventado información." },
          criterios: criterios(codigo, nombre, grupo, nivel, sinonimos),
          especificadores: [],
          notas: ["Registro generado desde la metadata oficial de la OMS.", "Los campos no desarrollados en la lista tabular se señalan explícitamente como no especificados; requieren guía clínica adicional."],
          contenidoLiteralAutorizado: false,
          subtipos: []
        }
      },
      psicoeducacion: "",
      diagnosticoDiferencial: [],
      comorbilidades: [],
      evaluacionClinica: [],
      referencias: [{ sistema: "CIE-10", organismo: "World Health Organization", tipoContenido: "Nomenclatura y lista tabular oficial" }]
    };
  });

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `/* Catálogo oficial CIE-10, Capítulo I, generado desde la metadata OMS 2019. */\nexport const CIE10_CAPITULO_AB = ${JSON.stringify(registros, null, 2)};\n`, "utf8");
console.log(JSON.stringify({ outputPath, total: registros.length, first: registros[0]?.sistemas.cie10.codigo, last: registros.at(-1)?.sistemas.cie10.codigo }, null, 2));
