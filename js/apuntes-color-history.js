export const MAX_COLORES_RECIENTES = 5;

export function normalizarColorHex(valor) {
  const color = String(valor || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;

  const corto = color.match(/^#([0-9a-f]{3})$/i);
  if (!corto) return "";
  return `#${corto[1].split("").map((caracter) => caracter + caracter).join("")}`;
}

export function normalizarColoresRecientes(colores) {
  if (!Array.isArray(colores)) return [];

  const vistos = new Set();
  const normalizados = [];
  for (const valor of colores) {
    const color = normalizarColorHex(valor);
    if (!color || vistos.has(color)) continue;
    vistos.add(color);
    normalizados.push(color);
    if (normalizados.length === MAX_COLORES_RECIENTES) break;
  }
  return normalizados;
}

export function registrarColorReciente(colores, color) {
  const colorNormalizado = normalizarColorHex(color);
  if (!colorNormalizado) return normalizarColoresRecientes(colores);
  return normalizarColoresRecientes([colorNormalizado, ...(Array.isArray(colores) ? colores : [])]);
}
