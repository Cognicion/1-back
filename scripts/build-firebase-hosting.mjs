import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(projectRoot, ".firebase-hosting-public");

const ROOT_FILES = new Set([
  "health.json",
  "manifest.json",
  "respiracion.js",
  "robots.txt",
  "service-worker.js",
  "sitemap.xml"
]);

const PUBLIC_DIRECTORIES = [
  { path: "assets", extensions: new Set([".docx", ".json", ".png", ".wav", ".webp"]) },
  { path: "css", extensions: new Set([".css"]) },
  { path: "data", extensions: new Set([".json"]) },
  { path: "js", extensions: new Set([".js", ".json"]), excludedPrefixes: ["js/tests/"] }
];
const REQUIRED_PATHS = [
  "index.html",
  "biblioteca.html",
  "diagnostico-red.html",
  "health.json",
  "offline.html",
  "service-worker.js",
  "assets/favicon-cognicion.png",
  "css/theme.css",
  "js/availability-bootstrap.js"
];

function assertSafeOutputPath() {
  if (dirname(outputRoot) !== projectRoot || !outputRoot.endsWith(".firebase-hosting-public")) {
    throw new Error(`Directorio de salida inseguro: ${outputRoot}`);
  }
}

async function copyEntry(sourceRelativePath) {
  const source = join(projectRoot, sourceRelativePath);
  const destination = join(outputRoot, sourceRelativePath);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

async function copyPublicDirectory(rule, currentRelativePath = rule.path) {
  const sourceDirectory = join(projectRoot, currentRelativePath);
  for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
    const childRelativePath = `${currentRelativePath}/${entry.name}`.replaceAll("\\", "/");
    if (rule.excludedPrefixes?.some((prefix) => childRelativePath.startsWith(prefix))) continue;
    if (entry.isDirectory()) {
      await copyPublicDirectory(rule, childRelativePath);
      continue;
    }
    const extension = entry.name.includes(".") ? entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase() : "";
    if (entry.isFile() && rule.extensions.has(extension)) await copyEntry(childRelativePath);
  }
}

async function summarize(directory) {
  let files = 0;
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const child = await summarize(path);
      files += child.files;
      bytes += child.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += (await stat(path)).size;
    }
  }
  return { files, bytes };
}

assertSafeOutputPath();
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const rootEntries = await readdir(projectRoot, { withFileTypes: true });
const publicRootFiles = rootEntries
  .filter((entry) => entry.isFile() && (entry.name.endsWith(".html") || ROOT_FILES.has(entry.name)))
  .map((entry) => entry.name)
  .sort();

for (const file of publicRootFiles) await copyEntry(file);
for (const rule of PUBLIC_DIRECTORIES) await copyPublicDirectory(rule);

for (const requiredPath of REQUIRED_PATHS) {
  const resolved = resolve(outputRoot, requiredPath);
  if (!resolved.startsWith(`${outputRoot}${sep}`) && resolved !== outputRoot) {
    throw new Error(`Ruta requerida fuera del artefacto: ${requiredPath}`);
  }
  await stat(resolved);
}

const summary = await summarize(outputRoot);
console.log(
  `Firebase Hosting mirror: ${summary.files} archivos, ${summary.bytes} bytes en ${relative(projectRoot, outputRoot)}`
);
