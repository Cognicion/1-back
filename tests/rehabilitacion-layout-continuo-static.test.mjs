import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

const pages = {
  index: "rehabilitacion-cognitiva.html",
  evc: "rehabilitacion-evc.html",
  tdah: "rehabilitacion-tdah.html",
  nback: "nback.html",
  stroop: "stroop.html",
  goNogo: "go-nogo.html",
  cpt: "cpt.html",
  escuchaDicotica: "escucha-dicotica.html",
  busquedaVisual: "busqueda-visual.html",
  reconocimientoEmociones: "reconocimiento-emociones.html",
};

const activityPages = [
  pages.nback,
  pages.stroop,
  pages.goNogo,
  pages.cpt,
  pages.escuchaDicotica,
  pages.busquedaVisual,
  pages.reconocimientoEmociones,
];

const versionedStylesheet = (stylesheet) => new RegExp(
  `href=["']${stylesheet.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\?v=[^"'#\\s>]+["']`,
  "u",
);

const hasBodyClass = (html, expectedClass) => {
  const body = html.match(/<body\b[^>]*\bclass=["']([^"']*)["'][^>]*>/iu);
  assert.ok(body, "La página debe declarar clases en <body>");
  assert.ok(
    body[1].split(/\s+/u).includes(expectedClass),
    `Falta la clase ${expectedClass} en <body>`,
  );
};

test("las diez páginas de rehabilitación existen y declaran su contexto visual", () => {
  assert.equal(Object.keys(pages).length, 10);
  for (const path of Object.values(pages)) {
    assert.ok(existsSync(resolve(ROOT, path)), `Falta ${path}`);
  }

  hasBodyClass(read(pages.index), "rehabilitacion-index-page");
  hasBodyClass(read(pages.evc), "pagina-evc");
  hasBodyClass(read(pages.tdah), "adhd-page");

  for (const path of activityPages) {
    hasBodyClass(read(path), "rehab-activity-page");
  }
});

test("cada rama carga una hoja de layout continuo con versión de caché", () => {
  assert.match(
    read(pages.index),
    versionedStylesheet("css/rehabilitacion-cognitiva.css"),
  );
  assert.match(
    read(pages.evc),
    versionedStylesheet("css/rehabilitacion-evc.css"),
  );
  assert.match(
    read(pages.tdah),
    versionedStylesheet("css/rehabilitacion-tdah.css"),
  );

  for (const path of activityPages) {
    assert.match(
      read(path),
      versionedStylesheet("css/rehabilitacion-actividades-continuas.css"),
      `${path} debe cargar la hoja compartida versionada`,
    );
  }
});

test("la portada usa un lienzo ancho y secciones planas", () => {
  const css = read("css/rehabilitacion-cognitiva.css");

  assert.match(
    css,
    /body\.rehabilitacion-index-page \.rehabilitacion-shell\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;/su,
  );
  assert.match(
    css,
    /body\.rehabilitacion-index-page \.hero-rehabilitacion\s*\{[^}]*border-radius:\s*0;[^}]*box-shadow:\s*none;/su,
  );
  assert.match(
    css,
    /body\.rehabilitacion-index-page \.bloque-rehabilitacion\s*\{[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/su,
  );
  assert.match(
    css,
    /html\[data-theme="light"\] body\.rehabilitacion-index-page \.hero-orbita\s*\{[^}]*background-color:\s*transparent\s*!important;[^}]*background-image:\s*none\s*!important;/su,
  );
  assert.match(css, /\.tarjeta-actividad,[\s\S]*?\.tarjeta-tamizaje,[\s\S]*?\.grid-progreso article/u);
});

test("EVC conserva controles y estados dentro de secciones continuas", () => {
  const css = read("css/rehabilitacion-evc.css");

  assert.match(css, /\.evc-shell\s*\{[^}]*max-width:\s*none;/su);
  assert.match(css, /\.evc-hero\s*\{[^}]*background:\s*transparent;/su);
  assert.match(
    css,
    /\.panel-evc\s*\{[^}]*border:\s*0;[^}]*border-top:[^;]+;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/su,
  );
  assert.match(
    css,
    /\.evc-paciente\s*\{[^}]*border:\s*0;[^}]*border-left:[^;]+;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/su,
  );
  assert.match(
    css,
    /\.dominio-evc\s*\{[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/su,
  );
  assert.match(
    css,
    /html\[data-theme\] body\.pagina-evc \.dominio-evc\s*>\s*header\s*\{[^}]*background-color:\s*transparent\s*!important;[^}]*background-image:\s*none\s*!important;/su,
  );
  assert.match(css, /\.prioridad-plan-evc,\s*\.actividad-plan-evc\s*\{[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/su);
  assert.match(css, /\.plan-evc\[hidden\]\s*\{\s*display:\s*none;\s*\}/su);
});

test("TDAH usa todo el ancho sin alterar la visibilidad de sus vistas", () => {
  const css = read("css/rehabilitacion-tdah.css");

  assert.match(
    css,
    /\.adhd-shell\s*\{[^}]*width:\s*calc\(100%\s*-\s*clamp\([^)]*\)\);[^}]*max-width:\s*none;/su,
  );
  assert.match(
    css,
    /\.adhd-shell\s*>\s*:is\([\s\S]*?\.adhd-intro,[\s\S]*?\.adhd-patient-context,[\s\S]*?\.adhd-view,[\s\S]*?\.adhd-evidence-summary[\s\S]*?\)\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/u,
  );
  assert.match(
    css,
    /\.adhd-shell\s*>\s*\.adhd-section-tabs\s*\{[^}]*border-radius:\s*0;/su,
  );
  assert.match(
    css,
    /html\[data-theme="light"\] body\.adhd-page \.adhd-shell :is\([\s\S]*?\.adhd-section-heading[\s\S]*?\)\s*\{[^}]*background-color:\s*transparent\s*!important;[^}]*background-image:\s*none\s*!important;/u,
  );
  assert.match(css, /\.adhd-view\[hidden\]\s*\{\s*display:\s*none(?:\s*!important)?;\s*\}/su);
});

test("las siete actividades comparten layout plano solo fuera del embed TDAH", () => {
  const css = read("css/rehabilitacion-actividades-continuas.css");
  const scope = 'html:not([data-cognicion-embed="adhd-task"])';
  const bodyOccurrences = [...css.matchAll(/body\.rehab-activity-page/gu)];

  assert.ok(bodyOccurrences.length > 0, "La hoja compartida debe estar acotada a las actividades");
  for (const occurrence of bodyOccurrences) {
    const prefix = css.slice(Math.max(0, occurrence.index - scope.length - 4), occurrence.index);
    assert.match(prefix, /html:not\(\[data-cognicion-embed="adhd-task"\]\)\s*$/u);
  }

  for (const shell of [
    ".stroop-shell",
    ".go-shell",
    ".cpt-shell",
    ".dicotica-shell",
    ".visual-shell",
    ".emo-shell",
    ".container",
  ]) {
    assert.ok(css.includes(shell), `Falta el contenedor ancho ${shell}`);
  }
  assert.match(css, /max-width:\s*none;/u);

  for (const section of [
    ".instrucciones-nback",
    ".stroop-panel",
    ".go-hero",
    ".panel-go",
    ".arena-go",
    ".cpt-hero",
    ".panel-cpt",
    ".arena-cpt",
    ".dicotica-hero",
    ".panel-dicotica",
    ".arena-dicotica",
    ".visual-hero",
    ".visual-panel",
    ".visual-arena",
    ".emo-hero",
    ".emo-panel",
    ".arena-emociones",
  ]) {
    assert.ok(css.includes(section), `Falta aplanar ${section}`);
  }

  assert.match(
    css,
    /\.instrucciones-nback,[\s\S]*?\.arena-emociones[\s\S]*?\)\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/u,
  );
  assert.match(css, /\.instrucciones-grid\s*>\s*\.instruccion-card,[\s\S]*?\.emo-panel\.resultados \.graficas\s*>\s*article/u);
});
