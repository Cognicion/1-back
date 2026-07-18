import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const pages = process.argv.slice(2).length ? process.argv.slice(2) : [
  "index.html",
  "login.html",
  "dashboard.html",
  "medico.html",
  "paciente.html",
  "nota.html",
  "agenda.html",
  "biblioteca.html",
  "escalas.html",
  "laboratorio-farmacologia.html",
  "laboratorio-neurofisiologia.html",
  "sofia.html"
];

function stripQuery(value = "") {
  return value.split("?")[0].replace(/^\.\//, "");
}

function readCurrent(file) {
  const full = path.join(root, file);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
}

function readHead(file) {
  try {
    return execFileSync("git", ["show", `HEAD:${file}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function sizeCurrent(file) {
  const full = path.join(root, file);
  return fs.existsSync(full) ? fs.statSync(full).size : 0;
}

function sizeHead(file) {
  try {
    return Buffer.byteLength(execFileSync("git", ["show", `HEAD:${file}`], { cwd: root, encoding: "buffer", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return 0;
  }
}

function extractHtmlRefs(html = "") {
  const refs = [];
  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    refs.push({ type: "script", value: stripQuery(match[1]) });
  }
  for (const match of html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    refs.push({ type: "css", value: stripQuery(match[1]) });
  }
  for (const match of html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    refs.push({ type: "image", value: stripQuery(match[1]) });
  }
  return refs.filter((ref) => !/^https?:\/\//i.test(ref.value));
}

function extractStaticImports(js = "") {
  const imports = [];
  for (const match of js.matchAll(/import\s+(?:[^("'`]+?\s+from\s+)?["']([^"']+)["']/g)) {
    imports.push(match[1]);
  }
  return imports;
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.posix.dirname(fromFile.replaceAll("\\", "/"));
  const clean = stripQuery(path.posix.normalize(path.posix.join(base, spec)));
  if (path.extname(clean)) return clean;
  for (const ext of [".js", ".mjs", ".json"]) {
    if (fs.existsSync(path.join(root, clean + ext))) return clean + ext;
  }
  return clean;
}

function collectGraph(entryFiles, readFn) {
  const visited = new Set();
  const cdnImports = new Set();
  const stack = [...entryFiles];
  while (stack.length) {
    const file = stripQuery(stack.pop());
    if (!file || visited.has(file) || !file.endsWith(".js")) continue;
    visited.add(file);
    const js = readFn(file);
    for (const spec of extractStaticImports(js)) {
      if (/^https?:\/\//i.test(spec)) {
        cdnImports.add(spec);
        continue;
      }
      const resolved = resolveImport(file, spec);
      if (resolved) stack.push(resolved);
    }
  }
  return { files: [...visited].sort(), cdnImports: [...cdnImports].sort() };
}

function summarize(page, mode) {
  const readFn = mode === "head" ? readHead : readCurrent;
  const sizeFn = mode === "head" ? sizeHead : sizeCurrent;
  const html = readFn(page);
  const refs = extractHtmlRefs(html);
  const scripts = refs.filter((ref) => ref.type === "script").map((ref) => ref.value);
  const css = refs.filter((ref) => ref.type === "css").map((ref) => ref.value);
  const images = refs.filter((ref) => ref.type === "image").map((ref) => ref.value);
  const graph = collectGraph(scripts, readFn);
  const jsBytes = graph.files.reduce((sum, file) => sum + sizeFn(file), 0);
  const directBytes = refs.reduce((sum, ref) => sum + sizeFn(ref.value), 0);
  return {
    page,
    mode,
    scripts: scripts.length,
    stylesheets: css.length,
    images: images.length,
    moduleFiles: graph.files.length,
    cdnImports: graph.cdnImports.length,
    directKB: +(directBytes / 1024).toFixed(1),
    localModuleKB: +(jsBytes / 1024).toFixed(1),
    scriptsList: scripts,
    moduleFilesList: graph.files
  };
}

const rows = pages.map((page) => {
  const before = summarize(page, "head");
  const after = summarize(page, "current");
  return {
    page,
    beforeDirectKB: before.directKB,
    afterDirectKB: after.directKB,
    beforeModuleKB: before.localModuleKB,
    afterModuleKB: after.localModuleKB,
    beforeModules: before.moduleFiles,
    afterModules: after.moduleFiles,
    beforeScripts: before.scripts,
    afterScripts: after.scripts,
    beforeCdnImports: before.cdnImports,
    afterCdnImports: after.cdnImports
  };
});

console.table(rows);
