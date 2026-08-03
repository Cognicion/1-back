import { SECTION_RULES } from "./docxImportConfig.js";
import { aplanarBloques } from "./docxBlockParser.js";

function normalizar(valor = "") {
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.:：]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function detectarSeccion(linea = "") {
  const texto = normalizar(linea);
  if (!texto || texto.length > 90) return "";
  for (const [clave, aliases] of Object.entries(SECTION_RULES)) {
    if (aliases.some((alias) => texto === normalizar(alias))) return clave;
  }
  return "";
}

export function extraerSeccionesClinicas(bloques = []) {
  const lineas = aplanarBloques(bloques).map((item) => item.texto).filter(Boolean);
  const secciones = {};
  let actual = "";

  lineas.forEach((linea) => {
    const seccion = detectarSeccion(linea);
    if (seccion) {
      actual = seccion;
      secciones[actual] = secciones[actual] || "";
      return;
    }
    if (actual) {
      secciones[actual] = [secciones[actual], linea].filter(Boolean).join("\n");
    }
  });

  return {
    secciones,
    encontradas: Object.keys(secciones)
  };
}

export { SECTION_RULES };
