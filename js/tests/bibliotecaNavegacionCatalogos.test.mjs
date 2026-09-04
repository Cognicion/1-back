import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { CATALOGO_DIAGNOSTICOS } from "../data/catalogoDiagnosticos.js";

const raiz = new URL("../../", import.meta.url);
const [html, javascript, estilos] = await Promise.all([
  readFile(new URL("biblioteca.html", raiz), "utf8"),
  readFile(new URL("js/biblioteca.js", raiz), "utf8"),
  readFile(new URL("css/biblioteca.css", raiz), "utf8")
]);

function extraerBloque(inicio, fin) {
  const indiceInicio = javascript.indexOf(inicio);
  const indiceFin = javascript.indexOf(fin, indiceInicio);
  assert.ok(indiceInicio >= 0 && indiceFin > indiceInicio, `No se encontró el bloque ${inicio}`);
  return javascript.slice(indiceInicio, indiceFin);
}

const escaparHtmlFuente = extraerBloque("function escaparHTML", "\nfunction validarDiagnosticosBiblioteca");

test("Biblioteca inicia con selección separada de CIE-10, CIE-11 y DSM-5-TR", () => {
  const bloqueCatalogos = javascript.match(/const CATALOGOS_DIAGNOSTICOS = \[([\s\S]*?)\n\];/)?.[1] || "";
  assert.match(bloqueCatalogos, /id: "cie10"/);
  assert.match(bloqueCatalogos, /id: "cie11"/);
  assert.match(bloqueCatalogos, /id: "dsm5"/);
  assert.match(javascript, /data-catalogo-diagnostico/);
  assert.doesNotMatch(html, /grupoCie10Biblioteca|sistemasDiagnosticosBiblioteca/);
});

test("el validador conserva todos los diagnósticos y sus equivalencias entre sistemas", () => {
  const inicioValidador = javascript.indexOf("function validarDiagnosticosBiblioteca");
  const finValidador = javascript.indexOf("\nfunction cargarCatalogoManualDiagnosticos", inicioValidador);
  assert.ok(inicioValidador >= 0 && finValidador > inicioValidador);

  const contexto = {
    CATALOGO_DIAGNOSTICOS,
    console: { error() {} }
  };
  vm.createContext(contexto);
  vm.runInContext(`
    const SYSTEM_ORDER = ["cie10", "cie11", "dsm5"];
    ${javascript.slice(inicioValidador, finValidador)}
    resultado = validarDiagnosticosBiblioteca(CATALOGO_DIAGNOSTICOS);
  `, contexto);

  const validos = contexto.resultado;
  const contarSistema = (sistema) => validos.filter((diagnostico) => diagnostico.sistemas?.[sistema]).length;
  assert.equal(contarSistema("cie10"), 4437);
  assert.equal(contarSistema("cie11"), 28);
  assert.equal(contarSistema("dsm5"), 12);
  assert.ok(validos.some((diagnostico) => diagnostico.id === "cie10-f41-1"));
  assert.ok(validos.some((diagnostico) => diagnostico.id === "cie10-f84-0"));
});

test("el índice CIE-10 declara siempre las letras A-Z, su rango y título", () => {
  const bloqueLetras = javascript.match(/const LETRAS_CIE10_BIBLIOTECA = \[([\s\S]*?)\n\];/)?.[1] || "";
  const letras = [...bloqueLetras.matchAll(/letra: "([A-Z])", rango: "([A-Z]\d{2}-[A-Z]\d{2})", titulo: "([^"]+)"/g)];
  assert.deepEqual(letras.map((coincidencia) => coincidencia[1]), [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]);
  letras.forEach(([, letra, rango, titulo]) => {
    assert.ok(rango.startsWith(letra));
    assert.ok(titulo.trim().length > 8);
  });
  assert.match(javascript, /data-letra-cie10/);
  assert.match(javascript, /cantidad\.toLocaleString\("es-MX"\)/);
  assert.match(javascript, /estado-cobertura/);
  assert.match(javascript, /class="letras-cie10-lista" role="list"/);
  assert.match(javascript, /class="letra-cie10-fila" role="listitem"/);
  assert.doesNotMatch(javascript, /letras-cie10-grid/);
  assert.match(estilos, /\.letras-cie10-lista\s*\{[^}]*gap:\s*0;[^}]*border:[^}]*border-radius:/s);
  assert.match(estilos, /\.letra-cie10-fila \+ \.letra-cie10-fila\s*\{[^}]*border-top:/s);
  assert.match(estilos, /\.letras-cie10-lista \.letra-cie10-card:hover\s*\{[^}]*box-shadow:\s*none\s*!important;[^}]*transform:\s*none\s*!important;/s);
  assert.match(estilos, /@media \(max-width: 760px\)\s*\{\s*\.navegacion-diagnosticos \.letras-cie10-lista \.letra-cie10-card\s*\{[^}]*grid-template-columns:/s);
  assert.match(javascript, /CAPITULOS_CIE10_FICHAS_COMPLETAS = new Set\(\["C", "D", "E"\]\)/);
  assert.match(javascript, /CAPITULOS_CIE10_CODIGOS_COMPLETOS = new Set\(\["A", "B", "C", "D", "E", "F", "G", "H", "I"\]\)/);
});

test("el buscador A-Z filtra letra, rango o título sin tocar búsquedas de otras vistas", () => {
  const filas = [
    { dataset: { letra: "A", rango: "A00-A99", titulo: "Ciertas enfermedades infecciosas y parasitarias" }, hidden: false },
    { dataset: { letra: "G", rango: "G00-G99", titulo: "Enfermedades del sistema nervioso" }, hidden: false },
    { dataset: { letra: "Z", rango: "Z00-Z99", titulo: "Factores que influyen en el estado de salud" }, hidden: false }
  ];
  const resumen = { textContent: "" };
  const estadoVacio = { hidden: true };
  const panel = {
    querySelectorAll(selector) { return selector === "[data-fila-letra-cie10]" ? filas : []; },
    querySelector(selector) {
      if (selector === "[data-resumen-filtro-letras]") return resumen;
      if (selector === "[data-sin-resultados-letras]") return estadoVacio;
      return null;
    }
  };
  const bloqueFiltro = extraerBloque("function filtrarIndiceLetrasCie10", "\nfunction renderizarIndiceLetrasCie10");
  assert.doesNotMatch(bloqueFiltro, /busquedasPorTab|\bfiltro\s*=/);

  const contexto = { panel };
  vm.createContext(contexto);
  vm.runInContext(`
    ${extraerBloque("function normalizarNombreDiagnostico", "\nfunction escaparHTML")}
    ${bloqueFiltro}
    filtrarIndiceLetrasCie10(panel, "sistema nervioso");
  `, contexto);
  assert.equal(filas[0].hidden, true);
  assert.equal(filas[1].hidden, false);
  assert.equal(filas[2].hidden, true);
  assert.equal(resumen.textContent, "1 de 3 letras");
  assert.equal(estadoVacio.hidden, true);

  vm.runInContext('filtrarIndiceLetrasCie10(panel, "G")', contexto);
  assert.deepEqual(filas.filter((fila) => !fila.hidden).map((fila) => fila.dataset.letra), ["G"]);

  vm.runInContext('filtrarIndiceLetrasCie10(panel, "sin coincidencia")', contexto);
  assert.ok(filas.every((fila) => fila.hidden));
  assert.equal(resumen.textContent, "0 de 3 letras");
  assert.equal(estadoVacio.hidden, false);
  assert.match(javascript, /id="buscadorLetrasCie10" type="search"/);
  assert.match(javascript, /data-sin-resultados-letras hidden/);
});

test("la lista proyecta un solo catálogo sin romper lazy loading ni lotes", () => {
  assert.match(javascript, /const sistemaSeleccionado = SYSTEM_ORDER\.includes\(catalogoDiagnosticoActual\)/);
  assert.match(javascript, /const TAMANO_LOTE_DIAGNOSTICOS = 120/);
  assert.match(javascript, /sistema\.criteriosLazy \? \[\] :/);
  assert.match(javascript, /data-volver-catalogos/);
  assert.match(javascript, /data-volver-letras/);
  assert.doesNotMatch(javascript, /sistemasVisibles|coincideGrupoCie10Diagnostico/);
});

test("G conserva el código normalizado y presenta la forma tabular con asterisco", () => {
  const diagnostico = CATALOGO_DIAGNOSTICOS.find((item) => item.sistemas?.cie10?.codigo === "G01");
  assert.ok(diagnostico);
  const contexto = { diagnostico };
  vm.createContext(contexto);
  vm.runInContext(`
    let catalogoDiagnosticoActual = "cie10";
    ${extraerBloque("function obtenerCodigoDiagnostico", "\nfunction compararDiagnosticosPorCodigo")}
    codigoNormalizado = obtenerCodigoDiagnostico(diagnostico, "cie10");
    codigoPresentado = obtenerCodigoPresentacionDiagnostico(diagnostico, "cie10");
  `, contexto);
  assert.equal(contexto.codigoNormalizado, "G01");
  assert.equal(contexto.codigoPresentado, "G01*");
});

test("la ficha farmacológica muestra y escapa el contrato clínico completo de G40", () => {
  const diagnostico = CATALOGO_DIAGNOSTICOS.find((item) => item.sistemas?.cie10?.codigo === "G40");
  assert.ok(diagnostico?.farmacologia?.reglas?.length);
  const contexto = { diagnostico };
  vm.createContext(contexto);
  vm.runInContext(`
    ${escaparHtmlFuente}
    ${extraerBloque("const ETIQUETAS_VALORES_FARMACOLOGICOS", "\nfunction renderizarDetallesDiagnostico")}
    resultado = renderizarFarmacologiaDiagnostico(diagnostico);
    resultadoHostil = renderizarReglaFarmacologica({
      titulo: "<img src=x onerror=alert(1)>",
      fuentes: ["<script>alert(1)</script>"],
      permiteOverride: false
    });
  `, contexto);
  for (const texto of [
    "Tipo", "Contraindicación", "Severidad", "Crítica", "Mecanismo", "Efecto clínico",
    "Recomendación", "Vigilancia sugerida", "Evidencia", "Confianza", "Fuentes",
    "Permite omitir la alerta</dt><dd>No"
  ]) assert.match(contexto.resultado, new RegExp(texto));
  assert.match(contexto.resultado, /dailymed\.nlm\.nih\.gov/);
  assert.match(contexto.resultado, /&amp;version=3/);
  assert.doesNotMatch(contexto.resultadoHostil, /<script>|<img/);
  assert.match(contexto.resultadoHostil, /&lt;script&gt;|&lt;img/);
});

test("el catálogo manual solo se ofrece en modo privado cuando tiene registros", () => {
  assert.match(javascript, /if \(modoBibliotecaPublica\) return \[\];/);
  assert.match(javascript, /if \(manuales\.length\)/);
  assert.match(javascript, /id: diagnostico\.id \|\| `manual-/);
  assert.match(javascript, /valores\.map\(\(item\) => `<li>\$\{escaparHTML\(item\)\}<\/li>`\)/);
});

test("el catálogo manual conserva su catálogo de origen sin reclasificarlo", () => {
  const manuales = [{ codigo: "6A70", nombre: "Registro manual", catalogo: "CIE-11" }];
  const contexto = { manuales };
  vm.createContext(contexto);
  vm.runInContext(`
    const modoBibliotecaPublica = false;
    function cargarCatalogoManualDiagnosticos() { return manuales; }
    ${extraerBloque("function normalizarNombreDiagnostico", "\nfunction escaparHTML")}
    ${extraerBloque("function convertirDiagnosticosManuales", "\nfunction textoBusquedaDiagnostico")}
    resultado = convertirDiagnosticosManuales()[0];
  `, contexto);
  assert.equal(contexto.resultado.catalogoOrigen, "CIE-11");
  assert.equal(contexto.resultado.codigoManual, "6A70");
  assert.equal(Object.keys(contexto.resultado.sistemas).length, 0);
  assert.match(javascript, /Catálogo manual · origen \$\{diagnostico\.catalogoOrigen\}/);
});

test("la navegación mueve el foco y anuncia la nueva vista", () => {
  const encabezado = { textContent: "Selecciona una letra", focusCount: 0, focus() { this.focusCount += 1; } };
  const estado = { textContent: "" };
  const panel = { querySelector(selector) { return selector === "[data-foco-navegacion]" ? encabezado : null; } };
  const contexto = {
    panel,
    document: { getElementById(id) { return id === "estadoNavegacionBiblioteca" ? estado : null; } },
    queueMicrotask(callback) { callback(); }
  };
  vm.createContext(contexto);
  vm.runInContext(`
    ${extraerBloque("function enfocarYAnunciarNavegacionDiagnosticos", "\nfunction conectarNavegacionDiagnosticos")}
    enfocarYAnunciarNavegacionDiagnosticos(panel);
  `, contexto);
  assert.equal(encabezado.focusCount, 1);
  assert.equal(estado.textContent, "Selecciona una letra");
  assert.match(html, /id="estadoNavegacionBiblioteca"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.ok((javascript.match(/<h2 tabindex="-1" data-foco-navegacion>/g) || []).length >= 3);
});

test("cada pestaña conserva su búsqueda sin contaminar las demás", () => {
  assert.match(javascript, /const busquedasPorTab = \{ diagnosticos: "", vademecum: "", citocromos: "" \}/);
  assert.match(javascript, /busquedasPorTab\[tabActual\] = e\.target\.value/);
  assert.match(javascript, /buscadorBiblioteca\.value = busquedasPorTab\[tabActual\] \|\| ""/);
});
