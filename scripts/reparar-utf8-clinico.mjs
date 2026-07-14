import { readFile, writeFile } from "node:fs/promises";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dryRun = process.argv.includes("--dry-run");
const extensiones = new Set([".html", ".css", ".js", ".json", ".md", ".txt", ".mjs"]);
const ignorar = new Set(["node_modules", ".git", "reports"]);
const reemplazos = new Map([
  ["á", "á"], ["é", "é"], ["í", "í"], ["ó", "ó"], ["ú", "ú"],
  ["Á", "Á"], ["É", "É"], ["Í", "Í"], ["Ó", "Ó"], ["Ú", "Ú"],
  ["ñ", "ñ"], ["Ñ", "Ñ"], ["ü", "ü"], ["Ü", "Ü"],
  ["¿", "¿"], ["¡", "¡"], ["·", "·"], ["°", "°"],
  ["—", "—"], ["–", "–"], ["“", "“"], ["”", "”"], ["‘", "‘"], ["’", "’"],
  ["×", "×"], ["ó", "ó"], ["é", "é"], ["Ãƒ¡", "á"], ["í", "í"], ["ú", "ú"],
  ["ñ", "ñ"], ["Ã‚¿", "¿"], ["Ã‚¡", "¡"], ["Ã‚·", "·"]
]);

function extension(ruta) {
  const idx = ruta.lastIndexOf(".");
  return idx >= 0 ? ruta.slice(idx).toLowerCase() : "";
}

function archivos(dir) {
  const salida = [];
  readdirSync(dir).forEach((nombre) => {
    if (ignorar.has(nombre)) return;
    const ruta = join(dir, nombre);
    const stat = statSync(ruta);
    if (stat.isDirectory()) salida.push(...archivos(ruta));
    else if (extensiones.has(extension(ruta))) salida.push(ruta);
  });
  return salida;
}

function repararTexto(texto) {
  let salida = texto;
  reemplazos.forEach((valor, clave) => {
    salida = salida.split(clave).join(valor);
  });
  return salida;
}

const root = process.cwd();
const cambios = [];

for (const archivo of archivos(root)) {
  if (archivo.endsWith("scripts\\reparar-utf8-clinico.mjs")) continue;
  const contenido = await readFile(archivo, "utf8");
  const reparado = repararTexto(contenido);
  if (reparado === contenido) continue;
  cambios.push(relative(root, archivo));
  if (!dryRun) await writeFile(archivo, reparado, "utf8");
}

console.log(JSON.stringify({
  modo: dryRun ? "dry-run" : "write",
  archivosConCambios: cambios.length,
  archivos: cambios
}, null, 2));
