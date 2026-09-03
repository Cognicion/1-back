import { auth } from "./firebase.js";
import { obtenerUsuario } from "./services/usuarios.js";
import { MEDICAMENTOS_MAESTROS, textoMedicamentoParaBusqueda } from "./data/catalogoFarmacologicoUnificado.js?v=20260822-fda-cofepris-v1";
import { CITOCROMOS_FARMACOLOGICOS } from "./data/citocromosFarmacologicos.js?v=20260811-pharmacology-files-consolidated-v1";
import { iniciarMonitoreoSesion } from "./services/sesion.js";
import { ROL_ENFERMERIA_SALUD_MENTAL } from "./utils/roles.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const modoBibliotecaPublica = new URLSearchParams(window.location.search).get("modo") === "publico";
let tabActual = "diagnosticos";
let filtro = "";
const busquedasPorTab = { diagnosticos: "", vademecum: "", citocromos: "" };
let categoriaActual = "todas";
let catalogoDiagnosticoActual = null;
let letraCie10Actual = null;
let grupoFarmacologicoActual = null;
const SYSTEM_ORDER = ["cie10", "cie11", "dsm5"];
const SISTEMA_LABEL = { cie10: "CIE-10", cie11: "CIE-11", dsm5: "DSM-5-TR" };
const CATALOGOS_DIAGNOSTICOS = [
  {
    id: "cie10",
    etiqueta: "CIE-10",
    descripcion: "Clasificación Internacional de Enfermedades. Se consulta por capítulo alfabético."
  },
  {
    id: "cie11",
    etiqueta: "CIE-11",
    descripcion: "Clasificación Internacional de Enfermedades, undécima revisión."
  },
  {
    id: "dsm5",
    etiqueta: "DSM-5-TR",
    descripcion: "Manual diagnóstico y estadístico de los trastornos mentales, texto revisado."
  }
];
const LETRAS_CIE10_BIBLIOTECA = [
  { letra: "A", rango: "A00-A99", titulo: "Ciertas enfermedades infecciosas y parasitarias" },
  { letra: "B", rango: "B00-B99", titulo: "Ciertas enfermedades infecciosas y parasitarias" },
  { letra: "C", rango: "C00-C97", titulo: "Tumores malignos" },
  { letra: "D", rango: "D00-D89", titulo: "Tumores in situ, benignos y de comportamiento incierto; enfermedades de la sangre y de la inmunidad" },
  { letra: "E", rango: "E00-E90", titulo: "Enfermedades endocrinas, nutricionales y metabólicas" },
  { letra: "F", rango: "F00-F99", titulo: "Trastornos mentales y del comportamiento" },
  { letra: "G", rango: "G00-G99", titulo: "Enfermedades del sistema nervioso" },
  { letra: "H", rango: "H00-H95", titulo: "Enfermedades del ojo y sus anexos, y del oído y de la apófisis mastoides" },
  { letra: "I", rango: "I00-I99", titulo: "Enfermedades del sistema circulatorio" },
  { letra: "J", rango: "J00-J99", titulo: "Enfermedades del sistema respiratorio" },
  { letra: "K", rango: "K00-K93", titulo: "Enfermedades del sistema digestivo" },
  { letra: "L", rango: "L00-L99", titulo: "Enfermedades de la piel y del tejido subcutáneo" },
  { letra: "M", rango: "M00-M99", titulo: "Enfermedades del sistema osteomuscular y del tejido conjuntivo" },
  { letra: "N", rango: "N00-N99", titulo: "Enfermedades del sistema genitourinario" },
  { letra: "O", rango: "O00-O99", titulo: "Embarazo, parto y puerperio" },
  { letra: "P", rango: "P00-P96", titulo: "Afecciones originadas en el período perinatal" },
  { letra: "Q", rango: "Q00-Q99", titulo: "Malformaciones congénitas, deformidades y anomalías cromosómicas" },
  { letra: "R", rango: "R00-R99", titulo: "Síntomas, signos y hallazgos anormales no clasificados en otra parte" },
  { letra: "S", rango: "S00-S99", titulo: "Traumatismos por región corporal" },
  { letra: "T", rango: "T00-T98", titulo: "Traumatismos múltiples, intoxicaciones y otras consecuencias de causas externas" },
  { letra: "U", rango: "U00-U99", titulo: "Códigos para propósitos especiales" },
  { letra: "V", rango: "V00-V99", titulo: "Accidentes de transporte" },
  { letra: "W", rango: "W00-W99", titulo: "Otras causas externas accidentales" },
  { letra: "X", rango: "X00-X99", titulo: "Otras causas externas, lesiones autoinfligidas y agresiones" },
  { letra: "Y", rango: "Y00-Y99", titulo: "Otros eventos externos, atención médica y secuelas" },
  { letra: "Z", rango: "Z00-Z99", titulo: "Factores que influyen en el estado de salud y contacto con los servicios de salud" }
];
const CAPITULOS_CIE10_CODIGOS_COMPLETOS = new Set(["A", "B", "C", "D", "E", "F", "G", "I"]);
const CAPITULOS_CIE10_FICHAS_COMPLETAS = new Set(["C", "D", "E"]);
let DIAGNOSTICOS_VALIDOS = [];
let diagnosticosPorId = new Map();
const TAMANO_LOTE_DIAGNOSTICOS = 120;
let diagnosticosFiltradosActuales = [];
let diagnosticosRenderizados = 0;
let observadorCargaDiagnosticos = null;
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
      const gruposValidados = new Set();
      const validarGrupo = (grupo, ruta) => {
        const claveGrupo = `${grupo?.id || ""}::${grupo?.titulo || ""}`;
        if (!grupo?.id || gruposValidados.has(claveGrupo)) errores.push(`grupo sin id o duplicado exacto: ${ruta}`);
        if (!grupo?.titulo) errores.push(`grupo sin título: ${ruta}`);
        gruposValidados.add(claveGrupo);
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
      if (!SYSTEM_ORDER.includes(sistema)) errores.push(`sistema desconocido: ${sistema}`);
      if (datos?.codigo && codigos.has(`${sistema}:${datos.codigo}`)) errores.push(`código duplicado: ${datos.codigo}`);
      if (datos?.codigo) codigos.add(`${sistema}:${datos.codigo}`);
      if (datos?.criteriosLazy) {
        const descriptor = Object.getOwnPropertyDescriptor(datos, "criterios");
        if (typeof descriptor?.get !== "function") errores.push(`carga diferida de criterios inválida en ${sistema}`);
      } else {
        if (!Array.isArray(datos?.criterios)) errores.push(`criterios inválidos en ${sistema}`);
        (datos?.criterios || []).forEach((grupo) => validarGrupo(grupo, `${sistema}/${grupo?.id || "sin-id"}`));
      }
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
    ? import("./data/catalogoDiagnosticos.js?v=20260902-biblioteca-cie10-i-v1").then((diagnosticosModule) => {
    DIAGNOSTICOS_VALIDOS = validarDiagnosticosBiblioteca(diagnosticosModule.CATALOGO_DIAGNOSTICOS);
    diagnosticosPorId = new Map(DIAGNOSTICOS_VALIDOS.map((diagnostico) => [diagnostico.id, diagnostico]));
    poblarCategoriasBiblioteca([]);
  })
  : Promise.resolve();

if (!modoBibliotecaPublica) iniciarMonitoreoSesion("Biblioteca clínica");

onAuthStateChanged(auth, async (user) => {
  await datosBibliotecaListos;
  if (modoBibliotecaPublica) {
    document.body.classList.add("modo-publico");
    document.body.classList.remove("bloqueado");
    document.getElementById("navegacionBibliotecaPrivada")?.setAttribute("hidden", "");
    document.getElementById("navegacionBibliotecaPublica")?.removeAttribute("hidden");
    render();
    return;
  }
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

const buscadorBiblioteca = document.getElementById("buscadorBiblioteca");
buscadorBiblioteca?.addEventListener("input", (e) => {
  busquedasPorTab[tabActual] = e.target.value;
  filtro = normalizarNombreDiagnostico(e.target.value);
  render();
});

const selectorCategoria = document.getElementById("categoriaBiblioteca");
function poblarCategoriasBiblioteca(diagnosticos = []) {
  if (!selectorCategoria) return;
  const categorias = [...new Set(diagnosticos.map((diagnostico) => diagnostico.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  if (categoriaActual !== "todas" && !categorias.includes(categoriaActual)) categoriaActual = "todas";
  selectorCategoria.innerHTML = `<option value="todas">Mostrar: todas las categorías</option>${categorias.map((categoria) => `<option value="${escaparHTML(categoria)}">${escaparHTML(categoria)}</option>`).join("")}`;
  selectorCategoria.value = categoriaActual;
}
if (selectorCategoria) selectorCategoria.addEventListener("change", (e) => {
  categoriaActual = e.target.value || "todas";
  render();
});

document.querySelectorAll("[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    tabActual = btn.dataset.tab;
    if (buscadorBiblioteca) buscadorBiblioteca.value = busquedasPorTab[tabActual] || "";
    filtro = normalizarNombreDiagnostico(busquedasPorTab[tabActual] || "");
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("activo", b === btn));
    render();
  });
});

function coincide(texto) {
  return !filtro || normalizarNombreDiagnostico(texto).includes(filtro);
}

const ETIQUETA_GRUPO_FARMACOLOGICO_PENDIENTE = "Grupo farmacológico pendiente";
const CLAVE_GRUPO_FARMACOLOGICO_PENDIENTE = "__grupo_farmacologico_pendiente__";
const ETIQUETAS_GRUPO_NO_CLASIFICADO = new Set([
  "",
  "medicamento",
  "sin categoria",
  "sin grupo",
  "no especificado"
]);

function etiquetaGrupoFarmacologico(medicamento = {}) {
  const etiquetas = [medicamento.grupoFarmacologico, medicamento.clase, medicamento.clasePrincipal]
    .map((valor) => String(valor || "").trim())
    .filter(Boolean);
  return etiquetas.find((etiqueta) => !ETIQUETAS_GRUPO_NO_CLASIFICADO.has(normalizarNombreDiagnostico(etiqueta)))
    || ETIQUETA_GRUPO_FARMACOLOGICO_PENDIENTE;
}

function claveGrupoFarmacologico(etiqueta = "") {
  return etiqueta === ETIQUETA_GRUPO_FARMACOLOGICO_PENDIENTE
    ? CLAVE_GRUPO_FARMACOLOGICO_PENDIENTE
    : normalizarNombreDiagnostico(etiqueta);
}

function preferirEtiquetaGrupo(actual = "", candidata = "") {
  const acentos = (valor) => (String(valor).match(/[áéíóúüñ]/gi) || []).length;
  return acentos(candidata) > acentos(actual) ? candidata : actual;
}

function obtenerGruposFarmacologicos() {
  const grupos = new Map();
  MEDICAMENTOS_MAESTROS.forEach((medicamento) => {
    const nombre = etiquetaGrupoFarmacologico(medicamento);
    const id = claveGrupoFarmacologico(nombre);
    if (!grupos.has(id)) grupos.set(id, { id, nombre, medicamentos: [] });
    const grupo = grupos.get(id);
    grupo.nombre = preferirEtiquetaGrupo(grupo.nombre, nombre);
    grupo.medicamentos.push(medicamento);
  });
  return [...grupos.values()]
    .map((grupo) => ({
      ...grupo,
      medicamentos: grupo.medicamentos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }))
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
}

function estadoCoberturaGrupoFarmacologico(grupo = {}) {
  const medicamentos = grupo.medicamentos || [];
  if (!medicamentos.length || grupo.id === CLAVE_GRUPO_FARMACOLOGICO_PENDIENTE) {
    return { texto: "Pendiente", clase: "pendiente", verificados: 0, parciales: 0, pendientes: medicamentos.length };
  }
  const verificados = medicamentos.filter((medicamento) => medicamento.estadoFuente === "verificada_local").length;
  const parciales = medicamentos.filter((medicamento) => medicamento.estadoFuente === "fuente_regulatoria_parcial").length;
  const pendientes = medicamentos.length - verificados - parciales;
  if (verificados === medicamentos.length) return { texto: "Fuentes verificadas", clase: "completa", verificados, parciales, pendientes };
  if (!pendientes && parciales) return { texto: "En revisión", clase: "revision", verificados, parciales, pendientes };
  if (verificados || parciales) return { texto: "Cobertura parcial", clase: "parcial", verificados, parciales, pendientes };
  return { texto: "Fuente pendiente", clase: "pendiente", verificados, parciales, pendientes };
}

function textoBusquedaGrupoFarmacologico(grupo = {}) {
  return [
    grupo.nombre,
    ...(grupo.medicamentos || []).map((medicamento) => textoMedicamentoParaBusqueda(medicamento))
  ].filter(Boolean).join(" ");
}

function listaResumen(titulo, items = [], limite = 6) {
  const valores = (items || []).filter(Boolean).slice(0, limite);
  if (!valores.length) return "";
  return `
    <div class="dato-clinico">
      <strong>${escaparHTML(titulo)}</strong>
      <ul>${valores.map((item) => `<li>${escaparHTML(item)}</li>`).join("")}</ul>
    </div>
  `;
}

const MEDICAMENTOS_BIBLIOTECA_POR_ID = new Map(MEDICAMENTOS_MAESTROS.map((medicamento) => [medicamento.id, medicamento]));
const ETIQUETA_ROL_CYP = {
  sustrato: "Metaboliza / sustratos",
  profarmaco: "Profármacos que requieren activación",
  inhibidor: "Inhibidores",
  inductor: "Inductores",
  relacion_farmacogenetica: "Relación farmacogenética"
};

function nombreMedicamentoCyp(relacion) {
  return MEDICAMENTOS_BIBLIOTECA_POR_ID.get(relacion.medicationId)?.nombre || relacion.medicationId;
}

function textoBusquedaCitocromo(citocromo) {
  return [
    citocromo.id,
    citocromo.nombre,
    citocromo.descripcion,
    citocromo.relevanciaClinica,
    ...citocromo.relaciones.flatMap((relacion) => [
      nombreMedicamentoCyp(relacion),
      relacion.rol,
      relacion.potencia,
      relacion.notas
    ])
  ].filter(Boolean).join(" ");
}

function renderizarGrupoCyp(citocromo, rol) {
  const relaciones = citocromo.relaciones.filter((relacion) => relacion.rol === rol);
  if (!relaciones.length) return "";
  return `<section class="cyp-role cyp-role--${escaparHTML(rol)}">
    <h4>${escaparHTML(ETIQUETA_ROL_CYP[rol] || rol)}</h4>
    <div class="cyp-medications">${relaciones.map((relacion) => `
      <span class="cyp-medication" title="${escaparHTML(relacion.notas || relacion.potencia)}">
        ${escaparHTML(nombreMedicamentoCyp(relacion))}
        ${relacion.potencia && relacion.potencia !== "no_clasificada" ? `<small>${escaparHTML(relacion.potencia.replaceAll("_", " "))}</small>` : ""}
      </span>`).join("")}</div>
  </section>`;
}

function renderizarCitocromo(citocromo) {
  return `<article class="card cyp-card">
    <header class="cyp-card__header">
      <div><h3>${escaparHTML(citocromo.nombre)}</h3><span class="tag">Relevancia ${escaparHTML(citocromo.relevanciaClinica.replaceAll("_", " "))}</span></div>
      <strong>${citocromo.relaciones.length} relaciones</strong>
    </header>
    <p>${escaparHTML(citocromo.descripcion)}</p>
    ${["sustrato", "profarmaco", "inhibidor", "inductor", "relacion_farmacogenetica"].map((rol) => renderizarGrupoCyp(citocromo, rol)).join("")}
    <p class="muted">Las relaciones predicen mecanismos posibles; la magnitud depende de dosis, vía, exposición, genotipo y contexto clínico. Confirmar en ficha técnica vigente.</p>
  </article>`;
}

function convertirDiagnosticosManuales() {
  if (modoBibliotecaPublica) return [];
  return cargarCatalogoManualDiagnosticos().map((diagnostico, index) => ({
    id: diagnostico.id || `manual-${index}-${normalizarNombreDiagnostico(diagnostico.nombre).replace(/ /g, "-")}`,
    esManual: true,
    codigoManual: diagnostico.codigo || "",
    catalogoOrigen: String(diagnostico.catalogo || "").trim() || "Sin catálogo de origen",
    nombre: diagnostico.nombre,
    categoria: diagnostico.categoria || "Otros",
    subcategoria: diagnostico.subcategoria || "Catálogo manual",
    aliases: diagnostico.aliases || [],
    sistemas: {},
    diagnosticoDiferencial: diagnostico.diagnosticoDiferencial || [],
    comorbilidades: diagnostico.comorbilidades || [],
    evaluacionClinica: diagnostico.evaluacionClinica || [],
    referencias: diagnostico.referencias || []
  }));
}

function textoBusquedaDiagnostico(diagnostico, sistemaSeleccionado = catalogoDiagnosticoActual) {
  const sistemas = sistemaSeleccionado && diagnostico.sistemas?.[sistemaSeleccionado]
    ? [diagnostico.sistemas[sistemaSeleccionado]]
    : Object.values(diagnostico.sistemas || {});
  const incluirContenidoClinico = !diagnostico.contenidoClinicoLazy;
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
    diagnostico.codigoManual,
    diagnostico.catalogoOrigen,
    ...(diagnostico.aliases || []),
    ...(incluirContenidoClinico ? [
      ...(diagnostico.diagnosticoDiferencial || []),
      ...(diagnostico.comorbilidades || []),
      ...(diagnostico.evaluacionClinica || [])
    ] : []),
    ...sistemas.flatMap((sistema) => [
      sistema.codigo,
      sistema.codigoCie10Cm,
      sistema.nombre,
      ...(sistema.criteriosLazy ? [] : (sistema.criterios || []).flatMap(textosGrupo)),
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

function obtenerDiagnosticosCatalogo(catalogo) {
  if (catalogo === "manual") return convertirDiagnosticosManuales();
  if (!SYSTEM_ORDER.includes(catalogo)) return [];
  return DIAGNOSTICOS_VALIDOS.filter((diagnostico) => Boolean(diagnostico.sistemas?.[catalogo]));
}

function obtenerCodigoDiagnostico(diagnostico, catalogo = catalogoDiagnosticoActual) {
  if (catalogo === "manual") return diagnostico.codigoManual || "";
  const sistema = diagnostico.sistemas?.[catalogo];
  return [sistema?.codigo, sistema?.codigoCie10Cm].filter(Boolean).join(" / ");
}

function obtenerCodigoPresentacionDiagnostico(diagnostico, catalogo = catalogoDiagnosticoActual) {
  if (catalogo === "manual") return diagnostico.codigoManual || "";
  const sistema = diagnostico.sistemas?.[catalogo];
  if (!sistema) return "";
  const clasificacionOficial = diagnostico.propiedadesPorFuente?.[catalogo]?.clasificacionOficial;
  const codigoBase = catalogo === "cie10"
    && clasificacionOficial?.codigoAsterisco
    && clasificacionOficial.codigoTabular
    ? clasificacionOficial.codigoTabular
    : sistema.codigo;
  return [codigoBase, sistema.codigoCie10Cm].filter(Boolean).join(" / ");
}

function compararDiagnosticosPorCodigo(diagnosticoA, diagnosticoB) {
  const codigoA = obtenerCodigoDiagnostico(diagnosticoA);
  const codigoB = obtenerCodigoDiagnostico(diagnosticoB);
  return codigoA.localeCompare(codigoB, "es", { numeric: true, sensitivity: "base" })
    || diagnosticoA.nombre.localeCompare(diagnosticoB.nombre, "es", { sensitivity: "base" });
}

function limpiarFiltrosDiagnosticos() {
  busquedasPorTab.diagnosticos = "";
  filtro = "";
  categoriaActual = "todas";
  if (buscadorBiblioteca) buscadorBiblioteca.value = "";
  if (selectorCategoria) selectorCategoria.value = "todas";
}

function etiquetaEstadoLetraCie10(letra, cantidad) {
  if (CAPITULOS_CIE10_FICHAS_COMPLETAS.has(letra)) {
    return { texto: "Completa", clase: "completa" };
  }
  if (CAPITULOS_CIE10_CODIGOS_COMPLETOS.has(letra)) {
    return { texto: "Códigos completos · fichas en revisión", clase: "revision" };
  }
  if (cantidad > 0) return { texto: "Parcial", clase: "parcial" };
  return { texto: "Pendiente", clase: "pendiente" };
}

function actualizarControlesBiblioteca() {
  const enListaDiagnosticos = tabActual === "diagnosticos"
    && Boolean(catalogoDiagnosticoActual)
    && (catalogoDiagnosticoActual !== "cie10" || Boolean(letraCie10Actual));
  const mostrarBuscador = tabActual !== "diagnosticos" || enListaDiagnosticos;
  const contenedorBuscador = buscadorBiblioteca?.closest(".buscador");
  contenedorBuscador?.classList.toggle("oculto", !mostrarBuscador);
  selectorCategoria?.classList.toggle("oculto", tabActual !== "diagnosticos" || !enListaDiagnosticos);

  if (!buscadorBiblioteca) return;
  if (tabActual === "vademecum") {
    const grupo = obtenerGruposFarmacologicos().find((item) => item.id === grupoFarmacologicoActual);
    buscadorBiblioteca.placeholder = grupo
      ? `Buscar medicamento en ${grupo.nombre}...`
      : "Buscar grupo farmacológico o medicamento...";
  } else if (tabActual === "citocromos") {
    buscadorBiblioteca.placeholder = "Buscar citocromo o medicamento relacionado...";
  } else if (catalogoDiagnosticoActual === "cie10") {
    buscadorBiblioteca.placeholder = `Buscar en CIE-10, letra ${letraCie10Actual || ""}...`;
  } else {
    buscadorBiblioteca.placeholder = `Buscar en ${catalogoDiagnosticoActual === "manual" ? "el catálogo manual" : SISTEMA_LABEL[catalogoDiagnosticoActual] || "diagnósticos"}...`;
  }
}

function enfocarYAnunciarNavegacionDiagnosticos(panel) {
  const encabezado = panel.querySelector("[data-foco-navegacion]");
  encabezado?.focus();
  const estado = document.getElementById("estadoNavegacionBiblioteca");
  if (!estado || !encabezado) return;
  const resumen = panel.querySelector(".encabezado-lista-diagnosticos > p:last-child")?.textContent?.trim();
  estado.textContent = "";
  queueMicrotask(() => {
    estado.textContent = [encabezado.textContent?.trim(), resumen].filter(Boolean).join(". ");
  });
}

function conectarNavegacionDiagnosticos(panel) {
  panel.querySelectorAll("[data-catalogo-diagnostico]").forEach((boton) => boton.addEventListener("click", () => {
    catalogoDiagnosticoActual = boton.dataset.catalogoDiagnostico;
    letraCie10Actual = null;
    limpiarFiltrosDiagnosticos();
    render();
    enfocarYAnunciarNavegacionDiagnosticos(panel);
  }));
  panel.querySelectorAll("[data-letra-cie10]").forEach((boton) => boton.addEventListener("click", () => {
    letraCie10Actual = boton.dataset.letraCie10;
    limpiarFiltrosDiagnosticos();
    render();
    enfocarYAnunciarNavegacionDiagnosticos(panel);
  }));
  panel.querySelectorAll("[data-volver-catalogos]").forEach((boton) => boton.addEventListener("click", () => {
    catalogoDiagnosticoActual = null;
    letraCie10Actual = null;
    limpiarFiltrosDiagnosticos();
    render();
    enfocarYAnunciarNavegacionDiagnosticos(panel);
  }));
  panel.querySelectorAll("[data-volver-letras]").forEach((boton) => boton.addEventListener("click", () => {
    letraCie10Actual = null;
    limpiarFiltrosDiagnosticos();
    render();
    enfocarYAnunciarNavegacionDiagnosticos(panel);
  }));
}

function renderizarSeleccionCatalogos(panel) {
  const manuales = convertirDiagnosticosManuales();
  const catalogos = CATALOGOS_DIAGNOSTICOS.map((catalogo) => ({
    ...catalogo,
    cantidad: obtenerDiagnosticosCatalogo(catalogo.id).length
  }));
  if (manuales.length) {
    catalogos.push({
      id: "manual",
      etiqueta: "Catálogo manual",
      descripcion: "Diagnósticos privados guardados localmente por el personal clínico.",
      cantidad: manuales.length
    });
  }

  panel.className = "navegacion-diagnosticos";
  panel.innerHTML = `
    <header class="encabezado-navegacion-diagnosticos">
      <p class="sobretitulo-biblioteca">Diagnósticos</p>
      <h2 tabindex="-1" data-foco-navegacion>Selecciona un catálogo</h2>
      <p>Los sistemas se consultan por separado. Las equivalencias permanecen unificadas en una sola ficha clínica.</p>
    </header>
    <div class="catalogos-diagnosticos-grid">
      ${catalogos.map((catalogo) => `
        <button type="button" class="catalogo-diagnostico-card" data-catalogo-diagnostico="${catalogo.id}">
          <span class="catalogo-diagnostico-card__nombre">${escaparHTML(catalogo.etiqueta)}</span>
          <span class="catalogo-diagnostico-card__descripcion">${escaparHTML(catalogo.descripcion)}</span>
          <span class="catalogo-diagnostico-card__cantidad">${catalogo.cantidad.toLocaleString("es-MX")} diagnósticos</span>
        </button>
      `).join("")}
    </div>`;
  poblarCategoriasBiblioteca([]);
  conectarNavegacionDiagnosticos(panel);
}

function filtrarIndiceLetrasCie10(panel, termino = "") {
  const filtroLetras = normalizarNombreDiagnostico(termino);
  const filas = [...panel.querySelectorAll("[data-fila-letra-cie10]")];
  const filtroEsLetra = /^[a-z]$/.test(filtroLetras);
  let visibles = 0;
  filas.forEach((fila) => {
    const textoBusqueda = [fila.dataset.letra, fila.dataset.rango, fila.dataset.titulo].filter(Boolean).join(" ");
    const coincideFiltro = !filtroLetras || (filtroEsLetra
      ? normalizarNombreDiagnostico(fila.dataset.letra) === filtroLetras
      : normalizarNombreDiagnostico(textoBusqueda).includes(filtroLetras));
    fila.hidden = !coincideFiltro;
    if (coincideFiltro) visibles += 1;
  });

  const resumen = panel.querySelector("[data-resumen-filtro-letras]");
  if (resumen) resumen.textContent = filtroLetras ? `${visibles} de ${filas.length} letras` : `${filas.length} letras`;
  const estadoVacio = panel.querySelector("[data-sin-resultados-letras]");
  if (estadoVacio) estadoVacio.hidden = visibles > 0;
}

function renderizarIndiceLetrasCie10(panel) {
  const diagnosticosCie10 = obtenerDiagnosticosCatalogo("cie10");
  const cantidades = new Map(LETRAS_CIE10_BIBLIOTECA.map(({ letra }) => [
    letra,
    diagnosticosCie10.filter((diagnostico) => obtenerCodigoDiagnostico(diagnostico, "cie10").toUpperCase().startsWith(letra)).length
  ]));

  panel.className = "navegacion-diagnosticos";
  panel.innerHTML = `
    <header class="encabezado-navegacion-diagnosticos">
      <button type="button" class="boton-regreso-biblioteca" data-volver-catalogos>← Volver a catálogos</button>
      <p class="sobretitulo-biblioteca">CIE-10</p>
      <h2 tabindex="-1" data-foco-navegacion>Selecciona una letra</h2>
      <p>Se muestran las 26 letras y su estado de cobertura en la base actual.</p>
    </header>
    <section class="buscador-letras-cie10" aria-labelledby="etiquetaBuscadorLetrasCie10">
      <label id="etiquetaBuscadorLetrasCie10" for="buscadorLetrasCie10">Buscar por letra, rango o título</label>
      <div class="buscador-letras-cie10__controles">
        <input id="buscadorLetrasCie10" type="search" placeholder="Ej. G, G00-G99 o sistema nervioso" autocomplete="off" spellcheck="false" aria-controls="listaLetrasCie10" aria-describedby="resumenFiltroLetrasCie10">
        <span id="resumenFiltroLetrasCie10" class="buscador-letras-cie10__resumen" data-resumen-filtro-letras role="status" aria-live="polite">${LETRAS_CIE10_BIBLIOTECA.length} letras</span>
      </div>
    </section>
    <div id="listaLetrasCie10" class="letras-cie10-lista" role="list" aria-label="Capítulos alfabéticos CIE-10">
      ${LETRAS_CIE10_BIBLIOTECA.map(({ letra, rango, titulo }) => {
        const cantidad = cantidades.get(letra) || 0;
        const estado = etiquetaEstadoLetraCie10(letra, cantidad);
        return `
          <div class="letra-cie10-fila" role="listitem" data-fila-letra-cie10 data-letra="${letra}" data-rango="${rango}" data-titulo="${escaparHTML(titulo)}">
            <button type="button" class="letra-cie10-card" data-letra-cie10="${letra}" aria-label="${letra}, ${escaparHTML(titulo)}, ${cantidad} diagnósticos, ${escaparHTML(estado.texto)}">
              <span class="letra-cie10-card__letra" aria-hidden="true">${letra}</span>
              <span class="letra-cie10-card__rango">${rango}</span>
              <span class="letra-cie10-card__titulo">${escaparHTML(titulo)}</span>
              <span class="letra-cie10-card__resumen">${cantidad.toLocaleString("es-MX")} diagnósticos</span>
              <span class="estado-cobertura estado-cobertura--${estado.clase}">${escaparHTML(estado.texto)}</span>
            </button>
          </div>`;
      }).join("")}
    </div>
    <div class="estado-vacio-biblioteca estado-vacio-letras-cie10" data-sin-resultados-letras hidden>
      <h3>Sin coincidencias</h3>
      <p>No hay letras, rangos o títulos que coincidan con la búsqueda.</p>
    </div>`;
  poblarCategoriasBiblioteca([]);
  conectarNavegacionDiagnosticos(panel);
  const buscadorLetras = panel.querySelector("#buscadorLetrasCie10");
  buscadorLetras?.addEventListener("input", () => filtrarIndiceLetrasCie10(panel, buscadorLetras.value));
  buscadorLetras?.addEventListener("keydown", (evento) => {
    if (evento.key !== "Escape" || !buscadorLetras.value) return;
    buscadorLetras.value = "";
    filtrarIndiceLetrasCie10(panel);
  });
}

function encabezadoListaDiagnosticos(totalBase, totalFiltrado) {
  const esCie10 = catalogoDiagnosticoActual === "cie10";
  const definicionLetra = esCie10
    ? LETRAS_CIE10_BIBLIOTECA.find(({ letra }) => letra === letraCie10Actual)
    : null;
  const etiquetaCatalogo = catalogoDiagnosticoActual === "manual"
    ? "Catálogo manual"
    : SISTEMA_LABEL[catalogoDiagnosticoActual] || "Diagnósticos";
  const titulo = definicionLetra
    ? `${definicionLetra.letra} · ${definicionLetra.titulo}`
    : etiquetaCatalogo;
  const ruta = definicionLetra ? `${etiquetaCatalogo} · ${definicionLetra.rango}` : etiquetaCatalogo;
  const resumen = totalFiltrado === totalBase
    ? `${totalBase.toLocaleString("es-MX")} diagnósticos`
    : `${totalFiltrado.toLocaleString("es-MX")} de ${totalBase.toLocaleString("es-MX")} diagnósticos`;
  return `
    <header class="encabezado-lista-diagnosticos">
      <div class="acciones-ruta-biblioteca">
        <button type="button" class="boton-regreso-biblioteca" data-volver-catalogos>← Catálogos</button>
        ${esCie10 ? `<button type="button" class="boton-regreso-biblioteca" data-volver-letras>← Letras A-Z</button>` : ""}
      </div>
      <p class="sobretitulo-biblioteca">${escaparHTML(ruta)}</p>
      <h2 tabindex="-1" data-foco-navegacion>${escaparHTML(titulo)}</h2>
      <p>${resumen}</p>
    </header>`;
}

function renderizarListaDiagnosticos(panel) {
  if (catalogoDiagnosticoActual === "manual" && (modoBibliotecaPublica || !convertirDiagnosticosManuales().length)) {
    catalogoDiagnosticoActual = null;
    renderizarSeleccionCatalogos(panel);
    return;
  }

  let base = obtenerDiagnosticosCatalogo(catalogoDiagnosticoActual);
  if (catalogoDiagnosticoActual === "cie10") {
    base = base.filter((diagnostico) => obtenerCodigoDiagnostico(diagnostico, "cie10").toUpperCase().startsWith(letraCie10Actual));
  }
  poblarCategoriasBiblioteca(base);
  const filtradas = base
    .filter((diagnostico) => diagnostico.categoria === categoriaActual || categoriaActual === "todas")
    .filter((diagnostico) => !filtro || coincide(textoBusquedaDiagnostico(diagnostico)))
    .sort(compararDiagnosticosPorCodigo);

  diagnosticosFiltradosActuales = filtradas;
  diagnosticosRenderizados = 0;
  panel.className = "diagnosticos-lista";
  panel.innerHTML = encabezadoListaDiagnosticos(base.length, filtradas.length);
  if (!filtradas.length) {
    const mensaje = base.length
      ? "No hay coincidencias con los filtros actuales."
      : "Esta letra todavía no tiene diagnósticos cargados en la base actual.";
    panel.insertAdjacentHTML("beforeend", `<div class="estado-vacio-biblioteca"><h3>Sin resultados</h3><p>${mensaje}</p></div>`);
  }
  conectarNavegacionDiagnosticos(panel);
  if (filtradas.length) anexarSiguienteLoteDiagnosticos(panel);
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
  if (!datos) return "";
  const codigo = obtenerCodigoPresentacionDiagnostico(diagnostico, sistema);
  const panelId = `${diagnostico.id}-${sistema}-criterios`.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `
    <section class="sistema-diagnostico" data-sistema="${sistema}">
      <button type="button" class="sistema-toggle-button" data-sistema-toggle="${sistema}" aria-expanded="false" aria-controls="${panelId}">
        <span aria-hidden="true">▶</span> ${SISTEMA_LABEL[sistema]} <span class="codigo-diagnostico">${escaparHTML(codigo)}</span>
      </button>
      <div id="${panelId}" class="sistema-diagnostico__panel" data-sistema-panel="${sistema}" hidden></div>
    </section>`;
}

const ETIQUETAS_VALORES_FARMACOLOGICOS = Object.freeze({
  contraindicacion: "Contraindicación",
  precaucion_vigilancia: "Precaución / vigilancia",
  critica: "Crítica",
  alta: "Alta",
  moderada: "Moderada",
  baja: "Baja",
  no_especificada: "No especificada"
});

function etiquetaValorFarmacologico(valor, respaldo = "No especificado") {
  const clave = String(valor || "").trim().toLowerCase();
  if (ETIQUETAS_VALORES_FARMACOLOGICOS[clave]) return ETIQUETAS_VALORES_FARMACOLOGICOS[clave];
  const texto = String(valor || "").trim().replaceAll("_", " ");
  return texto ? `${texto.charAt(0).toUpperCase()}${texto.slice(1)}` : respaldo;
}

function renderizarDatoReglaFarmacologica(etiqueta, valor, respaldo = "No especificado") {
  return `<div><dt>${escaparHTML(etiqueta)}</dt><dd>${escaparHTML(valor || respaldo)}</dd></div>`;
}

function renderizarListaReglaFarmacologica(etiqueta, valores, respaldo) {
  const lista = Array.isArray(valores) ? valores.filter(Boolean) : (valores ? [valores] : []);
  return `<section class="regla-farmacologica__lista"><h5>${escaparHTML(etiqueta)}</h5>${lista.length
    ? `<ul>${lista.map((valor) => `<li>${escaparHTML(valor)}</li>`).join("")}</ul>`
    : `<p>${escaparHTML(respaldo)}</p>`}</section>`;
}

function renderizarReglaFarmacologica(regla = {}) {
  const permiteOverride = regla.permiteOverride === false
    ? "No"
    : regla.permiteOverride === true
      ? "Sí"
      : "No especificado";
  const requiereJustificacion = regla.requiereJustificacion === true
    ? "Sí"
    : regla.requiereJustificacion === false
      ? "No"
      : "No especificado";
  return `<article class="regla-farmacologica">
    <h4>${escaparHTML(regla.titulo || "Regla farmacológica")}</h4>
    <dl class="regla-farmacologica__datos">
      ${renderizarDatoReglaFarmacologica("Tipo", etiquetaValorFarmacologico(regla.tipo))}
      ${renderizarDatoReglaFarmacologica("Severidad", etiquetaValorFarmacologico(regla.severidad))}
      ${renderizarDatoReglaFarmacologica("Mecanismo", regla.mecanismo)}
      ${renderizarDatoReglaFarmacologica("Efecto clínico", regla.efecto)}
      ${renderizarDatoReglaFarmacologica("Recomendación", regla.recomendacion)}
      ${renderizarDatoReglaFarmacologica("Evidencia", etiquetaValorFarmacologico(regla.evidencia, "Fuente pendiente"), "Fuente pendiente")}
      ${renderizarDatoReglaFarmacologica("Confianza", etiquetaValorFarmacologico(regla.confianza))}
      ${renderizarDatoReglaFarmacologica("Permite omitir la alerta", permiteOverride)}
      ${renderizarDatoReglaFarmacologica("Requiere justificación", requiereJustificacion)}
    </dl>
    ${renderizarListaReglaFarmacologica("Vigilancia sugerida", regla.parametrosVigilancia || regla.vigilancia, "Sin parámetros de vigilancia cargados para esta regla.")}
    ${renderizarListaReglaFarmacologica("Fuentes", regla.fuentes, "Fuente pendiente")}
  </article>`;
}

function renderizarFarmacologiaDiagnostico(diagnostico) {
  const farmacologia = diagnostico.farmacologia;
  if (!farmacologia) return "";
  const reglas = farmacologia.reglas || [];
  const recomendacionesPrevias = farmacologia.recomendacionesCatalogoPrevio;
  const listaReglas = reglas.length
    ? `<div class="reglas-farmacologicas">${reglas.map(renderizarReglaFarmacologica).join("")}</div>`
    : `<p>${escaparHTML(farmacologia.notaCobertura || "Sin regla medicamento-diagnóstico específica cargada.")}</p>`;
  return `<details class="grupo-criterios contenido-diagnostico">
    <summary>Seguridad farmacológica</summary>
    ${listaReglas}
    ${reglas.length && farmacologia.notaCobertura ? `<p class="regla-farmacologica__cobertura"><strong>Cobertura:</strong> ${escaparHTML(farmacologia.notaCobertura)}</p>` : ""}
    ${recomendacionesPrevias ? `<p>${escaparHTML(typeof recomendacionesPrevias === "string" ? recomendacionesPrevias : JSON.stringify(recomendacionesPrevias))}</p>` : ""}
  </details>`;
}

function renderizarDetallesDiagnostico(diagnostico, detalles) {
  if (diagnostico.esManual) {
    detalles.innerHTML = `<p><strong>Catálogo de origen:</strong> ${escaparHTML(diagnostico.catalogoOrigen)}</p>${listaResumen("Evaluación clínica", diagnostico.evaluacionClinica)}${listaResumen("Comorbilidades", diagnostico.comorbilidades)}${listaResumen("Diagnóstico diferencial", diagnostico.diagnosticoDiferencial)}${listaResumen("Referencias", diagnostico.referencias)}<p class="aviso-clinico-biblioteca">Registro manual privado. Verifica su contenido y fuente antes de usarlo como apoyo clínico.</p>`;
    detalles.dataset.rendered = "true";
    return;
  }
  const sistemaSeleccionado = SYSTEM_ORDER.includes(catalogoDiagnosticoActual) ? catalogoDiagnosticoActual : null;
  const sistemas = sistemaSeleccionado ? renderizarSistemaAcordeon(diagnostico, sistemaSeleccionado) : "";
  const diferencial = diagnostico.diagnosticoDiferencial?.length ? listaResumen("Diagnóstico diferencial", diagnostico.diagnosticoDiferencial) : "";
  detalles.innerHTML = `${sistemas || `<p class="criterios-vacios">No hay información estructurada para el catálogo seleccionado.</p>`}${renderizarFarmacologiaDiagnostico(diagnostico)}${diferencial}<p class="aviso-clinico-biblioteca">Los criterios son una herramienta de apoyo y deben integrarse con la entrevista clínica, antecedentes, exploración mental, evolución y juicio profesional.</p>`;
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
  const datosSistema = diagnostico.sistemas?.[catalogoDiagnosticoActual];
  const nombre = datosSistema?.nombre || diagnostico.nombre;
  const codigo = obtenerCodigoPresentacionDiagnostico(diagnostico);
  const etiquetaCatalogo = catalogoDiagnosticoActual === "manual"
    ? `Catálogo manual · origen ${diagnostico.catalogoOrigen}`
    : SISTEMA_LABEL[catalogoDiagnosticoActual];
  const codigos = [etiquetaCatalogo, codigo].filter(Boolean).join(" · ");
  const panelId = `${diagnostico.id}-detalle`.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `<article class="diagnostico-row" data-diagnostico-id="${escaparHTML(diagnostico.id)}">
    <header class="diagnostico-row__summary">
      <div class="diagnostico-row__main">
        <h3>${escaparHTML(nombre)}</h3>
        <p>${escaparHTML(diagnostico.descripcionBreve || "Descripción clínica no disponible.")}</p>
        <span class="tag diagnostico-row__category">${escaparHTML(diagnostico.categoria || "Sin categoría")}</span>
      </div>
      <div class="diagnostico-row__codes">${codigos ? escaparHTML(codigos) : "Sin código registrado"}</div>
      <button type="button" class="diagnostico-row__toggle" data-diagnostico-toggle aria-expanded="false" aria-controls="${panelId}">Ver criterios</button>
    </header>
    <section id="${panelId}" class="diagnostico-row__details" data-diagnostico-details hidden></section>
  </article>`;
}

function conectarAcordeonesDiagnosticos(panel) {
  panel.querySelectorAll("[data-diagnostico-toggle]").forEach((boton) => {
    if (boton.dataset.listenerDiagnostico === "true") return;
    boton.dataset.listenerDiagnostico = "true";
    boton.addEventListener("click", () => {
      const fila = boton.closest("[data-diagnostico-id]");
      const detalles = fila.querySelector("[data-diagnostico-details]");
      const diagnostico = diagnosticosPorId.get(fila.dataset.diagnosticoId) || convertirDiagnosticosManuales().find((item) => item.id === fila.dataset.diagnosticoId);
      const abierto = boton.getAttribute("aria-expanded") === "true";
      boton.setAttribute("aria-expanded", String(!abierto));
      boton.textContent = abierto ? "Ver criterios" : "Ocultar criterios";
      detalles.hidden = abierto;
      if (!abierto && !detalles.dataset.rendered && diagnostico) renderizarDetallesDiagnostico(diagnostico, detalles);
    });
  });
}

function anexarSiguienteLoteDiagnosticos(panel) {
  observadorCargaDiagnosticos?.disconnect();
  panel.querySelector("[data-diagnosticos-sentinel]")?.remove();
  const inicio = diagnosticosRenderizados;
  const fin = Math.min(inicio + TAMANO_LOTE_DIAGNOSTICOS, diagnosticosFiltradosActuales.length);
  if (fin <= inicio) return;

  const plantilla = document.createElement("template");
  plantilla.innerHTML = diagnosticosFiltradosActuales.slice(inicio, fin).map(renderizarDiagnostico).join("");
  panel.appendChild(plantilla.content);
  diagnosticosRenderizados = fin;
  conectarAcordeonesDiagnosticos(panel);

  if (diagnosticosRenderizados >= diagnosticosFiltradosActuales.length) return;
  const sentinel = document.createElement("div");
  sentinel.dataset.diagnosticosSentinel = "true";
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.style.height = "1px";
  panel.appendChild(sentinel);

  if ("IntersectionObserver" in window) {
    observadorCargaDiagnosticos = new IntersectionObserver((entradas) => {
      if (entradas.some((entrada) => entrada.isIntersecting)) anexarSiguienteLoteDiagnosticos(panel);
    }, { rootMargin: "500px 0px" });
    observadorCargaDiagnosticos.observe(sentinel);
    return;
  }

  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "boton-secundario";
  boton.dataset.diagnosticosSentinel = "true";
  boton.textContent = "Mostrar más diagnósticos";
  boton.addEventListener("click", () => anexarSiguienteLoteDiagnosticos(panel));
  sentinel.replaceWith(boton);
}

function enfocarYAnunciarNavegacionVademecum(panel) {
  const encabezado = panel.querySelector("[data-foco-navegacion]");
  encabezado?.focus();
  const estado = document.getElementById("estadoNavegacionBiblioteca");
  if (!estado || !encabezado) return;
  const resumen = encabezado.closest("header")?.querySelector("p:last-child")?.textContent?.trim();
  estado.textContent = "";
  queueMicrotask(() => {
    estado.textContent = [encabezado.textContent?.trim(), resumen].filter(Boolean).join(". ");
  });
}

function conectarNavegacionVademecum(panel) {
  panel.querySelectorAll("[data-grupo-farmacologico]").forEach((boton) => boton.addEventListener("click", () => {
    grupoFarmacologicoActual = boton.dataset.grupoFarmacologico;
    render();
    enfocarYAnunciarNavegacionVademecum(panel);
  }));
  panel.querySelectorAll("[data-volver-grupos-farmacologicos]").forEach((boton) => boton.addEventListener("click", () => {
    grupoFarmacologicoActual = null;
    render();
    enfocarYAnunciarNavegacionVademecum(panel);
  }));
}

function renderizarIndiceGruposFarmacologicos(panel) {
  const grupos = obtenerGruposFarmacologicos();
  const visibles = grupos.filter((grupo) => coincide(textoBusquedaGrupoFarmacologico(grupo)));
  const resumen = visibles.length === grupos.length
    ? `${grupos.length.toLocaleString("es-MX")} grupos · ${MEDICAMENTOS_MAESTROS.length.toLocaleString("es-MX")} medicamentos`
    : `${visibles.length.toLocaleString("es-MX")} de ${grupos.length.toLocaleString("es-MX")} grupos`;
  panel.className = "navegacion-diagnosticos navegacion-grupos-farmacologicos";
  panel.innerHTML = `
    <header class="encabezado-navegacion-diagnosticos">
      <p class="sobretitulo-biblioteca">Tratamientos</p>
      <h2 tabindex="-1" data-foco-navegacion>Selecciona un grupo farmacológico</h2>
      <p>${resumen}. Cada medicamento conserva la ficha del catálogo farmacológico maestro.</p>
    </header>
    ${visibles.length ? `
      <div class="grupos-farmacologicos-lista" role="list" aria-label="Grupos farmacológicos">
        ${visibles.map((grupo) => {
          const cobertura = estadoCoberturaGrupoFarmacologico(grupo);
          const inicial = grupo.nombre.trim().charAt(0).toUpperCase() || "?";
          const detalleCobertura = `${cobertura.verificados} verificadas · ${cobertura.parciales} parciales · ${cobertura.pendientes} pendientes`;
          return `<div class="grupo-farmacologico-fila" role="listitem">
            <button type="button" class="grupo-farmacologico-card" data-grupo-farmacologico="${escaparHTML(grupo.id)}" aria-label="${escaparHTML(grupo.nombre)}, ${grupo.medicamentos.length} medicamentos, ${escaparHTML(cobertura.texto)}">
              <span class="grupo-farmacologico-card__inicial" aria-hidden="true">${escaparHTML(inicial)}</span>
              <span class="grupo-farmacologico-card__nombre">${escaparHTML(grupo.nombre)}</span>
              <span class="grupo-farmacologico-card__cantidad">${grupo.medicamentos.length.toLocaleString("es-MX")} medicamento${grupo.medicamentos.length === 1 ? "" : "s"}</span>
              <span class="estado-cobertura estado-cobertura--${cobertura.clase}" title="${escaparHTML(detalleCobertura)}">${escaparHTML(cobertura.texto)}</span>
              <span class="grupo-farmacologico-card__flecha" aria-hidden="true">›</span>
            </button>
          </div>`;
        }).join("")}
      </div>`
      : `<div class="estado-vacio-biblioteca"><h3>Sin coincidencias</h3><p>No hay grupos o medicamentos relacionados con “${escaparHTML(busquedasPorTab.vademecum || "")}”.</p></div>`}`;
  poblarCategoriasBiblioteca([]);
  conectarNavegacionVademecum(panel);
}

function estadoFuenteMedicamento(medicamento = {}) {
  if (medicamento.estadoFuente === "verificada_local") return { texto: "Fuente verificada", clase: "completa" };
  if (medicamento.estadoFuente === "fuente_regulatoria_parcial") return { texto: "Fuente parcial", clase: "revision" };
  return { texto: "Fuente pendiente", clase: "pendiente" };
}

function renderizarDetallesMedicamento(medicamento, detalles) {
  const presentaciones = medicamento.presentaciones || [];
  const presentacionesVisibles = presentaciones.slice(0, 8).map((presentacion) => presentacion.texto).filter(Boolean);
  const presentacionesRestantes = Math.max(0, presentaciones.length - presentacionesVisibles.length);
  const fuente = medicamento.fuente || "Fuente pendiente";
  const paginaSeccion = medicamento.paginaSeccion && medicamento.paginaSeccion !== "fuente pendiente"
    ? medicamento.paginaSeccion
    : "Página o sección pendiente";
  detalles.innerHTML = `
    <div class="medicamento-ficha-grid">
      <p><strong>Dosis habitual:</strong> ${escaparHTML(medicamento.dosisHabitual || "Dato no encontrado en fuente local")}</p>
      ${medicamento.brandNames?.length ? `<p><strong>Marcas comerciales:</strong> ${escaparHTML(medicamento.brandNames.slice(0, 8).join(", "))}</p>` : ""}
      <p><strong>Presentaciones:</strong> ${presentacionesVisibles.length ? escaparHTML(presentacionesVisibles.join("; ")) : "Sin presentaciones cargadas"}${presentacionesRestantes ? `; +${presentacionesRestantes} más` : ""}</p>
      ${medicamento.especialidades?.length ? `<p><strong>Áreas:</strong> ${escaparHTML(medicamento.especialidades.join(", "))}</p>` : ""}
      ${medicamento.mecanismoAccion ? `<p><strong>Mecanismo de acción:</strong> ${escaparHTML(medicamento.mecanismoAccion)}</p>` : ""}
      ${medicamento.vidaMedia ? `<p><strong>Vida media:</strong> ${escaparHTML(medicamento.vidaMedia)}</p>` : ""}
      ${medicamento.metabolismo ? `<p><strong>Metabolismo:</strong> ${escaparHTML(medicamento.metabolismo)}</p>` : ""}
      ${medicamento.cyp?.length ? `<p><strong>CYP:</strong> ${escaparHTML(medicamento.cyp.join(", "))}</p>` : ""}
      ${listaResumen("Indicaciones", medicamento.indicaciones || medicamento.indications)}
      ${listaResumen("Contraindicaciones", medicamento.contraindicaciones || medicamento.contraindications)}
      ${listaResumen("Tener precaución en", medicamento.precauciones || medicamento.precautions)}
      ${listaResumen("Efectos adversos frecuentes o relevantes", medicamento.efectosAdversos)}
      ${medicamento.monitoring?.length ? `<p><strong>Monitoreo:</strong> ${escaparHTML(medicamento.monitoring.slice(0, 6).join(", "))}</p>` : ""}
      ${medicamento.notas ? `<p>${escaparHTML(medicamento.notas)}</p>` : ""}
      <div class="medicamento-fuente">
        <p><strong>Fuente:</strong> ${escaparHTML(fuente)}</p>
        <p><strong>Página/sección:</strong> ${escaparHTML(paginaSeccion)}</p>
        ${medicamento.confianza ? `<p><strong>Confianza:</strong> ${escaparHTML(medicamento.confianza)}</p>` : ""}
      </div>
      <p class="aviso-clinico-biblioteca">Contenido de apoyo clínico. Validar contra ficha técnica, protocolos locales y juicio profesional.</p>
    </div>`;
  detalles.dataset.rendered = "true";
}

function renderizarMedicamentoVademecum(medicamento) {
  const panelId = `medicamento-${medicamento.id}-detalle`.replace(/[^a-zA-Z0-9_-]/g, "-");
  const estadoFuente = estadoFuenteMedicamento(medicamento);
  const presentaciones = medicamento.presentaciones?.length || 0;
  return `<article class="diagnostico-row medicamento-row" data-medicamento-id="${escaparHTML(medicamento.id)}">
    <header class="diagnostico-row__summary medicamento-row__summary">
      <div class="diagnostico-row__main medicamento-row__main">
        <h3>${escaparHTML(medicamento.nombre)}</h3>
        <p>${escaparHTML(medicamento.genericName || medicamento.nombre)}</p>
        <span class="tag diagnostico-row__category">${escaparHTML(etiquetaGrupoFarmacologico(medicamento))}</span>
      </div>
      <div class="diagnostico-row__codes medicamento-row__resumen">
        <span>${presentaciones.toLocaleString("es-MX")} presentación${presentaciones === 1 ? "" : "es"}</span>
        <span>${escaparHTML(medicamento.dosisHabitual || "Dosis pendiente")}</span>
        <span class="estado-cobertura estado-cobertura--${estadoFuente.clase}">${escaparHTML(estadoFuente.texto)}</span>
      </div>
      <button type="button" class="diagnostico-row__toggle" data-medicamento-toggle aria-expanded="false" aria-controls="${panelId}">Ver ficha</button>
    </header>
    <section id="${panelId}" class="diagnostico-row__details medicamento-row__details" data-medicamento-details hidden></section>
  </article>`;
}

function conectarAcordeonesMedicamentos(panel) {
  panel.querySelectorAll("[data-medicamento-toggle]").forEach((boton) => boton.addEventListener("click", () => {
    const fila = boton.closest("[data-medicamento-id]");
    const detalles = fila.querySelector("[data-medicamento-details]");
    const medicamento = MEDICAMENTOS_BIBLIOTECA_POR_ID.get(fila.dataset.medicamentoId);
    const abierto = boton.getAttribute("aria-expanded") === "true";
    boton.setAttribute("aria-expanded", String(!abierto));
    boton.textContent = abierto ? "Ver ficha" : "Ocultar ficha";
    detalles.hidden = abierto;
    if (!abierto && !detalles.dataset.rendered && medicamento) renderizarDetallesMedicamento(medicamento, detalles);
  }));
}

function renderizarListaMedicamentosGrupo(panel) {
  const grupos = obtenerGruposFarmacologicos();
  const grupo = grupos.find((item) => item.id === grupoFarmacologicoActual);
  if (!grupo) {
    grupoFarmacologicoActual = null;
    renderizarIndiceGruposFarmacologicos(panel);
    return;
  }
  const medicamentos = grupo.medicamentos.filter((medicamento) => coincide(textoMedicamentoParaBusqueda(medicamento)));
  const cobertura = estadoCoberturaGrupoFarmacologico(grupo);
  const resumen = medicamentos.length === grupo.medicamentos.length
    ? `${grupo.medicamentos.length.toLocaleString("es-MX")} medicamentos`
    : `${medicamentos.length.toLocaleString("es-MX")} de ${grupo.medicamentos.length.toLocaleString("es-MX")} medicamentos`;
  panel.className = "diagnosticos-lista medicamentos-lista";
  panel.innerHTML = `
    <header class="encabezado-lista-diagnosticos encabezado-lista-medicamentos">
      <div class="acciones-ruta-biblioteca">
        <button type="button" class="boton-regreso-biblioteca" data-volver-grupos-farmacologicos>← Grupos farmacológicos</button>
      </div>
      <p class="sobretitulo-biblioteca">Tratamientos · ${escaparHTML(grupo.nombre)}</p>
      <h2 tabindex="-1" data-foco-navegacion>${escaparHTML(grupo.nombre)}</h2>
      <p>${resumen} · <span class="estado-cobertura estado-cobertura--${cobertura.clase}">${escaparHTML(cobertura.texto)}</span></p>
    </header>
    ${medicamentos.length
      ? medicamentos.map(renderizarMedicamentoVademecum).join("")
      : `<div class="estado-vacio-biblioteca"><h3>Sin resultados</h3><p>No hay medicamentos del grupo que coincidan con la búsqueda actual.</p></div>`}`;
  poblarCategoriasBiblioteca([]);
  conectarNavegacionVademecum(panel);
  conectarAcordeonesMedicamentos(panel);
}

function render() {
  const panel = document.getElementById("panelBiblioteca");
  observadorCargaDiagnosticos?.disconnect();
  actualizarControlesBiblioteca();
  panel.className = tabActual === "diagnosticos" ? "diagnosticos-lista" : "grid";
  if (tabActual === "citocromos") {
    panel.className = "cyp-grid";
    const resultados = CITOCROMOS_FARMACOLOGICOS.filter((citocromo) => coincide(textoBusquedaCitocromo(citocromo)));
    panel.innerHTML = resultados.length
      ? `<article class="card cyp-intro"><h2>Citocromos P450 y medicamentos</h2><p>Consulta por enzima o medicamento. Los fármacos se resuelven desde el catálogo farmacológico maestro; este módulo solo conserva sus relaciones de metabolismo, inhibición e inducción.</p><p class="muted">Cobertura de isoenzimas humanas relevantes para farmacología clínica. Las enzimas regulatorias principales cuentan con mayor evidencia clínica; las relaciones limitadas, emergentes o in vitro se identifican expresamente.</p></article>${resultados.map(renderizarCitocromo).join("")}`
      : `<article class="card"><h3>Sin coincidencias</h3><p>No se encontró un citocromo o medicamento relacionado con “${escaparHTML(filtro)}”.</p></article>`;
    return;
  }
  if (tabActual === "vademecum") {
    if (grupoFarmacologicoActual) renderizarListaMedicamentosGrupo(panel);
    else renderizarIndiceGruposFarmacologicos(panel);
    return;
  }

  if (!catalogoDiagnosticoActual) {
    renderizarSeleccionCatalogos(panel);
    return;
  }
  if (catalogoDiagnosticoActual === "cie10" && !letraCie10Actual) {
    renderizarIndiceLetrasCie10(panel);
    return;
  }
  if (![...SYSTEM_ORDER, "manual"].includes(catalogoDiagnosticoActual)) {
    catalogoDiagnosticoActual = null;
    renderizarSeleccionCatalogos(panel);
    return;
  }
  renderizarListaDiagnosticos(panel);
}
