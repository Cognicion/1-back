import { auth } from "./firebase.js";
import { obtenerUsuario } from "./services/usuarios.js";
import { MEDICAMENTOS_MAESTROS, textoMedicamentoParaBusqueda } from "./data/medicamentos.js";
import { DIAGNOSTICOS_BIBLIOTECA, SISTEMAS_DIAGNOSTICOS } from "./data/diagnosticosBiblioteca.js";
import { PSICOEDUCACION } from "./data/bibliotecaClinica.js";
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
const CLAVE_ORDEN_SISTEMAS = "biblioteca-sistemas-orden";
const SISTEMA_LABEL = { cie10: "CIE-10", cie11: "CIE-11", dsm5: "DSM-5" };
const SISTEMAS_POR_DEFECTO = { cie10: true, cie11: true, dsm5: true };
let sistemasVisibles = cargarPreferencia(CLAVE_SISTEMAS_VISIBLES, SISTEMAS_POR_DEFECTO);
let ordenSistemas = cargarOrdenSistemas();
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

function cargarOrdenSistemas() {
  try {
    const valor = JSON.parse(localStorage.getItem(CLAVE_ORDEN_SISTEMAS) || "null");
    const valido = Array.isArray(valor) && valor.length === SISTEMAS_DIAGNOSTICOS.length
      && new Set(valor).size === SISTEMAS_DIAGNOSTICOS.length
      && valor.every((sistema) => SISTEMAS_DIAGNOSTICOS.includes(sistema));
    return valido ? valor : [...SISTEMAS_DIAGNOSTICOS];
  } catch (error) {
    console.warn("No se pudo cargar el orden de sistemas diagnósticos:", error);
    return [...SISTEMAS_DIAGNOSTICOS];
  }
}

function guardarPreferenciasSistemas() {
  localStorage.setItem(CLAVE_SISTEMAS_VISIBLES, JSON.stringify(sistemasVisibles));
  localStorage.setItem(CLAVE_ORDEN_SISTEMAS, JSON.stringify(ordenSistemas));
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
    Object.entries(diagnostico?.sistemas || {}).forEach(([sistema, datos]) => {
      if (!SISTEMAS_DIAGNOSTICOS.includes(sistema)) errores.push(`sistema desconocido: ${sistema}`);
      if (datos?.codigo && codigos.has(`${sistema}:${datos.codigo}`)) errores.push(`código duplicado: ${datos.codigo}`);
      if (datos?.codigo) codigos.add(`${sistema}:${datos.codigo}`);
      if (!Array.isArray(datos?.criterios)) errores.push(`criterios inválidos en ${sistema}`);
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

const DIAGNOSTICOS_VALIDOS = validarDiagnosticosBiblioteca(DIAGNOSTICOS_BIBLIOTECA);

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
iniciarMonitoreoSesion("Biblioteca clínica");

onAuthStateChanged(auth, async (user) => {
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
if (selectorCategoria) {
  const categorias = [...new Set(DIAGNOSTICOS_VALIDOS.map((diagnostico) => diagnostico.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  selectorCategoria.innerHTML = `<option value="todas">Mostrar: todas las categorías</option>${categorias.map((categoria) => `<option value="${escaparHTML(categoria)}">${escaparHTML(categoria)}</option>`).join("")}`;
  selectorCategoria.addEventListener("change", (e) => {
    categoriaActual = e.target.value || "todas";
    render();
  });
}

function renderizarControlesSistemas() {
  const contenedor = document.getElementById("sistemasDiagnosticosBiblioteca");
  if (!contenedor) return;
  contenedor.innerHTML = ordenSistemas.map((sistema, index) => `
    <label class="sistema-toggle">
      <input type="checkbox" data-sistema-visible="${sistema}" ${sistemasVisibles[sistema] ? "checked" : ""}>
      <span>${SISTEMA_LABEL[sistema]}</span>
    </label>
    <span class="sistema-orden" aria-label="Orden de ${SISTEMA_LABEL[sistema]}">
      <button type="button" data-sistema-mover="${sistema}" data-direccion="arriba" ${index === 0 ? "disabled" : ""} aria-label="Subir ${SISTEMA_LABEL[sistema]}">↑</button>
      <button type="button" data-sistema-mover="${sistema}" data-direccion="abajo" ${index === ordenSistemas.length - 1 ? "disabled" : ""} aria-label="Bajar ${SISTEMA_LABEL[sistema]}">↓</button>
    </span>
  `).join("");
  contenedor.querySelectorAll("[data-sistema-visible]").forEach((control) => control.addEventListener("change", () => {
    sistemasVisibles[control.dataset.sistemaVisible] = control.checked;
    guardarPreferenciasSistemas();
    render();
  }));
  contenedor.querySelectorAll("[data-sistema-mover]").forEach((control) => control.addEventListener("click", () => {
    const indice = ordenSistemas.indexOf(control.dataset.sistemaMover);
    const desplazamiento = control.dataset.direccion === "arriba" ? -1 : 1;
    const destino = indice + desplazamiento;
    if (indice < 0 || destino < 0 || destino >= ordenSistemas.length) return;
    [ordenSistemas[indice], ordenSistemas[destino]] = [ordenSistemas[destino], ordenSistemas[indice]];
    guardarPreferenciasSistemas();
    renderizarControlesSistemas();
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
  return [
    diagnostico.nombre,
    diagnostico.categoria,
    diagnostico.subcategoria,
    ...(diagnostico.aliases || []),
    diagnostico.psicoeducacion,
    ...(diagnostico.diagnosticoDiferencial || []),
    ...(diagnostico.comorbilidades || []),
    ...(diagnostico.evaluacionClinica || []),
    ...sistemas.flatMap((sistema) => [sistema.codigo, sistema.codigoCie10Cm, sistema.nombre, ...(sistema.criterios || []).map((criterio) => criterio.texto)])
  ].filter(Boolean).join(" ");
}

function renderizarCriterios(sistema) {
  if (!sistema?.criterios?.length) return `<p class="criterios-vacios">Criterios específicos no cargados aún. Consultar la fuente oficial correspondiente.</p>`;
  return `<ul class="criterios-diagnostico">${sistema.criterios.map((criterio) => `<li><strong>${escaparHTML(criterio.titulo || `Criterio ${criterio.orden || ""}`)}</strong><span>${escaparHTML(criterio.texto)}</span></li>`).join("")}</ul>`;
}

function renderizarSistema(diagnostico, sistema) {
  const datos = diagnostico.sistemas?.[sistema];
  if (!datos || !sistemasVisibles[sistema]) return "";
  const codigo = [datos.codigo, datos.codigoCie10Cm].filter(Boolean).join(" / ");
  return `
    <section class="sistema-diagnostico" data-sistema="${sistema}">
      <h4>${SISTEMA_LABEL[sistema]} <span class="codigo-diagnostico">${escaparHTML(codigo)}</span></h4>
      ${datos.equivalencia ? `<small class="nota-equivalencia">Equivalencia ${escaparHTML(datos.equivalencia)}.</small>` : ""}
      ${renderizarCriterios(datos)}
    </section>`;
}

function renderizarDiagnostico(diagnostico) {
  const sistemas = ordenSistemas.map((sistema) => renderizarSistema(diagnostico, sistema)).join("");
  const psico = diagnostico.psicoeducacion ? `<section class="contenido-diagnostico"><h4>Psicoeducación</h4><p>${escaparHTML(diagnostico.psicoeducacion)}</p></section>` : "";
  const diferencial = diagnostico.diagnosticoDiferencial?.length ? listaResumen("Diagnóstico diferencial", diagnostico.diagnosticoDiferencial) : "";
  const codigos = ordenSistemas.filter((sistema) => sistemasVisibles[sistema] && diagnostico.sistemas?.[sistema]).map((sistema) => `${SISTEMA_LABEL[sistema]}: ${diagnostico.sistemas[sistema].codigo}`).join(" · ");
  return `<article class="card diagnostico-unificado" data-diagnostico-id="${escaparHTML(diagnostico.id)}">
    <h3>${escaparHTML(diagnostico.nombre)}</h3>
    <span class="tag">${escaparHTML(diagnostico.categoria)}${codigos ? ` · ${escaparHTML(codigos)}` : ""}</span>
    <div class="sistemas-diagnostico">${sistemas || `<p class="criterios-vacios">Activa al menos un sistema diagnóstico para visualizar sus códigos y criterios.</p>`}</div>
    ${psico}${diferencial}
    <p class="aviso-clinico-biblioteca">Los criterios son una herramienta de apoyo y deben integrarse con la entrevista clínica, antecedentes, exploración mental, evolución y juicio profesional.</p>
  </article>`;
}

function render() {
  const panel = document.getElementById("panelBiblioteca");
  panel.className = `grid ${tabActual === "diagnosticos" ? "diagnosticos-grid" : ""}`;
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
}
