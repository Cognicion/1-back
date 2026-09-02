import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = resolve(root, "rehabilitacion-tdah.html");
const cssPath = resolve(root, "css", "rehabilitacion-tdah.css");
const viewPath = resolve(root, "js", "adhd", "ui", "adhdProgramView.js");
const nativeRunnerPath = resolve(root, "js", "adhd", "tasks", "adhdNativeTaskRunner.js");
const html = readFileSync(htmlPath, "utf8");
const css = readFileSync(cssPath, "utf8");
const viewSource = readFileSync(viewPath, "utf8");
const nativeRunnerSource = readFileSync(nativeRunnerPath, "utf8");

function withoutQuery(value) {
  return value.split(/[?#]/, 1)[0];
}

function isRemote(value) {
  return /^(?:https?:|data:|mailto:|tel:|javascript:|#)/i.test(value);
}

function localReference(fromPath, value) {
  const clean = withoutQuery(value);
  return resolve(dirname(fromPath), clean);
}

function assertLocalReferencesExist(sourcePath, source, pattern) {
  for (const match of source.matchAll(pattern)) {
    const reference = match[1];
    if (!reference || isRemote(reference)) continue;
    const target = localReference(sourcePath, reference);
    assert.ok(existsSync(target), "No existe el recurso local " + reference + " referenciado por " + sourcePath);
  }
}

assert.match(html, /^<!DOCTYPE html>/i);
assert.match(html, /<html\b[^>]*\blang="es"/i);
assert.match(html, /<meta\b[^>]*name="viewport"[^>]*viewport-fit=cover/i);
assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i);

assertLocalReferencesExist(htmlPath, html, /\b(?:href|src)="([^"]+)"/g);

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "La página TDAH no debe contener identificadores DOM duplicados");
const idSet = new Set(ids);

for (const match of html.matchAll(/\baria-controls="([^"]+)"/g)) {
  assert.ok(idSet.has(match[1]), "aria-controls apunta a un id inexistente: " + match[1]);
}
for (const match of html.matchAll(/\baria-labelledby="([^"]+)"/g)) {
  for (const id of match[1].trim().split(/\s+/)) {
    assert.ok(idSet.has(id), "aria-labelledby apunta a un id inexistente: " + id);
  }
}

for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
  const tag = match[1].toLowerCase();
  const attributes = match[2];
  const type = attributes.match(/\btype="([^"]+)"/i)?.[1]?.toLowerCase();
  if (tag === "input" && ["hidden", "button", "submit", "reset"].includes(type)) continue;
  const hasAriaName = /\baria-(?:label|labelledby)="[^"]+"/i.test(attributes);
  const id = attributes.match(/\bid="([^"]+)"/i)?.[1];
  const before = html.slice(0, match.index);
  const nestedInLabel = before.lastIndexOf("<label") > before.lastIndexOf("</label>");
  const hasExplicitLabel = Boolean(id && new RegExp("<label\\b[^>]*\\bfor=\"" + id + "\"", "i").test(html));
  assert.ok(hasAriaName || nestedInLabel || hasExplicitLabel, "Control " + tag + (id ? "#" + id : "") + " sin nombre accesible");
}

const views = [...html.matchAll(/<section\b[^>]*\bdata-adhd-view="([^"]+)"[^>]*>/g)].map((match) => match[1]);
assert.deepEqual(views, ["overview", "assessment", "profile", "plan", "session", "clinician"]);
assert.match(html, /class="adhd-current-tab"[^>]*data-adhd-tab="overview"[^>]*aria-selected="true"/);
assert.match(html, /class="adhd-view adhd-current-view"[^>]*data-adhd-view="overview"/);
assert.doesNotMatch(html, /class="active"/);
assert.match(viewSource, /classList\.toggle\("adhd-current-tab", active\)/);
assert.match(viewSource, /classList\.toggle\("adhd-current-view", active\)/);
assert.match(html, /<dialog\b[^>]*id="adhdTaskDialog"[^>]*aria-labelledby="adhdTaskDialogTitle"/);
assert.match(html, /<dialog\b[^>]*id="adhdReassessmentDialog"[^>]*aria-labelledby="adhdReassessmentTitle"/);
assert.match(html, /id="adhdStatusBanner"[^>]*role="status"[^>]*aria-live="polite"/);
assert.match(html, /id="adhdIntakeError"[^>]*role="alert"/);
const progressTag = html.match(/<div\b[^>]*id="adhdBatteryProgress"[^>]*>/i)?.[0];
assert.ok(progressTag, "No se encontró el indicador de progreso de la batería");
assert.match(progressTag, /\brole="progressbar"/);
assert.match(progressTag, /\baria-valuemin="0"/);
assert.match(progressTag, /\baria-valuemax="100"/);

assert.match(css, /:focus-visible\s*\{/);
assert.match(css, /@media\s*\(max-width:\s*760px\)/);
assert.match(css, /@media\s*\(max-width:\s*480px\)/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
assert.match(css, /\.adhd-task-dialog\s*\{[\s\S]*?max-height:\s*calc\(100dvh\s*-\s*20px\)/);
assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.adhd-task-dialog\s*\{[\s\S]*?width:\s*100%[\s\S]*?max-height:\s*100dvh/);
assert.match(css, /\.adhd-section-tabs\s*\{[\s\S]*?overflow-x:\s*auto/);
assert.match(css, /\.adhd-table-wrap\s*\{[\s\S]*?overflow-x:\s*auto/);
assert.match(css, /\.adhd-page\s+:where\(button,\s*a,\s*input,\s*select,\s*textarea\):focus-visible/);
assert.match(css, /#adhdCloseTask\s*\{[\s\S]*?flex:\s*0 0 44px[\s\S]*?min-width:\s*44px/);
assert.match(css, /html\[data-theme\]\s+body\.adhd-page\s+\.adhd-primary/);
assert.match(css, /html\[data-theme\]\s+body\.adhd-page\s+:is\(\.adhd-section-heading,\s*\.adhd-task-shell > header\)/);
assert.match(css, /html\[data-theme\]\s+body\.adhd-page\s+\.adhd-view\.adhd-current-view/);
assert.match(nativeRunnerSource, /\.adhd-native-task :is\(h2,h3,strong\)\{color:var\(--adhd-ink\)!important\}/);
assert.match(nativeRunnerSource, /\.adhd-native-task \.adhd-native-task__button\{background:var\(--adhd-accent\)!important/);

function relativeLuminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const primaryPairs = [
  ["08100d", "3f9b66"],
  ["ffffff", "1e5c3d"],
  ["fff7e7", "9f2938"]
];
for (const [foreground, background] of primaryPairs) {
  assert.ok(contrastRatio(foreground, background) >= 4.5, "El botón primario no alcanza contraste AA: #" + foreground + " sobre #" + background);
}

const visitedScripts = new Set();
function verifyModuleGraph(modulePath) {
  const normalized = resolve(modulePath);
  if (visitedScripts.has(normalized)) return;
  visitedScripts.add(normalized);
  assert.ok(existsSync(normalized), "No existe el módulo " + normalized);
  const source = readFileSync(normalized, "utf8");
  const references = [
    ...source.matchAll(/\b(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)
  ];
  for (const match of references) {
    const reference = match[1];
    if (isRemote(reference) || !reference.startsWith(".")) continue;
    const child = localReference(normalized, reference);
    assert.ok(existsSync(child), "No existe el módulo local " + reference + " importado por " + normalized);
    if (extname(child) === ".js") verifyModuleGraph(child);
  }
}

for (const match of html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g)) {
  const reference = match[1];
  if (!isRemote(reference)) verifyModuleGraph(localReference(htmlPath, reference));
}

const visitedCss = new Set();
function verifyCssGraph(stylesheetPath) {
  const normalized = resolve(stylesheetPath);
  if (visitedCss.has(normalized)) return;
  visitedCss.add(normalized);
  assert.ok(existsSync(normalized), "No existe la hoja " + normalized);
  const source = readFileSync(normalized, "utf8");
  for (const match of source.matchAll(/@import\s+(?:url\()?["']([^"']+)["']/g)) {
    const reference = match[1];
    if (!isRemote(reference)) verifyCssGraph(localReference(normalized, reference));
  }
}

for (const match of html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)) {
  const reference = match[1];
  if (!isRemote(reference)) verifyCssGraph(localReference(htmlPath, reference));
}

console.log("ADHD visual static contract tests passed");
