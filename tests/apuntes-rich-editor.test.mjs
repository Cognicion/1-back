import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  agruparApuntes,
  crearVistaPreviaApunte,
  escaparHTML,
  filtrarApuntes,
  nombreCarpetaDisponible,
  obtenerTituloVisibleApunte,
  SIN_CARPETA
} from "../js/apuntes-core.js";
import {
  CODIGO_APUNTE_ELIMINADO,
  CODIGO_CONFLICTO_APUNTE,
  esConflictoApunte,
  esErrorConexionApunte,
  validarRevisionApunte
} from "../js/apuntes-revision.js";

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), "utf8");
const html = leer("../apuntes.html");
const css = leer("../css/apuntes.css");
const controlador = leer("../js/apuntes.js");
const sidebarControlador = leer("../js/apuntes-sidebar.js");
const reportes = leer("../js/reportes.js");
const encabezadoGlobal = leer("../js/components/globalAppHeader.js");
const precargaTema = leer("../js/theme-preload.js");
const textoRico = leer("../js/apuntes-rich-text.js");
const persistencia = leer("../js/services/apuntesMedicoPersistence.js");
const flotante = leer("../js/components/misApuntesFlotante.js");
const nota = leer("../nota.html");
const paciente = leer("../paciente.html");
const notaJs = leer("../js/nota.js");
const pacienteJs = leer("../js/paciente.js");
const version = leer("../js/config/appVersion.js");
const vinculacion = leer("../js/services/vinculacion.js");
const admin = leer("../js/admin.js");
const adminHtml = leer("../admin.html");

test("las vistas previas y títulos conservan el contrato de texto plano", () => {
  assert.equal(obtenerTituloVisibleApunte("  Regla   clínica  "), "Regla clínica");
  assert.equal(obtenerTituloVisibleApunte("  "), "Sin título");
  assert.equal(crearVistaPreviaApunte(" Uno\n\n dos   tres ", 12), "Uno dos tres");
  assert.equal(crearVistaPreviaApunte("123456789012345", 10), "1234567890…");
  assert.equal(crearVistaPreviaApunte(""), "Sin contenido");
  assert.equal(escaparHTML('<b title="x">A & B</b>'), "&lt;b title=&quot;x&quot;&gt;A &amp; B&lt;/b&gt;");
});

test("la búsqueda ignora mayúsculas, espacios y acentos", () => {
  const apuntes = [
    { id: "1", titulo: "Cardiología", contenido: "Presión arterial" },
    { id: "2", titulo: "Neurología", contenido: "Exploración" }
  ];

  assert.deepEqual(filtrarApuntes(apuntes, "cardiologia").map(({ id }) => id), ["1"]);
  assert.deepEqual(filtrarApuntes(apuntes, "  PRESION ").map(({ id }) => id), ["1"]);
  assert.deepEqual(filtrarApuntes(apuntes, "exploracion").map(({ id }) => id), ["2"]);
});

test("las carpetas agrupan sin perder apuntes legacy o con carpeta eliminada", () => {
  const carpetas = [
    { id: "b", nombre: "Urgencias" },
    { id: "a", nombre: "Cardiología" }
  ];
  const grupos = agruparApuntes([
    { id: "1", carpetaId: "a" },
    { id: "2" },
    { id: "3", carpetaId: "ya-no-existe" }
  ], carpetas);

  assert.deepEqual(grupos.map(({ id }) => id), ["a", "b", SIN_CARPETA]);
  assert.deepEqual(grupos[0].apuntes.map(({ id }) => id), ["1"]);
  assert.deepEqual(grupos.at(-1).apuntes.map(({ id }) => id), ["2", "3"]);
  assert.equal(nombreCarpetaDisponible("Cardiologia", carpetas), false);
  assert.equal(nombreCarpetaDisponible("cardiología", carpetas, "a"), true);
});

test("la revisión optimista impide guardar o eliminar una versión obsoleta", () => {
  assert.doesNotThrow(() => validarRevisionApunte({ existe: true, fechaActualizacion: "v2" }, "v2"));
  assert.throws(
    () => validarRevisionApunte({ existe: true, fechaActualizacion: "v3" }, "v2"),
    (error) => error.code === CODIGO_CONFLICTO_APUNTE && esConflictoApunte(error)
  );
  assert.throws(
    () => validarRevisionApunte({ existe: false, fechaActualizacion: "" }, "v2"),
    (error) => error.code === CODIGO_APUNTE_ELIMINADO && esConflictoApunte(error)
  );
  assert.equal(esErrorConexionApunte({ code: "unavailable" }, true), true);
  assert.equal(esErrorConexionApunte({ code: "permission-denied" }, true), false);
});

test("el HTML ofrece carpetas, formato accesible y accesos globales integrados", () => {
  assert.match(html, /id="nuevaCarpeta"/);
  assert.match(html, /id="sidebarApuntes"/);
  assert.match(html, /id="alternarSidebarApuntes"[\s\S]*aria-controls="sidebarApuntes"[\s\S]*aria-expanded="true"/);
  assert.match(html, /id="dialogoCarpeta"/);
  assert.match(html, /id="apunteCarpeta"/);
  assert.match(html, /id="apunteContenido"[\s\S]*contenteditable="true"/);
  assert.match(html, /role="toolbar" aria-label="Formato de texto"/);
  assert.match(html, /id="formatoNegrita"[\s\S]*aria-pressed="false"/);
  assert.match(html, /id="colorTexto" type="color"/);
  assert.match(html, /id="colorFondoTexto" type="color"/);
  assert.match(html, /data-global-notifications-link="true"/);
  assert.match(html, /data-accesos-rapidos/);
  assert.match(html, /class="global-header-branding" data-global-header-branding/);
  assert.match(html, /data-global-header-title>Mis apuntes</);
  assert.match(html, /data-global-header-description>Notas personales, recordatorios y pendientes\.<\/span>/);
  assert.match(html, /<nav class="global-header-actions" aria-label="Navegación de apuntes">/);
  assert.match(html, /<body class="bloqueado pagina-apuntes">/);
  assert.match(html, /theme-preload\.js\?v=20260820-apuntes-navbar-v1/);
  assert.match(html, /reportes\.js\?v=20260820-apuntes-navbar-v1/);
  assert.match(html, /apuntes\.css\?v=20260820-apuntes-navbar-v1/);
  assert.match(html, /apuntes\.js\?v=20260820-apuntes-navbar-v1/);
  assert.match(encabezadoGlobal, /MIGRATED_PAGES = new Set\([^)]*"apuntes"/);
  assert.match(encabezadoGlobal, /pageId === "apuntes"\) return document\.querySelector\("header\.topbar-apuntes"\)/);
  assert.match(precargaTema, /globalAppHeader\.js\?v=20260820-apuntes-navbar-v1/);
});

test("el layout usa el lienzo completo y evita controles flotantes", () => {
  const reglaTopbar = css.match(/\.topbar-apuntes\s*\{([^}]*)\}/)?.[1] || "";
  const reglaShell = css.match(/\.apuntes-shell\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(reglaTopbar, /position:\s*relative/);
  assert.match(reglaTopbar, /z-index:\s*4/);
  assert.match(reglaTopbar, /min-height:\s*56px/);
  assert.match(reglaShell, /width:\s*100%/);
  assert.match(reglaShell, /margin:\s*0/);
  assert.match(reglaShell, /gap:\s*0/);
  assert.doesNotMatch(css, /width:\s*min\(1280px/);
  assert.match(css, /grid-template-columns:\s*clamp\(276px, 23vw, 360px\) minmax\(0, 1fr\)/);
  assert.match(css, /\.acciones-apuntes\s*\{[\s\S]*padding-right:\s*205px/);
  assert.match(css, /body\.reporte-global-contraido \.apuntes-shell \.acciones-apuntes\s*\{\s*padding-right:\s*52px/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*body\.reporte-global-contraido \.apuntes-shell \.acciones-apuntes\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(82px, 90px\) minmax\(82px, 90px\)/);
  assert.match(css, /\.selector-carpeta select\s*\{[\s\S]*color-scheme:\s*dark/);
  assert.match(css, /\.selector-carpeta select option,[\s\S]*color:\s*#fff5e6;[\s\S]*background-color:\s*#1f0b11/);
  assert.match(css, /html:is\(\[data-theme="light"\], \[data-theme\^="light-"\]\) \.selector-carpeta select\s*\{[\s\S]*color-scheme:\s*light/);
  assert.match(css, /@media \(hover: none\)[\s\S]*\.carpeta-acciones\s*\{[\s\S]*opacity:\s*1/);
  assert.match(css, /\.editor-contenido:empty::before/);
  assert.match(reportes, /contraerPorDefectoEnApuntes/);
  assert.match(reportes, /classList\.contains\("pagina-apuntes"\)/);
  assert.match(reportes, /function sincronizarEstadoReporteContraido\(raiz\)[\s\S]*"reporte-global-contraido"[\s\S]*classList\.contains\("reporte-widget-contraido"\)/);
  assert.match(css, /\.apuntes-shell\.sidebar-retraida\s*\{[\s\S]*grid-template-columns:\s*0 minmax\(0, 1fr\)/);
  assert.match(css, /@media \(hover: none\) and \(min-width: 900px\)[\s\S]*\.boton-alternar-sidebar[\s\S]*width:\s*44px[\s\S]*height:\s*44px/);
  assert.match(controlador, /import \{ inicializarSidebarApuntes \} from "\.\/apuntes-sidebar\.js"/);
  assert.match(sidebarControlador, /PREFIJO_ESTADO_SIDEBAR = "cognicion:apuntes:sidebar-retraida"/);
  assert.match(sidebarControlador, /sidebar\.inert = oculta/);
});

test("la persistencia rica mantiene texto plano y sanea el HTML", () => {
  assert.match(controlador, /contenidoHtmlActualizado:\s*fechaActualizacion/);
  assert.match(controlador, /contenidoHtmlActualizado === apunte\.fechaActualizacion/);
  assert.match(controlador, /import \{ sanitizarHTMLRico \} from "\.\/apuntes-rich-text\.js"/);
  assert.match(textoRico, /new Set\(\["B", "STRONG", "BR", "DIV", "P", "SPAN", "FONT"\]\)/);
  assert.match(textoRico, /new Set\(\["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH"\]\)/);
  assert.match(controlador, /addEventListener\("paste", pegarComoTextoSeguro\)/);
  assert.match(controlador, /runTransaction/);
  assert.match(controlador, /TAMANO_LOTE = 450/);
  assert.match(controlador, /Promise\.all\(referencias\.map\(\(referencia\) => transaccion\.get\(referencia\)\)\)/);
  assert.match(controlador, /fechaActualizacion:\s*fechaMovimiento/);
  assert.match(controlador, /cambios\.contenidoHtmlActualizado = fechaMovimiento/);
  assert.match(controlador, /guardandoApunte/);
  assert.match(controlador, /eliminandoApunte/);
  assert.match(controlador, /actualizarCacheApunteGuardado/);
  assert.match(controlador, /editor\.contentEditable = String\(!ocupada\)/);
  assert.match(controlador, /Promise\.allSettled/);
  assert.match(controlador, /original\?\.carpetaId \|\| null/);
  assert.match(controlador, /document\.getElementById\("apunteId"\)\.value = creado\.id/);
  assert.match(controlador, /if \(!omitirConfirmacion && idActual === id\) return;/);
  assert.match(controlador, /aria-current="true"/);
  assert.match(controlador, /restaurarFocoLista/);
});

test("el editor flotante invalida formato solo cuando cambia el contenido", () => {
  assert.match(flotante, /deleteField/);
  assert.match(flotante, /serverTimestamp/);
  assert.match(flotante, /const contenidoCambio = !original \|\| contenido !== String\(original\.contenido/);
  assert.match(flotante, /payload\.contenidoHtml = deleteField\(\)/);
  assert.match(flotante, /payload\.contenidoHtmlActualizado = fechaActualizacion/);
  assert.match(flotante, /Al cambiar el contenido se quitará su formato/);
  assert.match(flotante, /ponerPanelApuntesOcupado\(true\)/);
  assert.match(flotante, /panel\?\.querySelectorAll\("button, input, textarea"\)/);
  assert.match(flotante, /confirmarDescartarCambiosPanel/);
  assert.match(flotante, /cambiosApunteMedicoPaciente = true/);
  assert.match(flotante, /addEventListener\("beforeunload"/);
  assert.match(flotante, /actualizarCacheApuntePanel/);
  assert.match(flotante, /setAttribute\("aria-current", "true"\)/);
  assert.doesNotMatch(flotante, /setAttribute\("aria-selected"/);
  assert.match(nota, /id="estadoApuntesMedicoPaciente" role="status" aria-live="polite"/);
  assert.match(paciente, /id="estadoApuntesMedicoPaciente" role="status" aria-live="polite"/);
  for (const vistaFlotante of [nota, paciente]) {
    assert.match(vistaFlotante, /id="panelApuntesMedicoPaciente"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="tituloApuntesMedicoPaciente"/);
  }
  assert.match(flotante, /focoAntesPanelApuntes/);
  assert.match(flotante, /evento\.key !== "Tab"/);
  assert.match(nota, /misApuntesFlotante\.js\?v=20260820-apuntes-rich-v1/);
  assert.match(paciente, /misApuntesFlotante\.js\?v=20260820-apuntes-rich-v1/);
  for (const consumidorLegacy of [notaJs, pacienteJs]) {
    assert.match(consumidorLegacy, /contenidoCambio/);
    assert.match(consumidorLegacy, /payload\.contenidoHtml = deleteField\(\)/);
    assert.match(consumidorLegacy, /payload\.contenidoHtmlActualizado = fechaActualizacion/);
    assert.match(consumidorLegacy, /actualizarApunteConRevision/);
    assert.match(consumidorLegacy, /aria-current/);
  }
  assert.match(flotante, /actualizarApunteConRevision/);
  assert.match(persistencia, /runTransaction/);
  assert.match(persistencia, /validarRevisionApunte/);
  assert.match(persistencia, /transaccion\.delete\(referencia\)/);
  assert.match(nota, /nota\.js\?v=20260820-patient-notes-import-v1/);
  assert.match(paciente, /paciente\.js\?v=20260820-apuntes-rich-folders-v1/);
});

test("vinculación y eliminación administrativa incluyen las carpetas", () => {
  assert.match(vinculacion, /"apuntesMedico",\s*"carpetasApuntes"/);
  assert.match(admin, /"apuntesMedico",\s*"carpetasApuntes",\s*"borradoresMedico"/);
  assert.match(adminHtml, /admin\.js\?v=20260820-apuntes-rich-folders-v1/);
});

test("la versión visible se incrementa para el cambio funcional", () => {
  assert.match(version, /2026-08-20-apuntes-collapsible-sidebar-v1/);
  assert.match(version, /2026-08-20-apuntes-global-navbar-layout-v1/);
  assert.match(version, /APP_VERSION = "2\.043"/);
});
