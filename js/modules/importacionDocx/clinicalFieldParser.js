import { FIELD_RULES } from "./docxImportConfig.js";
import { extraerParesTabla, aplanarBloques } from "./docxBlockParser.js";

function normalizarClave(valor = "") {
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[:：]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function limpiarValor(valor = "") {
  return String(valor || "").replace(/\s+/g, " ").trim();
}

function buscarReglaPorEtiqueta(etiqueta = "") {
  const clave = normalizarClave(etiqueta);
  return FIELD_RULES.find((regla) =>
    regla.aliases.some((alias) => clave === normalizarClave(alias) || clave.endsWith(normalizarClave(alias)))
  );
}

function extraerParLinea(linea = "") {
  const match = String(linea).match(/^([^:：]{2,60})[:：]\s*(.+)$/);
  if (!match) return null;
  return { etiqueta: match[1], valor: match[2], origen: "paragraph" };
}

function normalizarFecha(valor = "") {
  const texto = limpiarValor(valor);
  const iso = texto.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const mx = texto.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
  if (mx) {
    const anio = mx[3].length === 2 ? `20${mx[3]}` : mx[3];
    return `${anio}-${mx[2].padStart(2, "0")}-${mx[1].padStart(2, "0")}`;
  }
  return texto;
}

function normalizarHora(valor = "") {
  const match = limpiarValor(valor).match(/\b(\d{1,2}):(\d{2})\b/);
  if (!match) return limpiarValor(valor);
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function normalizarCampo(key, valor) {
  if (key === "fecha" || key === "fechaNacimiento") return normalizarFecha(valor);
  if (key === "hora") return normalizarHora(valor);
  if (key === "edad") {
    const edad = limpiarValor(valor).match(/\d{1,3}/)?.[0] || limpiarValor(valor);
    return edad;
  }
  return limpiarValor(valor);
}

export function extraerCamposClinicos(bloques = []) {
  const campos = {};
  const encontrados = new Set();
  const pares = [
    ...extraerParesTabla(bloques),
    ...aplanarBloques(bloques).map((linea) => extraerParLinea(linea.texto)).filter(Boolean)
  ];

  pares.forEach((par) => {
    const regla = buscarReglaPorEtiqueta(par.etiqueta);
    if (!regla || campos[regla.key]) return;
    campos[regla.key] = normalizarCampo(regla.key, par.valor);
    encontrados.add(regla.key);
  });

  const texto = aplanarBloques(bloques).map((linea) => linea.texto).join("\n");
  if (!campos.curp) {
    const curp = texto.match(/\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/i)?.[0];
    if (curp) {
      campos.curp = curp.toUpperCase();
      encontrados.add("curp");
    }
  }

  return {
    campos,
    encontrados: [...encontrados],
    noEncontrados: FIELD_RULES.filter((regla) => !encontrados.has(regla.key)).map((regla) => regla.key)
  };
}

export { FIELD_RULES };
