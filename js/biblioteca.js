import { auth } from "./firebase.js";
import { obtenerUsuario } from "./services/usuarios.js";
import { MEDICAMENTOS_MAESTROS, normalizarNombreMedicamento, textoMedicamentoParaBusqueda } from "./data/medicamentos.js";
import { CIE10 } from "./data/cie10.js";
import { CIE11 } from "./data/cie11.js";
import { CRITERIOS_DIAGNOSTICOS, PSICOEDUCACION } from "./data/bibliotecaClinica.js";
import { obtenerGrupoCie10 } from "./data/vinculosClinicos.js";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { ROL_ENFERMERIA_SALUD_MENTAL } from "./utils/roles.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let tabActual = "diagnosticos";
let filtro = "";
let grupoCie10Actual = "todos";
const CRITERIOS_BIBLIOTECA = [...CRITERIOS_DIAGNOSTICOS, ...CRITERIOS_DIAGNOSTICOS_EXTENDIDOS];
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
  filtro = normalizarNombreMedicamento(e.target.value);
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

document.querySelectorAll("[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    tabActual = btn.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("activo", b === btn));
    render();
  });
});

function coincide(texto) {
  return !filtro || normalizarNombreMedicamento(texto).includes(filtro);
}

function coincideGrupoCie10(codigo = "") {
  if (grupoCie10Actual === "todos") return true;
  return obtenerGrupoCie10(codigo).id === grupoCie10Actual;
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

  const catalogo = [
    ...CIE10.map((dx) => ({ ...dx, catalogo: "CIE-10" })),
    ...CIE11.map((dx) => ({ ...dx, catalogo: "CIE-11" }))
  ];

  const tarjetasCriterios = CRITERIOS_BIBLIOTECA
    .filter((dx) => coincideGrupoCie10(dx.codigo))
    .filter((dx) => coincide(`${dx.codigo} ${dx.nombre} ${dx.categoria} ${dx.criterios.join(" ")} ${(dx.farmacosContraindicados || []).join(" ")} ${(dx.farmacosPrecaucion || []).join(" ")}`))
    .map((dx) => `
      <article class="card">
        <h3>${dx.nombre}</h3>
        <span class="tag">${dx.codigo} · ${dx.categoria}</span>
        <ul>${dx.criterios.map((c) => `<li>${c}</li>`).join("")}</ul>
        <p><strong>Psicoeducación:</strong> ${dx.psicoeducacion}</p>
        ${listaResumen("Medicamentos contraindicados o a evitar", dx.farmacosContraindicados)}
        ${listaResumen("Medicamentos con precaución relativa", dx.farmacosPrecaucion)}
        ${dx.notaFarmacologica ? `<p><strong>Nota farmacológica:</strong> ${dx.notaFarmacologica}</p>` : ""}
      </article>
    `);

  const tarjetasCatalogo = catalogo
    .filter((dx) => dx.catalogo !== "CIE-10" || coincideGrupoCie10(dx.codigo))
    .filter((dx) => coincide(`${dx.codigo} ${dx.nombre} ${dx.catalogo}`))
    .slice(0, 80)
    .map((dx) => `
      <article class="card">
        <h3>${dx.nombre}</h3>
        <span class="tag">${dx.catalogo} · ${dx.codigo}</span>
        <p>Criterios especificos no cargados aun. Usar como referencia de catalogo y complementar con entrevista clinica.</p>
      </article>
    `);

  panel.innerHTML = [...tarjetasCriterios, ...tarjetasCatalogo].join("") || "<p>No hay resultados.</p>";
}

