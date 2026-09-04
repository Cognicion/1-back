import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

const themePreload = read("js/theme-preload.js");
const globalHeader = read("js/components/globalAppHeader.js");
const quickAccess = read("js/components/accesosRapidos.js");
const reports = read("js/reportes.js");
const themeBootstrap = read("js/services/themeBootstrap.js");
const bridge = read("js/adhd/integration/adhdTaskPageBridge.js");
const programView = read("js/adhd/ui/adhdProgramView.js");
const programCss = read("css/rehabilitacion-tdah.css");
const programHtml = read("rehabilitacion-tdah.html");
const sharedEmbedCss = read("css/adhd-task-embed.css");
const cptHtml = read("cpt.html");
const cptController = read("js/cpt.js");
const cptEmbedCss = read("css/cpt-adhd-embed.css");
const goNoGoHtml = read("go-nogo.html");
const goNoGoController = read("js/go-nogo.js");
const goNoGoEmbedCss = read("css/go-nogo-adhd-embed.css");
const stroopHtml = read("stroop.html");
const stroopController = read("js/stroop.js");
const stroopEmbedCss = read("css/stroop-adhd-embed.css");
const nbackHtml = read("nback.html");
const nbackEmbedCss = read("css/nback-adhd-embed.css");
const dichoticHtml = read("escucha-dicotica.html");
const dichoticController = read("js/escucha-dicotica.js");
const dichoticEmbedCss = read("css/escucha-dicotica-adhd-embed.css");

const LEGACY_TASK_PAGES = [
  "cpt.html",
  "go-nogo.html",
  "stroop.html",
  "nback.html",
  "escucha-dicotica.html"
];

test("el modo embebido se declara antes del primer render en todas las tareas legacy", () => {
  assert.match(themePreload, /window\.self !== window\.top/u);
  assert.match(themePreload, /get\("adhd"\) === "1"[\s\S]*?get\("embed"\) === "1"[\s\S]*?embeddedBySameOriginHost/u);
  assert.match(themePreload, /window\.parent\.location\.origin === window\.location\.origin/u);
  assert.match(themePreload, /bootstrapPrefix = "cognicion-adhd-bridge:"[\s\S]*?\^\[a-zA-Z0-9_-\]\{8,160\}\$/u);
  assert.match(themePreload, /root\.dataset\.cognicionEmbed = "adhd-task"/u);
  assert.match(themePreload, /adhd-task-embed\.css\?v=20260902-adhd-task-embed-v2/u);
  assert.match(themePreload, /DOMContentLoaded[\s\S]*?if \(embeddedAdhdTask\) return;[\s\S]*?globalAppHeader/u);
  for (const page of LEGACY_TASK_PAGES) {
    const pageSource = read(page);
    assert.match(pageSource, /theme-preload\.js\?v=20260902-adhd-task-embed-v2/u, `${page} debe invalidar el bootstrap síncrono anterior`);
    assert.match(pageSource, /themeBootstrap\.js\?v=20260902-adhd-task-embed-v2/u, `${page} debe invalidar el bootstrap modular anterior`);
    assert.match(pageSource, /reportes\.js\?v=20260902-adhd-task-embed-v2/u, `${page} debe invalidar el widget de reportes anterior`);
    assert.match(pageSource, /accesosRapidos\.js\?v=20260902-adhd-task-embed-v2/u, `${page} debe invalidar los accesos rápidos anteriores`);
  }
});

test("navbar, accesos, reportes y fondo global se omiten dentro del iframe", () => {
  assert.match(globalHeader, /dataset\.cognicionEmbed === "adhd-task"[\s\S]*?return null/u);
  assert.match(quickAccess, /esTareaAdhdEmbebidaAutenticada[\s\S]*?sameOriginParent[\s\S]*?cognicion-adhd-bridge/u);
  assert.match(reports, /ES_TAREA_ADHD_EMBEBIDA[\s\S]*?if \(!ES_TAREA_ADHD_EMBEBIDA\) asegurarCssReporte/u);
  assert.match(themeBootstrap, /dataset\.cognicionEmbed === "adhd-task"[\s\S]*?if \(!embeddedAdhdTask\)/u);
  assert.match(themeBootstrap, /if \(!embeddedAdhdTask\) \{[\s\S]*?import\("https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.2\/firebase-auth\.js"\)/u);
  assert.doesNotMatch(themeBootstrap, /^import\s/u);
  for (const selector of [
    "[data-global-app-header]",
    "[data-accesos-rapidos-global]",
    "#reporteGlobalWidget",
    "#cognicion-biocellular-background"
  ]) {
    assert.ok(sharedEmbedCss.includes(selector), `falta aislar ${selector} en el CSS embebido`);
    assert.ok(bridge.includes(selector), `falta el respaldo del puente para ${selector}`);
  }
});

test("el modo TDAH operacional exige el contexto embebido autenticado", () => {
  for (const [path, source] of [
    ["js/cpt.js", cptController],
    ["js/go-nogo.js", goNoGoController],
    ["js/stroop.js", stroopController],
    ["nback.html", nbackHtml],
    ["js/escucha-dicotica.js", dichoticController]
  ]) {
    assert.match(source, /const adhdTaskRequested = [\s\S]{0,100}?get\("adhd"\) === "1"/u, `${path} debe reconocer la solicitud explícita`);
    assert.match(source, /const adhdTaskMode = adhdTaskRequested[\s\S]{0,120}?cognicionEmbed|const adhdTaskMode = adhdTaskRequested && embedded(?:Adhd)?TaskMode/u,
      `${path} no debe omitir persistencia sin un bootstrap autenticado`);
    assert.match(source, /adhdTaskPageBridge\.js\?v=20260902-adhd-task-embed-v2/u, `${path} debe invalidar el puente anterior`);
  }
  assert.match(programHtml, /rehabilitacion-tdah\.js\?v=20260902-adhd-task-embed-v2/u);
  assert.match(read("js/rehabilitacion-tdah.js"), /adhdProgramView\.js\?v=20260902-adhd-task-embed-v2/u);
});

test("el host oculto no roba la fila central y el iframe conserva toda el área útil", () => {
  assert.match(programHtml, /rehabilitacion-tdah\.css\?v=20260903-layout-continuo-v1/u);
  assert.match(programHtml, /rehabilitacion-tdah\.js\?v=20260902-adhd-task-embed-v2/u);
  assert.match(programCss, /\.adhd-task-host\[hidden\],[\s\S]*?\.adhd-task-frame\[hidden\][\s\S]*?display:\s*none\s*!important/u);
  assert.match(programCss, /\.adhd-task-shell\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(320px, 1fr\) auto/u);
  assert.match(programCss, /\.adhd-task-frame\s*\{[\s\S]*?width:\s*100%[\s\S]*?height:\s*100%/u);
  assert.match(programView, /adhdReduceDifficulty"\)\?\.toggleAttribute\("hidden", external\)/u);
});

test("CPT embebido abre instrucciones de práctica y usa un viewport compacto", () => {
  assert.match(cptHtml, /cpt-adhd-embed\.css\?v=20260902-adhd-task-embed-v2/u);
  assert.match(cptHtml, /cpt\.js\?v=20260902-adhd-task-embed-v2/u);
  assert.match(cptController, /const embeddedTaskMode = document\.documentElement\.dataset\.cognicionEmbed === "adhd-task"/u);
  assert.match(cptController, /ocultarTodo\(embeddedTaskMode \? "config" : "inicio"\)/u);
  assert.match(cptController, /document\.readyState === "loading"[\s\S]*?DOMContentLoaded[\s\S]*?inicializarCpt\(\)/u);
  assert.match(cptController, /if \(!embeddedTaskMode && \$\("pantallaCompleta"\)/u);
  assert.match(cptController, /interruptions:\s*interrupciones/u);
  assert.match(cptEmbedCss, /html\[data-cognicion-embed="adhd-task"\] #pantallaConfiguracion\.visible[\s\S]*?place-content:\s*center/u);
  assert.match(cptEmbedCss, /#pantallaConfiguracion :is\(\.seccion-titulo, \.config-grid, \.estado-mando\)[\s\S]*?display:\s*none/u);
  assert.match(cptEmbedCss, /#pantallaConfiguracion \.instrucciones-cpt[\s\S]*?border:\s*0[\s\S]*?background:\s*transparent/u);
  assert.match(cptEmbedCss, /#pantallaJuego\.visible[\s\S]*?grid-template-rows:[\s\S]*?height:\s*100dvh/u);
  assert.match(cptEmbedCss, /#pantallaResultados :is\(\.graficas-controles, \.graficas-cpt, \.tabla-cpt-wrap\)[\s\S]*?display:\s*none/u);
  assert.match(cptEmbedCss, /#pantallaResultados\.visible[\s\S]*?height:\s*100dvh[\s\S]*?overflow:\s*auto/u);
});

test("Go/No-Go embebido inicializa aunque DOMContentLoaded ya haya ocurrido", () => {
  assert.match(goNoGoHtml, /go-nogo-adhd-embed\.css\?v=20260902-adhd-task-embed-v2/u);
  assert.match(goNoGoHtml, /go-nogo\.js\?v=20260902-adhd-task-embed-v2/u);
  assert.match(goNoGoController, /const embeddedTaskMode = document\.documentElement\.dataset\.cognicionEmbed === "adhd-task"/u);
  assert.match(goNoGoController, /document\.readyState === "loading"[\s\S]*?DOMContentLoaded[\s\S]*?inicializarInterfaz\(\)/u);
  assert.match(goNoGoController, /ocultarTodo\(embeddedTaskMode \? "config" : "inicio"\)/u);
  assert.match(goNoGoEmbedCss, /#pantallaJuego\.visible[\s\S]*?height:\s*100dvh[\s\S]*?overflow:\s*hidden/u);
  assert.match(goNoGoEmbedCss, /:is\(\.panel-go, \.arena-go\)[\s\S]*?border:\s*0[\s\S]*?background:\s*transparent/u);
});

test("Stroop y N-Back embebidos mantienen práctica, respuestas y resultados dentro del iframe", () => {
  assert.match(stroopHtml, /stroop-adhd-embed\.css\?v=20260902-adhd-task-embed-v2/u);
  assert.match(stroopHtml, /stroop\.js\?v=20260902-adhd-task-embed-v2/u);
  assert.match(stroopEmbedCss, /\.stroop-task:not\(\[hidden\]\)[\s\S]*?grid-template-rows/u);
  assert.match(stroopEmbedCss, /\.answer-buttons[\s\S]*?repeat\(6, minmax\(0, 1fr\)\)/u);
  assert.match(nbackHtml, /nback-adhd-embed\.css\?v=20260902-adhd-task-embed-v2/u);
  assert.match(nbackHtml, /function actualizarVistaEmbebidaNback\(phase\)[\s\S]*?dataset\.nbackPhase = phase/u);
  assert.match(nbackHtml, /actualizarVistaEmbebidaNback\(modoPractica \? "practice" : "assessment"\)/u);
  assert.match(nbackEmbedCss, /data-nback-phase="practice"[\s\S]*?#grid[\s\S]*?display:\s*grid/u);
  assert.match(nbackEmbedCss, /data-nback-phase="result"[\s\S]*?#resultado[\s\S]*?overflow:\s*auto/u);
});

test("Escucha dicótica conserva la preparación auditiva real en un layout compacto", () => {
  assert.match(dichoticHtml, /escucha-dicotica-adhd-embed\.css\?v=20260902-adhd-task-embed-v2/u);
  assert.match(dichoticHtml, /btnValidarAudiosEmbed[\s\S]*?btnPracticaEmbed/u);
  assert.match(dichoticHtml, /escucha-dicotica\.js\?v=20260902-adhd-task-embed-v2/u);
  assert.match(dichoticController, /const embeddedAdhdTaskMode = document\.documentElement\.dataset\.cognicionEmbed === "adhd-task"/u);
  assert.match(dichoticController, /document\.readyState === "loading"[\s\S]*?DOMContentLoaded[\s\S]*?initializeDichoticPage/u);
  assert.match(dichoticController, /btnValidarAudiosEmbed[\s\S]*?validateAudioAssets/u);
  assert.match(dichoticController, /btnPracticaEmbed[\s\S]*?handleEmbeddedPrimaryAction/u);
  assert.match(dichoticController, /function handleEmbeddedPrimaryAction\(\)[\s\S]*?adhdPracticeCompleted[\s\S]*?startPractice\(\)[\s\S]*?startSelectedMode\(\)/u);
  assert.match(dichoticController, /embedPrimaryButton\.textContent = adhdPracticeCompleted \? "Iniciar aplicacion" : "Iniciar practica"/u);
  assert.match(dichoticController, /Practica completa\. Ya puedes iniciar la aplicacion\./u);
  assert.match(dichoticEmbedCss, /#pantallaPreparacion:not\(\.oculta\)[\s\S]*?height:\s*100dvh/u);
  assert.match(dichoticEmbedCss, /#pantallaEnsayo:not\(\.oculta\)[\s\S]*?height:\s*100dvh/u);
});
