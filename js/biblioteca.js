import { auth } from "./firebase.js";
import { obtenerUsuario } from "./services/usuarios.js";
import { MEDICAMENTOS_MAESTROS, textoMedicamentoParaBusqueda } from "./data/medicamentos.js";
import { GRUPOS_CIE10_BIBLIOTECA } from "./data/vinculosClinicos.js";
import { obtenerGrupoCie10 } from "./data/vinculosClinicos.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { ROL_ENFERMERIA_SALUD_MENTAL } from "./utils/roles.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let tabActual = "diagnosticos";
let filtro = "";
let grupoCie10Actual = "todos";
let categoriaActual = "todas";
const CLAVE_SISTEMAS_VISIBLES = "biblioteca-sistemas-visibles";
const SYSTEM_ORDER = ["cie10", "cie11", "dsm5"];
const SISTEMA_LABEL = { cie10: "CIE-10", cie11: "CIE-11", dsm5: "DSM-5-TR" };
let sistemasVisibles = cargarPreferencia(CLAVE_SISTEMAS_VISIBLES, { cie10: true, cie11: true, dsm5: true });
let DIAGNOSTICOS_VALIDOS = [];
let PSICOEDUCACION = [];
let diagnosticosPorId = new Map();
let contenidoCie10CapituloABPromise = null;
try {
  localStorage.removeItem("biblioteca-sistemas-orden");
} catch (error) {
  console.warn("No se pudo retirar la preferencia antigua de orden de sistemas:", error);
}
const ADMIN_UID = "NQ0CU5PSDBUgVrk56sjPEVhOs2D3";
const ROLES_ADMIN_VALIDOS = new Set([
  "admin",
  "administrador",
  "superadmin",
  "adminprincipal",
  "administradorprincipal"
]);
const ROLES_BIBLIOTECA_VALIDOS = new Set([
  "medico",
  "médico",
  ROL_ENFERMERIA_SALUD_MENTAL,
  "enfermeriasaludmental",
  "psicologo",
  "psicólogo",
  ...ROLES_ADMIN_VALIDOS
]);
const CLAVE_CATALOGO_MANUAL = "cognicion_catalogo_diagnosticos_manual";

function cargarPreferencia(clave, respaldo) {
  try {
    const valor = JSON.parse(localStorage.getItem(clave) || "null");
    return valor && typeof valor === "object" ? { ...respaldo, ...valor } : { ...respaldo };
  } catch (error) {
    console.warn(`No se pudo cargar la preferencia ${clave}:`, error);
    return { ...respaldo };
  }
}

async function cargarContenidoCie10CapituloAB() {
  if (!contenidoCie10CapituloABPromise) {
    contenidoCie10CapituloABPromise = import("./data/catalogoCie10CapituloABContenido.js")
      .then((modulo) => modulo.CONTENIDO_CIE10_CAPITULO_AB || {});
  }
  return contenidoCie10CapituloABPromise;
}

function guardarPreferenciaSistemas() {
  localStorage.setItem(CLAVE_SISTEMAS_VISIBLES, JSON.stringify(sistemasVisibles));
}

function normalizarNombreDiagnostico(texto = "") {
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\-_/]+/g, " ")
    .replace(/\s+/g, " ");
}

function escaparHTML(valor = "") {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function validarDiagnosticosBiblioteca(diagnosticos = []) {
  const ids = new Set();
  const validos = [];
  diagnosticos.forEach((diagnostico) => {
    const errores = [];
    if (!diagnostico?.id || ids.has(diagnostico.id)) errores.push("id duplicado o vacío");
    if (!diagnostico?.nombre) errores.push("nombre vacío");
    if (!diagnostico?.sistemas || typeof diagnostico.sistemas !== "object") errores.push("sistemas ausentes");
    const codigos = new Set();
    const idsGrupos = new Set();
    const validarGrupo = (grupo, ruta) => {
      if (!grupo?.id || idsGrupos.has(grupo.id)) errores.push(`grupo sin id o duplicado: ${ruta}`);
      if (!grupo?.titulo) errores.push(`grupo sin título: ${ruta}`);
      idsGrupos.add(grupo?.id);
      const numeros = new Set();
      (grupo?.items || []).forEach((item) => {
        if (item.numero !== null && item.numero !== undefined) {
          if (numeros.has(item.numero)) errores.push(`numeración repetida: ${ruta}:${item.numero}`);
          numeros.add(item.numero);
          if (/^(?:\(?\d+\)?[.)]|\d+\s[-–])\s*/.test(String(item.texto || ""))) errores.push(`numeración duplicada en texto: ${ruta}:${item.numero}`);
        }
        if (!String(item.texto || "").trim()) errores.push(`ítem sin texto: ${ruta}`);
      });
      (grupo?.grupos || []).forEach((subgrupo) => validarGrupo(subgrupo, `${ruta}/${subgrupo.id || "sin-id"}`));
    };
    Object.entries(diagnostico?.sistemas || {}).forEach(([sistema, datos]) => {
      if (!SYSTEM_ORDER.includes(sistema)) errores.push(`sistema desconocido: ${sistema}`);
      if (datos?.codigo && codigos.has(`${sistema}:${datos.codigo}`)) errores.push(`código duplicado: ${datos.codigo}`);
      if (datos?.codigo) codigos.add(`${sistema}:${datos.codigo}`);
      if (!Array.isArray(datos?.criterios)) errores.push(`criterios inválidos en ${sistema}`);
      (datos?.criterios || []).forEach((grupo) => validarGrupo(grupo, `${sistema}/${grupo?.id || "sin-id"}`));
    });
    if (errores.length) {
      console.error("Registro omitido de Biblioteca clínica:", diagnostico?.id || diagnostico?.nombre, errores);
      return;
    }
    ids.add(diagnostico.id);
    validos.push(diagnostico);
  });
  return validos;
}

function cargarCatalogoManualDiagnosticos() {
  try {
    const guardado = localStorage.getItem(CLAVE_CATALOGO_MANUAL);
    const datos = guardado ? JSON.parse(guardado) : [];
    return Array.isArray(datos)
      ? datos.filter((dx) => dx && typeof dx === "object" && String(dx.nombre || "").trim())
      : [];
  } catch (error) {
    console.warn("No se pudo cargar el catalogo manual de diagnosticos:", error);
    return [];
  }
}

function normalizarRolBiblioteca(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function arregloTieneRolBiblioteca(valores) {
  if (!Array.isArray(valores)) return false;
  return valores.some((valor) => ROLES_BIBLIOTECA_VALIDOS.has(normalizarRolBiblioteca(valor)));
}

function objetoTieneRolBiblioteca(valores = {}) {
  if (!valores || typeof valores !== "object") return false;
  return Object.entries(valores).some(([clave, valor]) => {
    if (valor !== true) return false;
    return ROLES_BIBLIOTECA_VALIDOS.has(normalizarRolBiblioteca(clave));
  });
}

function usuarioPuedeUsarBiblioteca(user, usuario = {}) {
  if (user?.uid === ADMIN_UID) return true;

  const rolPrincipal = normalizarRolBiblioteca(usuario.rol || usuario.role || usuario.tipoUsuario || usuario.tipo);
  if (ROLES_BIBLIOTECA_VALIDOS.has(rolPrincipal)) return true;

  return (
    usuario.admin === true ||
    usuario.esAdmin === true ||
    usuario.isAdmin === true ||
    usuario.permisos?.admin === true ||
    usuario.claims?.admin === true ||
    objetoTieneRolBiblioteca(usuario.roles) ||
    objetoTieneRolBiblioteca(usuario.permisos) ||
    arregloTieneRolBiblioteca(usuario.roles) ||
    arregloTieneRolBiblioteca(usuario.permisosSistema) ||
    arregloTieneRolBiblioteca(usuario.permisos)
  );
}

const libraryRoot = document.querySelector("[data-library-root]");
const datosBibliotecaListos = libraryRoot
  ? Promise.all([
    import("./data/diagnosticosBiblioteca.js"),
    import("./data/bibliotecaClinica.js")
  ]).then(([diagnosticosModule, clinicaModule]) => {
    DIAGNOSTICOS_VALIDOS = validarDiagnosticosBiblioteca(diagnosticosModule.DIAGNOSTICOS_BIBLIOTECA);
    PSICOEDUCACION = clinicaModule.PSICOEDUCACION || [];
    diagnosticosPorId = new Map(DIAGNOSTICOS_VALIDOS.map((diagnostico) => [diagnostico.id, diagnostico]));
    poblarCategoriasBiblioteca();
  })
  : Promise.resolve();

iniciarMonitoreoSesion("Biblioteca clínica");

onAuthStateChanged(auth, async (user) => {
  await datosBibliotecaListos;
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const usuario = await obtenerUsuario(user.uid);
  if (!usuario || !usuarioPuedeUsarBiblioteca(user, usuario)) {
    alert("Biblioteca disponible para personal clínico y administración.");
    window.location.href = "dashboard.html";
    return;
  }

  document.body.classList.remove("bloqueado");
  render();
});

document.getElementById("buscadorBiblioteca").addEventListener("input", (e) => {
  filtro = normalizarNombreDiagnostico(e.target.value);
  render();
});

const selectorGrupoCie10 = document.getElementById("grupoCie10Biblioteca");
if (selectorGrupoCie10) {
  selectorGrupoCie10.innerHTML = GRUPOS_CIE10_BIBLIOTECA.map((grupo) =>
    `<option value="${grupo.id}">${grupo.etiqueta}</option>`
  ).join("");
  selectorGrupoCie10.addEventListener("change", (e) => {
    grupoCie10Actual = e.target.value || "todos";
    render();
  });
}

const selectorCategoria = document.getElementById("categoriaBiblioteca");
function poblarCategoriasBiblioteca() {
  if (!selectorCategoria) return;
  const categorias = [...new Set(DIAGNOSTICOS_VALIDOS.map((diagnostico) => diagnostico.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  selectorCategoria.innerHTML = `<option value="todas">Mostrar: todas las categorías</option>${categorias.map((categoria) => `<option value="${escaparHTML(categoria)}">${escaparHTML(categoria)}</option>`).join("")}`;
}
if (selectorCategoria) selectorCategoria.addEventListener("change", (e) => {
  categoriaActual = e.target.value || "todas";
  render();
});

function renderizarControlesSistemas() {
  const contenedor = document.getElementById("sistemasDiagnosticosBiblioteca");
  if (!contenedor) return;
  contenedor.innerHTML = SYSTEM_ORDER.map((sistema) => `
    <label class="sistema-toggle">
      <input type="checkbox" data-sistema-visible="${sistema}" ${sistemasVisibles[sistema] ? "checked" : ""}>
      <span>${SISTEMA_LABEL[sistema]}</span>
    </label>
  `).join("");
  contenedor.querySelectorAll("[data-sistema-visible]").forEach((control) => control.addEventListener("change", () => {
    sistemasVisibles[control.dataset.sistemaVisible] = control.checked;
    guardarPreferenciaSistemas();
    render();
  }));
}

renderizarControlesSistemas();

document.querySelectorAll("[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    tabActual = btn.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("activo", b === btn));
    render();
  });
});

function coincide(texto) {
  return !filtro || normalizarNombreDiagnostico(texto).includes(filtro);
}

function coincideGrupoCie10(codigo = "") {
  if (grupoCie10Actual === "todos") return true;
  return obtenerGrupoCie10(codigo).id === grupoCie10Actual;
}

function coincideGrupoCie10Diagnostico(diagnostico) {
  if (grupoCie10Actual === "todos") return true;
  const codigos = [diagnostico?.sistemas?.cie10?.codigo].filter(Boolean);
  return codigos.some((codigo) => coincideGrupoCie10(codigo));
}

function listaResumen(titulo, items = [], limite = 6) {
  const valores = (items || []).filter(Boolean).slice(0, limite);
  if (!valores.length) return "";
  return `
    <div class="dato-clinico">
      <strong>${titulo}</strong>
      <ul>${valores.map((item) => `<li>${item}</li>`).join("")}</ul>
    </div>
  `;
}

function convertirDiagnosticosManuales() {
  return cargarCatalogoManualDiagnosticos().map((diagnostico, index) => ({
    id: diagnostico.id || `manual-${index}-${normalizarNombreDiagnostico(diagnostico.nombre).replace(/ /g, "-")}`,
    nombre: diagnostico.nombre,
    categoria: diagnostico.categoria || "Otros",
    subcategoria: diagnostico.subcategoria || "Catálogo manual",
    aliases: diagnostico.aliases || [],
    sistemas: diagnostico.codigo ? { cie10: { visible: true, orden: 1, codigo: diagnostico.codigo, nombre: diagnostico.nombre, criterios: [], especificadores: [], notas: [] } } : {},
    psicoeducacion: diagnostico.psicoeducacion || "",
    diagnosticoDiferencial: diagnostico.diagnosticoDiferencial || [],
    comorbilidades: diagnostico.comorbilidades || [],
    evaluacionClinica: diagnostico.evaluacionClinica || [],
    referencias: diagnostico.referencias || []
  }));
}

function textoBusquedaDiagnostico(diagnostico) {
  const sistemas = Object.values(diagnostico.sistemas || {});
  const textosGrupo = (grupo) => [
    grupo.titulo,
    grupo.introduccion,
    grupo.texto,
    ...(grupo.items || []).map((item) => item.texto),
    ...(grupo.grupos || []).flatMap(textosGrupo)
  ];
  return [
    diagnostico.nombre,
    diagnostico.descripcionBreve,
    diagnostico.categoria,
    diagnostico.subcategoria,
    ...(diagnostico.aliases || []),
    diagnostico.psicoeducacion,
    ...(diagnostico.diagnosticoDiferencial || []),
    ...(diagnostico.comorbilidades || []),
    ...(diagnostico.evaluacionClinica || []),
    ...sistemas.flatMap((sistema) => [
      sistema.codigo,
      sistema.codigoCie10Cm,
      sistema.nombre,
      ...(sistema.criterios || []).flatMap(textosGrupo),
      ...(sistema.especificadores || []),
      ...(sistema.notas || []),
      ...(sistema.subtipos || []).flatMap((subtipo) => [
        subtipo.codigo,
        subtipo.nombre,
        ...(subtipo.criterios || []).flatMap(textosGrupo),
        ...(subtipo.especificadores || []),
        ...(subtipo.notas || [])
      ])
    ])
  ].filter(Boolean).join(" ");
}

function renderizarGrupoCriterios(grupo) {
  const items = grupo.items || [];
  const subgrupos = grupo.grupos || [];
  const listType = grupo.listType || "none";
  const lista = items.length
    ? (listType === "decimal"
      ? `<ol>${items.map((item) => `<li${Number.isInteger(item.numero) ? ` value="${item.numero}"` : ""}>${escaparHTML(item.texto)}</li>`).join("")}</ol>`
      : listType === "lower-alpha" || listType === "upper-alpha"
        ? `<ul class="criterios-lista-marcada">${items.map((item) => `<li>${item.marcador ? `<span class="criterio-marcador">${escaparHTML(item.marcador)}.</span>` : ""}${escaparHTML(item.texto)}</li>`).join("")}</ul>`
        : `<ul>${items.map((item) => `<li>${escaparHTML(item.texto)}</li>`).join("")}</ul>`)
    : "";
  return `<details class="grupo-criterios" data-grupo-criterios="${escaparHTML(grupo.id || "grupo")}">
    <summary>${escaparHTML(grupo.titulo || "Criterios")}</summary>
    ${grupo.introduccion ? `<p class="grupo-criterios__intro">${escaparHTML(grupo.introduccion)}</p>` : ""}
    ${lista}
    ${subgrupos.length ? `<div class="criteria-subgroups">${subgrupos.map(renderizarGrupoCriteriosSubgrupo).join("")}</div>` : ""}
  </details>`;
}

function renderizarGrupoCriteriosSubgrupo(grupo) {
  const items = grupo.items || [];
  const listType = grupo.listType || "none";
  const lista = items.length
    ? (listType === "decimal"
      ? `<ol>${items.map((item) => `<li${Number.isInteger(item.numero) ? ` value="${item.numero}"` : ""}>${escaparHTML(item.texto)}</li>`).join("")}</ol>`
      : `<ul>${items.map((item) => `<li>${item.marcador ? `<span class="criterio-marcador">${escaparHTML(item.marcador)}.</span>` : ""}${escaparHTML(item.texto)}</li>`).join("")}</ul>`)
    : "";
  return `<details class="criteria-subgroup"><summary>${escaparHTML(grupo.titulo || "Subgrupo")}</summary>${grupo.introduccion ? `<p>${escaparHTML(grupo.introduccion)}</p>` : ""}${lista}${grupo.grupos?.length ? grupo.grupos.map(renderizarGrupoCriteriosSubgrupo).join("") : ""}</details>`;
}

function renderizarCriterios(sistema) {
  if (!sistema?.criterios?.length) return `<p class="criterios-vacios">No hay criterios estructurados en esta edición del catálogo.</p>`;
  return sistema.criterios.map(renderizarGrupoCriterios).join("");
}

function renderizarSubtiposClasificacion(sistema) {
  if (!sistema?.subtipos?.length) return "";
  return `<section class="clasificacion-subtipos"><h5>Subcategorías y presentaciones</h5>${sistema.subtipos.map((subtipo) => `
    <article class="clasificacion-subtipo">
      <h6><span class="codigo-diagnostico">${escaparHTML(subtipo.codigo)}</span> ${escaparHTML(subtipo.nombre)}</h6>
      ${subtipo.criterios?.length ? renderizarCriterios({ criterios: subtipo.criterios }) : `<p class="criterios-vacios">No hay criterios estructurados para esta categoría.</p>`}
    </article>`).join("")}</section>`;
}

function renderizarMetadatosSistema(sistema) {
  const especificadores = Array.isArray(sistema?.especificadores) ? sistema.especificadores : [];
  const notas = Array.isArray(sistema?.notas) ? sistema.notas : [];
  if (!especificadores.length && !notas.length) return "";
  const lista = (items) => `<ul>${items.map((item) => `<li>${escaparHTML(item)}</li>`).join("")}</ul>`;
  return `<section class="sistema-metadatos">
    ${especificadores.length ? `<details class="sistema-metadatos__grupo"><summary>Especificadores y calificadores</summary>${lista(especificadores)}</details>` : ""}
    ${notas.length ? `<details class="sistema-metadatos__grupo"><summary>Notas de codificación y fuente</summary>${lista(notas)}</details>` : ""}
  </section>`;
}

function renderizarSistemaAcordeon(diagnostico, sistema) {
  const datos = diagnostico.sistemas?.[sistema];
  if (!datos || !sistemasVisibles[sistema]) return "";
  const codigo = [datos.codigo, datos.codigoCie10Cm].filter(Boolean).join(" / ");
  const panelId = `${diagnostico.id}-${sistema}-criterios`.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `
    <section class="sistema-diagnostico" data-sistema="${sistema}">
      <button type="button" class="sistema-toggle-button" data-sistema-toggle="${sistema}" aria-expanded="false" aria-controls="${panelId}">
        <span aria-hidden="true">▶</span> ${SISTEMA_LABEL[sistema]} <span class="codigo-diagnostico">${escaparHTML(codigo)}</span>
      </button>
      <div id="${panelId}" class="sistema-diagnostico__panel" data-sistema-panel="${sistema}" hidden></div>
    </section>`;
}

async function renderizarDetallesDiagnostico(diagnostico, detalles) {
  const contenidoId = diagnostico.sistemas?.cie10?.contenidoId;
  if (contenidoId && !diagnostico.sistemas.cie10.criterios?.length) {
    detalles.innerHTML = '<p class="criterios-vacios">Cargando contenido clínico…</p>';
    const contenido = await cargarContenidoCie10CapituloAB();
    diagnostico.sistemas.cie10.criterios = contenido[contenidoId] || [];
  }
  const sistemas = SYSTEM_ORDER.map((sistema) => renderizarSistemaAcordeon(diagnostico, sistema)).join("");
  const psico = diagnostico.psicoeducacion ? `<section class="contenido-diagnostico"><h4>Psicoeducación</h4><p>${escaparHTML(diagnostico.psicoeducacion)}</p></section>` : "";
  const diferencial = diagnostico.diagnosticoDiferencial?.length ? listaResumen("Diagnóstico diferencial", diagnostico.diagnosticoDiferencial) : "";
  detalles.innerHTML = `${sistemas || `<p class="criterios-vacios">Activa al menos un sistema diagnóstico para visualizar sus códigos y criterios.</p>`}${psico}${diferencial}<p class="aviso-clinico-biblioteca">Los criterios son una herramienta de apoyo y deben integrarse con la entrevista clínica, antecedentes, exploración mental, evolución y juicio profesional.</p>`;
  detalles.dataset.rendered = "true";
  detalles.querySelectorAll("[data-sistema-toggle]").forEach((boton) => boton.addEventListener("click", () => {
    const sistema = boton.dataset.sistemaToggle;
    const panel = detalles.querySelector(`[data-sistema-panel="${sistema}"]`);
    const abierto = boton.getAttribute("aria-expanded") === "true";
    boton.setAttribute("aria-expanded", String(!abierto));
    boton.querySelector("span").textContent = abierto ? "▶" : "▼";
    panel.hidden = abierto;
    if (!abierto && !panel.dataset.rendered) {
          const datosSistema = diagnostico.sistemas[sistema];
          panel.innerHTML = `${renderizarSubtiposClasificacion(datosSistema)}${renderizarMetadatosSistema(datosSistema)}${datosSistema.criterios?.length ? renderizarCriterios(datosSistema) : ""}`;
      panel.dataset.rendered = "true";
    }
  }));
}

function renderizarDiagnostico(diagnostico) {
  const codigos = SYSTEM_ORDER.filter((sistema) => sistemasVisibles[sistema] && diagnostico.sistemas?.[sistema]).map((sistema) => `${SISTEMA_LABEL[sistema]} · ${diagnostico.sistemas[sistema].codigo}`).join(" · ");
  const panelId = `${diagnostico.id}-detalle`.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `<article class="diagnostico-row" data-diagnostico-id="${escaparHTML(diagnostico.id)}">
    <header class="diagnostico-row__summary">
      <div class="diagnostico-row__main">
        <h3>${escaparHTML(diagnostico.nombre)}</h3>
        <p>${escaparHTML(diagnostico.descripcionBreve || "Descripción clínica no disponible.")}</p>
        <span class="tag diagnostico-row__category">${escaparHTML(diagnostico.categoria || "Sin categoría")}</span>
      </div>
      <div class="diagnostico-row__codes">${codigos ? escaparHTML(codigos) : "Sin sistemas visibles"}</div>
      <button type="button" class="diagnostico-row__toggle" data-diagnostico-toggle aria-expanded="false" aria-controls="${panelId}">Ver criterios</button>
    </header>
    <section id="${panelId}" class="diagnostico-row__details" data-diagnostico-details hidden></section>
  </article>`;
}

function conectarAcordeonesDiagnosticos(panel) {
  panel.querySelectorAll("[data-diagnostico-toggle]").forEach((boton) => boton.addEventListener("click", () => {
    const fila = boton.closest("[data-diagnostico-id]");
    const detalles = fila.querySelector("[data-diagnostico-details]");
    const diagnostico = diagnosticosPorId.get(fila.dataset.diagnosticoId) || convertirDiagnosticosManuales().find((item) => item.id === fila.dataset.diagnosticoId);
    const abierto = boton.getAttribute("aria-expanded") === "true";
    boton.setAttribute("aria-expanded", String(!abierto));
    boton.textContent = abierto ? "Ver criterios" : "Ocultar criterios";
    detalles.hidden = abierto;
    if (!abierto && !detalles.dataset.rendered && diagnostico) renderizarDetallesDiagnostico(diagnostico, detalles);
  }));
}

function render() {
  const panel = document.getElementById("panelBiblioteca");
  panel.className = tabActual === "diagnosticos" ? "diagnosticos-lista" : "grid";
  if (tabActual === "vademecum") {
    panel.innerHTML = MEDICAMENTOS_MAESTROS
      .filter((m) => coincide(textoMedicamentoParaBusqueda(m)))
      .map((m) => `
        <article class="card">
          <h3>${m.nombre}</h3>
          <span class="tag">${m.clase}</span>
          <p><strong>Dosis habitual:</strong> ${m.dosisHabitual}</p>
          ${m.brandNames?.length ? `<p><strong>Marcas comerciales:</strong> ${m.brandNames.slice(0, 8).join(", ")}</p>` : ""}
          <p><strong>Presentaciones:</strong> ${(m.presentaciones || []).slice(0, 4).map((p) => p.texto).join("; ") || "Sin presentaciones cargadas"}</p>
          ${m.especialidades?.length ? `<p><strong>Áreas:</strong> ${m.especialidades.join(", ")}</p>` : ""}
          ${m.mecanismoAccion ? `<p><strong>Mecanismo de acción:</strong> ${m.mecanismoAccion}</p>` : ""}
          ${m.vidaMedia ? `<p><strong>Vida media:</strong> ${m.vidaMedia}</p>` : ""}
          ${listaResumen("Indicaciones", m.indicaciones || m.indications)}
          ${listaResumen("Contraindicaciones", m.contraindicaciones || m.contraindications)}
          ${listaResumen("Tener precaución en", m.precauciones || m.precautions)}
          ${listaResumen("Efectos adversos frecuentes o relevantes", m.efectosAdversos)}
          ${m.monitoring?.length ? `<p><strong>Monitoreo:</strong> ${m.monitoring.slice(0, 4).join(", ")}</p>` : ""}
          <p>${m.notas}</p>
          <p class="muted">Contenido de apoyo clínico. Validar contra ficha técnica, protocolos locales y juicio profesional.</p>
        </article>
      `).join("");
    return;
  }

  if (tabActual === "psicoeducacion") {
    panel.innerHTML = PSICOEDUCACION
      .filter((p) => coincide(`${p.titulo} ${p.tema} ${p.texto}`))
      .map((p) => `
        <article class="card">
          <h3>${p.titulo}</h3>
          <span class="tag">${p.tema}</span>
          <p>${p.texto}</p>
        </article>
      `).join("");
    return;
  }

  const catalogo = [...DIAGNOSTICOS_VALIDOS, ...convertirDiagnosticosManuales()];
  const filtradas = catalogo
    .filter((diagnostico) => diagnostico.categoria === categoriaActual || categoriaActual === "todas")
    .filter(coincideGrupoCie10Diagnostico)
    .filter((diagnostico) => coincide(textoBusquedaDiagnostico(diagnostico)));

  panel.innerHTML = filtradas.map(renderizarDiagnostico).join("") || "<p>No hay resultados.</p>";
  if (filtradas.length) conectarAcordeonesDiagnosticos(panel);
}
